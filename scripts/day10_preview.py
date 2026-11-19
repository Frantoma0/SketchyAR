#!/usr/bin/env python3
"""Local Day10 tone-vs-edge comparison. Does not upload input images anywhere.

Uses Pillow ONLY for IO/layout on Windows; the actual algorithms (all NumPy)
run without Pillow in the Pyodide Worker. Personal photos never enter Git.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
sys.path.insert(0, str(ROOT / 'scripts'))
from ar_drawing.sketch_engine import to_grayscale, sobel, xdog_preset  # noqa: E402
from ar_drawing.day10_tones import tone_preview, sobel_ink_preview, tone_and_ink_preview  # noqa: E402
from day9_preview import synthetic_fixtures  # noqa: E402


def tiles(source: Image.Image, max_side: int) -> list[tuple[str, Image.Image]]:
    img = ImageOps.exif_transpose(source).convert('RGB')
    img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    gray = to_grayscale(np.asarray(img))
    entries = [('Original', img)]
    entries += [(f'{n} levels', Image.fromarray(tone_preview(gray, n)).convert('RGB')) for n in (3,4,5)]
    entries.append(('Sobel ink', Image.fromarray(sobel_ink_preview(gray)).convert('RGB')))
    entries.append(('XDoG balanced', Image.fromarray((np.rint(xdog_preset(gray)*255)).astype(np.uint8)).convert('RGB')))
    entries.append(('4 tones + ink', Image.fromarray(tone_and_ink_preview(gray)).convert('RGB')))
    # Different processing paths are presented side by side; do not rank solely from appearance.
    return entries


def save_sheet(rows: list[tuple[str,list[tuple[str,Image.Image]]]], dest: Path):
    cell, label_h, margin, gap = 288, 44, 22, 14
    cols = 7
    w = 2*margin + cols*cell+(cols-1)*gap
    h = 112+len(rows)*(cell+label_h+gap)+12
    canvas = Image.new('RGB',(w,h),'#f5f3ee')
    d = ImageDraw.Draw(canvas)
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        title_font = ImageFont.truetype(path, 27)
        font = ImageFont.truetype(path, 17)
    except OSError:
        title_font = ImageFont.load_default()
        font = ImageFont.load_default()
    d.text((margin,14),'SketchyAR  /  Day 10  /  Tones 3-5 + Sobel ink + XDoG',fill='#303037',font=title_font)
    d.text((margin,60),'Pure NumPy filters. Preview only; automatic drawing steps and alpha layers are NOT implemented.',fill='#53565b',font=font)
    for i,(name,parts) in enumerate(rows):
        top=108+i*(cell+label_h+gap)
        for j,(label,picture) in enumerate(parts):
            x=margin+j*(cell+gap)
            thumb=picture.copy()
            thumb.thumbnail((cell,cell),Image.Resampling.LANCZOS)
            canvas.paste(thumb,(x+(cell-thumb.width)//2,top+(cell-thumb.height)//2))
            d.text((x+2,top+cell+9), f'{name}: {label}' if j==0 else label,fill='#35353a',font=font)
    dest.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(dest,optimize=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--input',type=Path, help='optional local photo; no upload')
    p.add_argument('--max-side',type=int,default=1024)
    p.add_argument('--output-dir',type=Path,default=ROOT/'experiments/outputs/day10')
    args=p.parse_args()
    if not 32 <= args.max_side <= 2048:
        p.error('--max-side must be from 32 to 2048')
    dest=args.output_dir if args.output_dir.is_absolute() else ROOT/args.output_dir
    dest.mkdir(parents=True,exist_ok=True)
    if args.input:
        with Image.open(args.input) as im:
            images={args.input.stem:im.copy()}
    else:
        images=synthetic_fixtures()
    rows=[]
    for name,pic in images.items():
        parts=tiles(pic,args.max_side)
        rows.append((name,parts))
        for label,im in parts:
            safe=''.join(c if c.isalnum() else '_' for c in label.lower())
            im.save(dest/f'{name}_{safe}.png')
    out=dest/'comparison.png'
    save_sheet(rows,out)
    meta={
        'sourceNames': list(images), 'maxSide': args.max_side,
        'operators': ['tone 3','tone 4','tone 5','Sobel ink fixed threshold','XDoG balanced','tone4*XDoG'],
        'notes': ['No semantic sketch ordering or AI inference in Day 10',
                  'Input photos are processed locally and outputs stay under ignored experiments/outputs/'],
    }
    (dest/'comparison.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'comparison':str(out),'images':list(images),'tilesPerImage':7},ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
