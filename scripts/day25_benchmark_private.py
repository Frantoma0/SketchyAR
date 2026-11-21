#!/usr/bin/env python3
"""Day 25 optional LOCAL-only comparison. Never copies images or filenames into CSV.

Run from repo root: python scripts/day25_benchmark_private.py "C:/.../30 photos.zip" --out day25-results.csv
Pillow is needed for this offline harness only, not for the iPhone Worker.
HEIC is intentionally skipped unless a verified HEIC decoder is installed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
from io import BytesIO
from pathlib import Path
from time import perf_counter
import zipfile

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from ar_drawing.day13_bridge import process_gray8
from ar_drawing.day25_quality import process_gray8_quality


FIELDS = ['fixture_id','sha256_prefix','format','width','height','status',
          'baseline_ink','quality_ink','removed_pixels','repaired_pixels',
          'changed_pct','baseline_ms','quality_ms']


def grayscale_for_browser(image: Image.Image) -> tuple[bytes,int,int]:
    """EXIF orientation, RGB + white alpha composite, BT.709, max side 1024."""
    im = ImageOps.exif_transpose(image)
    rgba = im.convert('RGBA')
    base = Image.new('RGBA', rgba.size, (255,255,255,255))
    base.alpha_composite(rgba)
    rgb = base.convert('RGB')
    rgb.thumbnail((1024,1024), resample=Image.Resampling.LANCZOS)
    a = np.asarray(rgb,dtype=np.float32)
    gray = np.clip(np.floor(a[:,:,0]*.2126 + a[:,:,1]*.7152 + a[:,:,2]*.0722 + .5),0,255).astype(np.uint8)
    return gray.tobytes(), rgb.width, rgb.height


def analyze(archive: Path) -> list[dict]:
    rows=[]
    with zipfile.ZipFile(archive) as z:
        files=[i for i in z.infolist() if not i.is_dir()]
        for ordinal, member in enumerate(files, 1):
            fmt=Path(member.filename).suffix.lower().lstrip('.')
            data=z.read(member)
            row=dict.fromkeys(FIELDS,'')
            row.update(fixture_id=f'fixture-{ordinal:02}',
                sha256_prefix=hashlib.sha256(data).hexdigest()[:12],format=fmt)
            if fmt in {'heic','heif'}:
                row['status']='SKIP_HEIC_UNVERIFIED_DECODER'; rows.append(row);continue
            try:
                with Image.open(BytesIO(data)) as photo:
                    gray,w,h=grayscale_for_browser(photo)
                row.update(width=w,height=h)
                st=perf_counter();old=process_gray8(gray,w,h);bt=1000*(perf_counter()-st)
                st=perf_counter();new=process_gray8_quality(gray,w,h);qt=1000*(perf_counter()-st)
                a=np.frombuffer(old.ink,dtype=np.uint8).astype(bool)
                b=np.frombuffer(new.ink,dtype=np.uint8).astype(bool)
                row.update(status='PASS',baseline_ink=int(a.sum()),quality_ink=int(b.sum()),
                    removed_pixels=int((a & ~b).sum()),repaired_pixels=int((b & ~a).sum()),
                    changed_pct=round(100*float(np.count_nonzero(a!=b))/a.size,5),
                    baseline_ms=round(bt,1),quality_ms=round(qt,1))
            except (OSError, ValueError, UnidentifiedImageError) as e:
                row['status']='FAIL_' + type(e).__name__
            rows.append(row)
    return rows


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('zip_file',type=Path)
    parser.add_argument('--out',type=Path,default=Path('day25-private-metrics.csv'))
    args=parser.parse_args()
    rows=analyze(args.zip_file)
    with args.out.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=FIELDS)
        writer.writeheader();writer.writerows(rows)
    total=sum(r['status']=='PASS' for r in rows)
    print(f'Day25: {total}/{len(rows)} decoded, {len(rows)-total} skipped/failed; CSV={args.out}')
    if total == 0:
        raise SystemExit('No decoded images; cannot evaluate quality')


if __name__=='__main__':
    main()
