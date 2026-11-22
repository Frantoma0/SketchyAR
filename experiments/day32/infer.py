#!/usr/bin/env python3
"""Explicit local inference adapters for the SketchyAR Day32 comparison.

Optional heavyweight installs, model downloads and GPU runtime are NEVER
performed by the app or this script implicitly. You choose dependencies,
weights, device, and invoke inference on your own computer. No image is
uploaded by this script; Hugging Face may download model weights on first use.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from time import perf_counter

from PIL import Image

from bench import PROFILES, digest_file, json_write, load_manifest

MODEL_INFO = {
    'qwen21_turbo': ('Qwen/Qwen-Image-2.1-Turbo', 'Qwen Research License; research/evaluation only'),
    'qwen_edit2511': ('Qwen/Qwen-Image-Edit-2511', 'Apache-2.0 for base checkpoint; inspect adapters separately'),
    'animeganv3': ('AnimeGANv3 ONNX: user supplied', 'Non-commercial research license'),
}

# Identical for the two prompt-based image editors; ANIMEGAN is a fixed-style
# neural model and cannot obey this text prompt. The distinction is recorded.
PROMPT = (
    'Redraw the provided photograph as an original Japanese black-and-white manga illustration. '
    'This must be an actual artistic redraw, not a grayscale or contrast filter. '
    'Use expressive but recognizable eyes and facial geometry, stylized clean hair strands, '
    'precise black ink contours, white paper, selective hatching and fine sparse screentone. '
    'Keep the same people, animals, pose, expression, clothing, accessories, camera angle, '
    'object count and scene layout. Do not add or remove objects; no crop, captions, text, '
    'speech bubbles, panel borders, symbols or logos. Retain identity and silhouette. '
    'Avoid large solid black clothing regions unless meaningful to the illustration.'
)


def _run_onnx(path: Path, model: Path, device: str, max_side: int):
    import numpy as np
    import onnxruntime as ort
    if not model.exists() or not model.is_file():
        raise ValueError(f'ONNX model not found: {model}')
    available = ort.get_available_providers()
    if device == 'cuda' and 'CUDAExecutionProvider' not in available:
        raise ValueError('CUDAExecutionProvider missing; install onnxruntime-gpu or choose --device cpu')
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == 'cuda' else ['CPUExecutionProvider']
    session = ort.InferenceSession(str(model), providers=providers)
    if session.get_providers()[0] != providers[0]:
        raise ValueError('ONNX requested provider unavailable')
    with Image.open(path) as im:
        src = im.convert('RGB')
        original_wh = src.size
    w, h = original_wh
    scale = min(1, max_side / max(w, h))
    # Official AnimeGANv3 ONNX expects spatial multiples 8, tiny models 16.
    step = 16 if 'tiny' in model.name.lower() else 8
    target = (max(256, int(w*scale)//step*step), max(256, int(h*scale)//step*step))
    arr = np.asarray(src.resize(target, Image.Resampling.BICUBIC), dtype=np.float32)
    arr = np.expand_dims(arr / 127.5 - 1.0, 0)
    input0 = session.get_inputs()[0]
    if len(input0.shape) != 4:
        raise ValueError('AnimeGANv3 ONNX should have rank-4 input; unexpected checkpoint')
    if input0.shape[-1] == 3 or input0.shape[-1] == '3' or input0.shape[-1] is None:
        tensor = arr
    elif input0.shape[1] == 3 or input0.shape[1] == '3':
        tensor = arr.transpose(0, 3, 1, 2)
    else:
        raise ValueError('Cannot determine NHWC/NCHW layout for model input')
    output = session.run(None, {input0.name: tensor})[0]
    result = np.asarray(output)
    if result.ndim != 4 or result.shape[0] != 1:
        raise ValueError('Unexpected ONNX output shape')
    result = result[0]
    if result.shape[0] == 3 and result.shape[-1] != 3:
        result = result.transpose(1, 2, 0)
    if result.shape[-1] != 3:
        raise ValueError('Expected 3 RGB output channels from AnimeGANv3')
    out = Image.fromarray(np.clip((result + 1.0) * 127.5, 0, 255).astype('uint8'), 'RGB')
    return out.resize(original_wh, Image.Resampling.LANCZOS)


def _run_qwen21(path: Path, seed: int):
    import torch
    from diffusers import QwenImage21Pipeline
    if not torch.cuda.is_available():
        raise ValueError('Qwen-Image-2.1-Turbo experimental adapter needs a CUDA GPU')
    pipe = _CACHED.get('qwen21_turbo')
    if pipe is None:
        pipe = QwenImage21Pipeline.from_pretrained('Qwen/Qwen-Image-2.1-Turbo', dtype=torch.bfloat16).to('cuda')
        _CACHED['qwen21_turbo'] = pipe
    with Image.open(path) as im:
        img = im.convert('RGBA')
    # Use the official Turbo saved 8-step schedule: do NOT override sigma/steps.
    with torch.inference_mode():
        return pipe(prompt=PROMPT, image=img, use_kv_cache=True,
                    generator=torch.Generator('cpu').manual_seed(seed)).images[0].convert('RGB')


def _run_qwen2511(path: Path, seed: int):
    import torch
    from diffusers import QwenImageEditPlusPipeline
    if not torch.cuda.is_available():
        raise ValueError('Qwen-Image-Edit-2511 experimental adapter needs a CUDA GPU')
    pipe = _CACHED.get('qwen_edit2511')
    if pipe is None:
        pipe = QwenImageEditPlusPipeline.from_pretrained('Qwen/Qwen-Image-Edit-2511',
                                                       torch_dtype=torch.bfloat16).to('cuda')
        _CACHED['qwen_edit2511'] = pipe
    with Image.open(path) as im:
        image = im.convert('RGB')
    with torch.inference_mode():
        return pipe(image=[image], prompt=PROMPT, generator=torch.Generator('cpu').manual_seed(seed),
                    num_inference_steps=40, true_cfg_scale=4.0, guidance_scale=1.0,
                    negative_prompt=' ', num_images_per_prompt=1).images[0].convert('RGB')


_CACHED: dict = {}


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', required=True, help='Private Day32 prepared dataset directory')
    p.add_argument('--engine', required=True, choices=PROFILES)
    p.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    p.add_argument('--onnx-model', help='Required for animeganv3; supply your licensed ONNX file')
    p.add_argument('--max-side', type=int, default=768, help='AnimeGANv3 ONNX working max side')
    p.add_argument('--seed', type=int, default=32)
    p.add_argument('--limit', type=int, default=0, help='0=all; use 1 for smoke run')
    p.add_argument('--dry-run', action='store_true', help='Print exact job plan, no model downloads')
    args = p.parse_args(argv)
    root = Path(args.project).expanduser().resolve()
    manifest = load_manifest(root)
    if args.max_side < 256 or args.max_side > 2048 or args.seed < 0 or args.seed >= 2**32:
        raise ValueError('Invalid size or seed')
    if args.engine == 'animeganv3' and not args.onnx_model and not args.dry_run:
        raise ValueError('--onnx-model is required for animeganv3')
    # No unrequested network contact: HuggingFace may download weights when not cached,
    # but only after the user calls this explicit infer action.
    cases = manifest['cases'][:args.limit] if args.limit else manifest['cases']
    for c in cases:
        cid = c['id']
        inp = root / 'sources' / f'{cid}.png'
        if digest_file(inp) != c['source_sha256']:
            raise ValueError(f'Input provenance changed for {cid}')
        dest = root / 'outputs' / args.engine / f'{cid}.png'
        if dest.exists():
            print(f'SKIP: {dest} exists; results never overwritten')
            continue
        if args.dry_run:
            print(f'PENDING: {cid} -> {dest}, engine={args.engine}, device={args.device}')
            continue
        t0 = perf_counter()
        if args.engine == 'animeganv3':
            image = _run_onnx(inp, Path(args.onnx_model).expanduser().resolve(), args.device, args.max_side)
        elif args.engine == 'qwen21_turbo':
            if args.device != 'cuda':
                raise ValueError('Qwen 2.1 Turbo requires --device cuda')
            image = _run_qwen21(inp, args.seed)
        else:
            if args.device != 'cuda':
                raise ValueError('Qwen Edit 2511 requires --device cuda')
            image = _run_qwen2511(inp, args.seed)
        runtime_ms = round((perf_counter() - t0) * 1000, 2)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix('.partial.png')
        image.save(temp, format='PNG')
        temp.replace(dest)
        json_write(dest.with_suffix('.json'), {
            'schema': 'sketchyar-day32-inference-v1', 'case_id': cid,
            'source_sha256': c['source_sha256'], 'output_sha256': digest_file(dest),
            'engine': args.engine, 'model_id': MODEL_INFO[args.engine][0],
            'license_note': MODEL_INFO[args.engine][1], 'device_requested': args.device,
            'onnx_weights_sha256': digest_file(Path(args.onnx_model).expanduser().resolve()) if args.engine == 'animeganv3' else None,
            'seed': None if args.engine == 'animeganv3' else args.seed,
            'prompt': None if args.engine == 'animeganv3' else PROMPT,
            'runtime_ms': runtime_ms, 'created_utc': datetime.now(timezone.utc).isoformat(),
            'torch_version': str(__import__('torch').__version__) if args.engine != 'animeganv3' else None,
            'diffusers_version': str(__import__('diffusers').__version__) if args.engine != 'animeganv3' else None,
            'cold_start_or_first_inference': cid == cases[0]['id'],
            'onnxruntime_version': __import__('onnxruntime').__version__ if args.engine == 'animeganv3' else None,
        })
        print(f'OK {args.engine}/{cid}: {runtime_ms:.0f} ms (desktop runtime, not iPhone)')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileNotFoundError, OSError, ImportError) as e:
        print('ERROR:', e, file=sys.stderr)
        sys.exit(2)
