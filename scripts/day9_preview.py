#!/usr/bin/env python3
"""Day 9 local XDoG preview generator (Pillow only on the workstation).

Default: three wholly synthetic fixtures that may safely live in a public repo.
With --input: accepts ONE user photo and writes previews only to the ignored
experiments/outputs/ directory. No upload, external calls, or model weights.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.sketch_engine import PRESETS, gaussian_blur, sobel, to_grayscale, sketch_preview  # noqa: E402


def synthetic_fixtures(size: int = 320) -> dict[str, Image.Image]:
    """Three deterministic synthetic images, not real people/photos."""
    # 1) Straight lines and familiar geometry, no facial context.
    a = Image.new('RGB', (size, size), '#fbf9f3')
    d = ImageDraw.Draw(a)
    d.rectangle((28, 38, 166, 167), outline='#323c4d', width=4)
    d.ellipse((160, 35, 292, 168), outline='#3a444f', width=4)
    d.line([(24, 265), (296, 265)], fill='#505966', width=3)
    d.line([(27, 228), (281, 199)], fill='#565f69', width=3)
    d.polygon([(105, 208), (174, 287), (50, 293)], outline='#4f5f6d', width=3)

    # 2) Simple stylized, fictional line-art character (not an actual person).
    b = Image.new('RGB', (size, size), '#f5f1e9')
    d = ImageDraw.Draw(b)
    d.arc((76, 42, 247, 261), 5, 175, fill='#454246', width=4)
    d.arc((74, 41, 244, 270), 178, 358, fill='#454246', width=4)
    d.line([(94, 91), (120, 73), (156, 65), (182, 70), (220, 98)], fill='#454246', width=5)
    d.arc((92, 142, 148, 166), 192, 348, fill='#4c4644', width=3)
    d.arc((173, 142, 229, 166), 192, 348, fill='#4c4644', width=3)
    d.line([(159, 162), (148, 204), (174, 207)], fill='#675951', width=3)
    d.arc((135, 207, 193, 230), 0, 185, fill='#66534c', width=3)
    d.line([(121, 262), (80, 286), (64, 315)], fill='#59504e', width=5)
    d.line([(206, 265), (245, 286), (260, 317)], fill='#59504e', width=5)

    # 3) Semi-photographic shaded objects, gradient and subtle fixed-seed noise.
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    light = 207 + 0.11*(x-y)
    circle = ((x - 175)**2 + (y-162)**2) < 83**2
    light[circle] -= 90 + 35*((x[circle]-175)/83)
    tabletop = y > 244
    light[tabletop] = 163 + 0.13*x[tabletop]
    rng = np.random.default_rng(42)
    light += rng.normal(0, 2.2, light.shape).astype(np.float32)
    c = Image.fromarray(np.clip(light, 0, 255).astype(np.uint8), 'L').convert('RGB')
    d = ImageDraw.Draw(c)
    d.ellipse((104, 78, 249, 247), outline='#4d5455', width=3)
    d.line([(18, 243), (307, 246)], fill='#636363', width=4)
    d.arc((74, 236, 282, 276), 0, 180, fill='#757575', width=2)
    return {'geometry': a, 'fictional-lineart': b, 'shaded-objects': c}


def as_tiles(image: Image.Image, max_side: int) -> list[tuple[str, Image.Image]]:
    image = ImageOps.exif_transpose(image).convert('RGB')
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    gray = to_grayscale(np.asarray(image))
    tiles = [('Original', image)]
    smooth = gaussian_blur(gray, sigma=1.0)
    tiles.append(('Gaussian σ=1', Image.fromarray(np.rint(smooth*255).astype(np.uint8), 'L').convert('RGB')))
    magnitude = sobel(smooth)[2]
    # Magnitude is displayed with per-image P99 scaling solely for readability.
    p99 = float(np.percentile(magnitude, 99))
    sobel_view = np.clip(magnitude / max(p99, 1e-6), 0, 1)
    tiles.append(('Sobel (P99)', Image.fromarray(np.rint((1 - sobel_view)*255).astype(np.uint8), 'L').convert('RGB')))
    for name in PRESETS:
        tiles.append((f'XDoG {name}', Image.fromarray(sketch_preview(gray, name), 'L').convert('RGB')))
    return tiles


def contact_sheet(items: list[tuple[str, list[tuple[str, Image.Image]]]], dest: Path) -> None:
    cols, cell, pad, label_h, gap = 7, 320, 16, 40, 16
    rows = len(items)
    width = pad*2 + cols*cell + (cols-1)*gap
    height = 98 + pad + rows*(cell+label_h+gap) + 36
    sheet = Image.new('RGB', (width, height), '#f5f3ee')
    d = ImageDraw.Draw(sheet)
    try:
        font_title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
        font_regular = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
    except OSError:
        font_title = ImageFont.load_default()
        font_regular = ImageFont.load_default()
    d.text((pad, 14), 'SketchyAR  /  Day 9  /  Gaussian + Sobel + XDoG', font=font_title, fill='#28282b')
    d.text((pad, 58), 'Three synthetic fixtures. Sobel has per-image P99 view scaling; XDoG uses its original 0..1 output.', font=font_regular, fill='#51535a')
    for row, (name, tiles) in enumerate(items):
        top = 98 + row*(cell+label_h+gap)
        for col, (label, img) in enumerate(tiles):
            x0 = pad + col*(cell+gap)
            display = img.copy()
            display.thumbnail((cell, cell), Image.Resampling.LANCZOS)
            x = x0 + (cell - display.width)//2
            y = top + (cell - display.height)//2
            sheet.paste(display, (x, y))
            d.text((x0+3, top+cell+8), f'{name}: {label}' if col == 0 else label, font=font_regular, fill='#303035')
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, optimize=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, help='Optional personal image (not added to repository)')
    p.add_argument('--output-dir', type=Path, default=ROOT / 'experiments/outputs/day9')
    p.add_argument('--max-side', type=int, default=1024)
    args = p.parse_args()
    if not 32 <= args.max_side <= 2048:
        p.error('--max-side must be 32..2048')
    out = args.output_dir if args.output_dir.is_absolute() else ROOT / args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    if args.input:
        with Image.open(args.input) as loaded:
            sources = {args.input.stem: loaded.copy()}
    else:
        sources = synthetic_fixtures()
    previews = []
    for name, img in sources.items():
        tiles = as_tiles(img, args.max_side)
        previews.append((name, tiles))
        for label, tile in tiles:
            safe = label.lower().replace(' ', '_').replace('σ', 'sigma').replace('=', '')
            tile.save(out / f'{name}_{safe}.png')
    contact_sheet(previews, out / 'comparison.png')
    summary = {'fixtures': list(sources), 'presets': PRESETS, 'imageWidthMax': args.max_side,
               'note': 'Experimental artistic filter only. Not semantic drawing steps; output is not alpha.'}
    (out / 'comparison.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'comparison': str(out / 'comparison.png'), 'fixtures': list(sources),
                      'outputs': len(list(out.glob('*.png')))}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
