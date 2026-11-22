#!/usr/bin/env python3
"""SketchyAR Day 32 - local, privacy-preserving photo->manga experiment.

CLI deliberately never contacts a server. Inference is a separate explicit action
in infer.py; no pretrained model or generated results are represented as measured
until output images really exist. All raw input/output paths stay ignored by Git.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from hashlib import sha256
import html
import base64
import io
import json
from pathlib import Path
import random
import sys
from time import perf_counter

import numpy as np
from PIL import Image, ImageOps

PROFILES = ('qwen21_turbo', 'qwen_edit2511', 'animeganv3')
BASELINE = 'day31_v1'
ALL_MODELS = (BASELINE, *PROFILES)
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}
CATEGORIES = ('portrait', 'group', 'animal', 'landscape', 'object', 'low_light', 'other')
RUBRIC = {'manga_style': 30, 'recognizability': 25, 'traceability': 25,
          'composition': 10, 'artifact_free': 10}
LABELS = 'ABCD'


def digest_file(path: Path) -> str:
    h = sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def json_write(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def load_manifest(root: Path) -> dict:
    file = root / 'manifest.json'
    if not file.exists():
        raise ValueError('No manifest. Run `prepare` first.')
    data = json.loads(file.read_text(encoding='utf-8'))
    if data.get('schema') != 'sketchyar-day32-v1' or not isinstance(data.get('cases'), list):
        raise ValueError('Unsupported manifest')
    return data


def new_root(path: str) -> Path:
    return Path(path).expanduser().resolve()


def prepare(root: Path, source: Path, max_side: int, force: bool = False) -> None:
    if max_side < 256 or max_side > 2048:
        raise ValueError('max-side must be 256..2048')
    root.mkdir(parents=True, exist_ok=True)
    if (root / 'manifest.json').exists() and not force:
        raise ValueError('Manifest already exists. Use a fresh experiment folder; existing work was not overwritten.')
    # Never erase old results, even with --force. Preparation requires an empty experiment directory.
    if (root / 'manifest.json').exists() or (root / 'outputs').exists():
        raise ValueError('Experiment already has data; create a new folder instead of overwriting it')
    files = sorted(p for p in source.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT)
    if not files:
        raise ValueError(f'No supported images in {source}')
    if len(files) > 100:
        raise ValueError('At most 100 images per experiment; split into batches')
    cases = []
    for index, src in enumerate(files, 1):
        case_id = f'case_{index:03}'
        with Image.open(src) as raw:
            image = ImageOps.exif_transpose(raw).convert('RGBA')
            canvas = Image.new('RGBA', image.size, (255, 255, 255, 255))
            canvas.alpha_composite(image)
            rgb = canvas.convert('RGB')
            rgb.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            target = root / 'sources' / f'{case_id}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            # PNG is re-encoded to discard EXIF and avoid leaking original filenames.
            rgb.save(target, format='PNG')
        cases.append({'id': case_id, 'source_sha256': digest_file(target),
                      'width': rgb.width, 'height': rgb.height, 'category': 'other'})
    json_write(root / 'manifest.json', {'schema': 'sketchyar-day32-v1',
        'created_utc': datetime.now(timezone.utc).isoformat(), 'max_side': max_side,
        'cases': cases, 'models': list(ALL_MODELS), 'weights': RUBRIC,
        'note': 'No inference has been claimed; model outputs are provided separately.'})
    print(f'Prepared {len(cases)} cases at {root} (EXIF and original filenames excluded)')
    print('Edit manifest.json categories if needed; do not rename case IDs.')


def _gray_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert('L'), dtype=np.float32) / np.float32(255)


def _edge_density(array: np.ndarray) -> float:
    if min(array.shape) < 3:
        return 0.0
    gx = np.abs(array[:, 2:] - array[:, :-2])[1:-1, :]
    gy = np.abs(array[2:, :] - array[:-2, :])[:, 1:-1]
    return round(float(np.mean((gx + gy) > .23)), 5)


def image_metrics(image: Image.Image) -> dict:
    # Diagnostics only; NONE of these metrics are evidence of manga quality or identity.
    rgb = image.convert('RGB')
    gray = _gray_array(rgb)
    color = np.asarray(rgb, dtype=np.float32)
    return {'width': rgb.width, 'height': rgb.height,
            'mean_luma': round(float(gray.mean()), 4),
            'dark_pixel_frac': round(float((gray < .14).mean()), 5),
            'edge_density_proxy': _edge_density(gray),
            'color_chroma_proxy': round(float(np.mean(color.max(axis=2) - color.min(axis=2)) / 255.0), 5)}


def _manga_overlay(image: Image.Image) -> tuple[Image.Image, int, float]:
    """All competitors share the same Day31 D3/normal finishing baseline.

    This is NOT MangaScreen and NOT the chosen future Day33 pipeline. It is a
    standardised traceability preview, so differences arise from AI restyling.
    """
    from ar_drawing.day31_manga import process_gray8_manga
    gray = image.convert('L')
    w, h = gray.size
    t0 = perf_counter()
    r = process_gray8_manga(gray.tobytes(), w, h, detail=3, line='normal')
    mask = np.frombuffer(r.ink, dtype=np.uint8).reshape(h, w)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 3] = mask * 255
    return Image.fromarray(rgba, 'RGBA'), r.ink_pixels, (perf_counter() - t0) * 1000


def baseline(root: Path, model: str) -> None:
    if model not in ALL_MODELS:
        raise ValueError('Unknown model')
    manifest = load_manifest(root)
    for c in manifest['cases']:
        case_id = c['id']
        src = root / 'sources' / f'{case_id}.png'
        if digest_file(src) != c['source_sha256']:
            raise ValueError(f'Original changed unexpectedly: {case_id}')
        dest = root / 'trace' / model / f'{case_id}.png'
        if dest.exists():
            print(f'Skip existing trace: {model}/{case_id}')
            continue
        if model == BASELINE:
            input_img = Image.open(src).convert('RGB')
        else:
            output = root / 'outputs' / model / f'{case_id}.png'
            if not output.exists():
                print(f'Pending: {model}/{case_id} has no AI result')
                continue
            # Do not generate a preview from a substituted/unverified AI image.
            observed = next(r for r in collect(root) if r['case_id'] == case_id and r['model'] == model)
            if observed['status'] != 'ready':
                raise ValueError(f'Unverified output: {model}/{case_id}')
            with Image.open(output) as im:
                input_img = im.convert('RGB')
        # Uniform 1024px max trace preview for RAM stability.
        input_img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        rendered, count, ms = _manga_overlay(input_img)
        dest.parent.mkdir(parents=True, exist_ok=True)
        rendered.save(dest)
        json_write(dest.with_suffix('.json'), {'model': model, 'case_id': case_id,
            'trace_pipeline': 'day31-manga-layers-v1', 'detail': 3, 'stroke': 'normal',
            'ink_pixels': count, 'trace_ms': round(ms, 2), 'source_type': 'photo' if model == BASELINE else 'ai_result',
            'input_sha256': digest_file(src if model == BASELINE else output)})
        print(f'Trace {model}/{case_id}: {count} ink px, {ms:.0f} ms (CPython, not iPhone)')


def _safe_id(value: str) -> bool:
    return value and all(c.isascii() and (c.isalnum() or c in '_-') for c in value)


def collect(root: Path) -> list[dict]:
    manifest = load_manifest(root)
    observations = []
    for c in manifest['cases']:
        cid = c['id']
        if not _safe_id(cid):
            raise ValueError('Invalid case id in manifest')
        inp = root / 'sources' / f'{cid}.png'
        if not inp.exists() or digest_file(inp) != c['source_sha256']:
            raise ValueError(f'Missing/modified source {cid}')
        with Image.open(inp) as im:
            src_metrics = image_metrics(im)
        for model in ALL_MODELS:
            out = (root / 'sources' / f'{cid}.png') if model == BASELINE else root / 'outputs' / model / f'{cid}.png'
            if out.exists():
                with Image.open(out) as im:
                    im.load()
                    m = image_metrics(im)
                meta_path = out.with_suffix('.json')
                meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
                if model != BASELINE:
                    if meta.get('case_id') != cid or meta.get('engine') != model or meta.get('source_sha256') != c['source_sha256']:
                        raise ValueError(f'Missing or inconsistent AI provenance: {model}/{cid}; no unverified output can be compared')
                    if meta.get('output_sha256') != digest_file(out):
                        raise ValueError(f'AI output changed after generation: {model}/{cid}')
                observations.append({'case_id': cid, 'model': model, 'status': 'ready',
                    'sha256': digest_file(out), 'runtime_ms': meta.get('runtime_ms'),
                    'source_aspect': round(src_metrics['width'] / src_metrics['height'], 5),
                    'output_aspect': round(m['width'] / m['height'], 5), **m,
                    'trace_ready': (root / 'trace' / model / f'{cid}.png').exists()})
            else:
                observations.append({'case_id': cid, 'model': model, 'status': 'pending',
                                     'trace_ready': False})
    return observations


def _blind_order(manifest: dict, case_id: str) -> list[str]:
    names = list(ALL_MODELS)
    rnd = random.Random(int.from_bytes(sha256((case_id + 'sketchyar32').encode()).digest()[:8], 'big'))
    rnd.shuffle(names)
    return names


def ratings_template(root: Path, mapping: dict) -> None:
    target = root / 'review' / 'ratings.csv'
    if target.exists():
        print(f'Keep existing ratings unchanged: {target}')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['case_id', 'blind_variant', 'reviewer_id', *RUBRIC])
        for case_id in mapping:
            for letter in LABELS:
                for reviewer in ('reviewer_1', 'reviewer_2'):
                    w.writerow([case_id, letter, reviewer, *([''] * len(RUBRIC))])
    json_write(root / 'review' / 'PRIVATE_blind_key.json', mapping)


def score_rows(root: Path, mapping: dict) -> dict:
    ratings = root / 'review' / 'ratings.csv'
    if not ratings.exists():
        return {}
    scores = {model: [] for model in ALL_MODELS}
    seen: set[tuple] = set()
    with ratings.open(newline='', encoding='utf-8') as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            if not row['case_id'] or not row['reviewer_id']:
                continue
            # Blank prefilled template rows are pending, not invalid ratings.
            if all(not row.get(k) for k in RUBRIC):
                continue
            if row['case_id'] not in mapping or row['blind_variant'] not in mapping[row['case_id']]:
                raise ValueError(f'Invalid blind label row {i}')
            key = row['case_id'], row['blind_variant'], row['reviewer_id']
            if key in seen:
                raise ValueError(f'Duplicate rating row {i}')
            seen.add(key)
            try:
                numbers = {k: int(row[k]) for k in RUBRIC}
            except (TypeError, ValueError) as exc:
                raise ValueError(f'Ratings must be integer 1..5, row {i}') from exc
            if not all(1 <= v <= 5 for v in numbers.values()):
                raise ValueError(f'Ratings must be 1..5, row {i}')
            weighted = sum(numbers[k] * w for k, w in RUBRIC.items()) / 100
            model = mapping[row['case_id']][row['blind_variant']]
            scores[model].append({'case_id': row['case_id'], 'reviewer': row['reviewer_id'],
                                  'weighted_score_1_to_5': round(weighted, 3), **numbers})
    return {model: {'n_ratings': len(vals), 'n_cases': len({v['case_id'] for v in vals}),
                    'n_reviewers': len({v['reviewer'] for v in vals}),
                    'cases_with_two_reviewers': sum(len({v['reviewer'] for v in vals if v['case_id'] == case_id}) >= 2 for case_id in mapping),
                    'mean_score_1_to_5': round(sum(v['weighted_score_1_to_5'] for v in vals) / len(vals), 3) if vals else None}
            for model, vals in scores.items()}


def report(root: Path) -> None:
    manifest = load_manifest(root)
    observations = collect(root)
    mapping = {c['id']: dict(zip(LABELS, _blind_order(manifest, c['id']))) for c in manifest['cases']}
    ratings_template(root, mapping)
    scores = score_rows(root, mapping)
    outdir = root / 'review'
    outdir.mkdir(parents=True, exist_ok=True)
    with (outdir / 'diagnostics.csv').open('w', newline='', encoding='utf-8') as f:
        keys = ['case_id', 'model', 'status', 'sha256', 'runtime_ms', 'width', 'height',
                'source_aspect', 'output_aspect', 'mean_luma', 'dark_pixel_frac',
                'edge_density_proxy', 'color_chroma_proxy', 'trace_ready']
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for row in observations:
            w.writerow({k: row.get(k, '') for k in keys})
    # Blind order is per case. HTML does not expose model labels or the blind key.
    index = {(r['case_id'], r['model']): r for r in observations}
    cells = []
    rows_complete = 0
    for c in manifest['cases']:
        cid = c['id']
        ready_count = sum(index[(cid, mod)]['status'] == 'ready' for mod in ALL_MODELS)
        if ready_count == len(ALL_MODELS):
            rows_complete += 1
        items = []
        items.append(f'<figure><img src="../sources/{cid}.png" alt="Original"/><figcaption>Original source — {html.escape(cid)}</figcaption></figure>')
        for letter, model in mapping[cid].items():
            match = index[(cid, model)]['status'] == 'ready'
            if not match:
                items.append(f'<figure><div class="missing">Pending</div><figcaption>Variant {letter}</figcaption></figure>')
                continue
            image_path = f'../sources/{cid}.png' if model == BASELINE else f'../outputs/{model}/{cid}.png'
            trace_path = f'../trace/{model}/{cid}.png'
            trace_exists = (root / 'trace' / model / f'{cid}.png').exists()
            # Conceal identity in HTML: use data:URI only for AI results and baseline, and trace.
            # Paths must not reveal model names to reviewers. Data URLs live in *local only* report.
            def data_uri(path: Path) -> str:
                with Image.open(path) as im:
                    img = im.convert('RGBA' if im.mode == 'RGBA' else 'RGB')
                    img.thumbnail((360, 360), Image.Resampling.LANCZOS)
                    out = io.BytesIO()
                    img.save(out, format='PNG' if im.mode == 'RGBA' else 'JPEG', optimize=True, quality=84)
                    mediatype = 'image/png' if im.mode == 'RGBA' else 'image/jpeg'
                    return f'data:{mediatype};base64,' + base64.b64encode(out.getvalue()).decode('ascii')
            image_abs = root / ('sources' if model == BASELINE else f'outputs/{model}') / f'{cid}.png'
            imtag = f'<img src="{data_uri(image_abs)}" alt="Variant {letter}"/>'
            if trace_exists:
                trace_abs = root / 'trace' / model / f'{cid}.png'
                imtag += f'<img src="{data_uri(trace_abs)}" alt="Trace variant {letter}" class="trace"/>'
            items.append(f'<figure>{imtag}<figcaption>Variant {letter} — ' + ('restyled + AR contour' if trace_exists else 'restyled image') + '</figcaption></figure>')
        cells.append('<section><h2>' + html.escape(cid) + '</h2><div class="grid">' + ''.join(items) + '</div></section>')
    markup = '''<!doctype html><html lang="bg"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SketchyAR Day32 – blind review</title>
<style>body{font:15px system-ui,sans-serif;color:#1b1b1b;background:#f8f6f1;margin:28px auto;padding:0 16px;max-width:1420px}h1{font-size:24px}h2{font-size:18px}.notice{padding:12px;border:1px solid #c0bdb3;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}figure{margin:0;padding:8px;background:#fff;border:1px solid #ddd;border-radius:10px;min-width:0}figure img{display:block;width:100%;height:245px;object-fit:contain}figure img.trace{border-top:1px solid #ddd}figcaption{font-size:12px;color:#555;padding:8px 0}.missing{height:245px;display:grid;place-items:center;color:#888;background:#f6f6f6}section{margin:20px 0 36px}</style>
<h1>SketchyAR — Day 32 / Сляпо сравнение</h1><p class="notice">Локално изследване, без изпращане на снимки. A–D са разбъркани за всяка снимка. Оценявайте стила, сходството, леснотата за рисуване, композицията и артефактите по 1–5 в <code>ratings.csv</code>. Не използвайте този отчет като доказателство за качество преди моделите да са генерирали реални изображения.</p>'''
    (outdir / 'blind_review.html').write_text(markup + ''.join(cells) + '</html>', encoding='utf-8')
    needed = len(manifest['cases']) * len(PROFILES)
    actual = sum(r['status'] == 'ready' and r['model'] in PROFILES for r in observations)
    # We must NOT automatically rank models based on image statistics.
    eligible = bool(scores) and all(v['cases_with_two_reviewers'] == len(manifest['cases'])
                                    for v in scores.values()) and rows_complete == len(manifest['cases'])
    eligible = eligible and all(r['trace_ready'] for r in observations if r['status'] == 'ready')
    json_write(outdir / 'summary.json', {'day': 32, 'ai_outputs_ready': actual, 'ai_outputs_required': needed,
        'complete_cases': rows_complete, 'total_cases': len(manifest['cases']),
        'automatic_diagnostics_are_not_quality_scores': True,
        'human_review_complete': eligible, 'model_scores': scores,
        'ranking': sorted(ALL_MODELS, key=lambda m: (-scores[m]['mean_score_1_to_5'], m)) if eligible else None})
    print(f'AI generated images: {actual}/{needed}; fully comparable cases: {rows_complete}/{len(manifest["cases"])}')
    print('Report:', outdir / 'blind_review.html')
    print('Ranking:', 'not available; two reviewers + complete outputs and ratings required' if not eligible else 'complete')


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', required=True, help='Private experiment directory; not in repository')
    sub = p.add_subparsers(dest='action', required=True)
    prep = sub.add_parser('prepare', help='Strip EXIF, anonymize, resize input images')
    prep.add_argument('--photos', required=True, help='Folder of original photos; processed locally')
    prep.add_argument('--max-side', type=int, default=1024)
    trace = sub.add_parser('trace', help='Render fixed D3/Normal trace preview for model')
    trace.add_argument('--model', choices=ALL_MODELS, required=True)
    sub.add_parser('report', help='Build blind HTML and diagnostics, no model inference')
    args = p.parse_args(argv)
    root = new_root(args.project)
    if args.action == 'prepare':
        prepare(root, new_root(args.photos), args.max_side)
    elif args.action == 'trace':
        baseline(root, args.model)
    else:
        report(root)

if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileNotFoundError, OSError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(2)
