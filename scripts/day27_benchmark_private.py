#!/usr/bin/env python3
"""SketchyAR Day 27: anonymized V2/V3 A/B on private user-owned photos.

Run from project root:
 PYTHONPATH=python_engine python scripts/day27_benchmark_private.py photos.zip --output docs/day27-anonymized-metrics.csv

Requires NumPy and Pillow (dev only); optional system heif-convert for HEIC.
Never writes originals, original names, filenames or hashes to the output.
The CSV measures pixel occupancy/timing; it is NOT an aesthetic quality score.
"""
from __future__ import annotations
import argparse
import csv
import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from time import perf_counter
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageOps

from ar_drawing.day26_multiscale import process_gray8_multiscale
from ar_drawing.day27_importance import process_gray8_importance

EXTENSIONS = {'.jpeg', '.jpg', '.png', '.heic'}
FIELDS = ['id', 'format', 'status', 'width', 'height', 'v2_ink_pct', 'v3_ink_pct',
          'v3_removed_pct', 'v3_new_pct', 'jaccard', 'v2_cpu_ms', 'v3_cpu_ms']


def decode(blob: bytes, suffix: str):
    if suffix != '.heic':
        with Image.open(io.BytesIO(blob)) as image:
            return ImageOps.exif_transpose(image).convert('RGB')
    exe = shutil.which('heif-convert')
    if exe is None:
        return None
    with tempfile.TemporaryDirectory(prefix='sketchyar-private-heic-') as directory:
        raw = Path(directory) / 'photo.heic'
        out = Path(directory) / 'decoded.jpg'
        raw.write_bytes(blob)
        proc = subprocess.run([exe, str(raw), str(out)], capture_output=True,
                              timeout=90, check=False)
        if proc.returncode != 0 or not out.exists():
            return None
        with Image.open(out) as im:
            return ImageOps.exif_transpose(im).convert('RGB')


def measure(zip_path: Path, output: Path, max_side: int = 512):
    if not 128 <= max_side <= 1024:
        raise ValueError('max_side must be 128..1024')
    rows = []
    with ZipFile(zip_path) as archive:
        entries = sorted([i for i in archive.infolist()
                          if not i.is_dir() and Path(i.filename).suffix.lower() in EXTENSIONS],
                         key=lambda item: item.filename)
        for index, member in enumerate(entries, 1):
            record_id = f'img-{index:02d}'
            suffix = Path(member.filename).suffix.lower()
            print(f'Processing {record_id}/{len(entries)} ({suffix[1:]})', flush=True)
            if member.file_size > 60 * 1024 * 1024:
                rows.append(dict(id=record_id, format=suffix[1:], status='skipped-oversize'))
                continue
            image = decode(archive.read(member), suffix)
            if image is None:
                rows.append(dict(id=record_id, format=suffix[1:], status='skipped-no-decoder'))
                continue
            scale = min(1.0, max_side / max(image.size))
            if scale < 1:
                new_size = tuple(max(3, int(round(s * scale))) for s in image.size)
                image = image.resize(new_size, Image.Resampling.LANCZOS)
            gray = np.asarray(image.convert('L'), dtype=np.uint8)
            data = gray.tobytes()
            started = perf_counter()
            old = process_gray8_multiscale(data, gray.shape[1], gray.shape[0])
            v2_ms = (perf_counter() - started) * 1000
            started = perf_counter()
            new = process_gray8_importance(data, gray.shape[1], gray.shape[0])
            v3_ms = (perf_counter() - started) * 1000
            v2 = np.frombuffer(old.ink, dtype=np.uint8).astype(bool)
            v3 = np.frombuffer(new.ink, dtype=np.uint8).astype(bool)
            union = int(np.count_nonzero(v2 | v3))
            pixels = gray.size
            rows.append(dict(id=record_id, format=suffix[1:], status='pass',
                             width=gray.shape[1], height=gray.shape[0],
                             v2_ink_pct=round(100 * v2.sum() / pixels, 3),
                             v3_ink_pct=round(100 * v3.sum() / pixels, 3),
                             v3_removed_pct=round(100 * np.count_nonzero(v2 & ~v3) / pixels, 3),
                             v3_new_pct=round(100 * np.count_nonzero(v3 & ~v2) / pixels, 3),
                             jaccard=round(float(np.count_nonzero(v2 & v3)) / union, 4) if union else 1.0,
                             v2_cpu_ms=round(v2_ms, 2), v3_cpu_ms=round(v3_ms, 2)))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', type=Path, default=Path('day27-anonymized-metrics.csv'))
    parser.add_argument('--max-side', type=int, default=512)
    args = parser.parse_args()
    results = measure(args.archive, args.output, args.max_side)
    print('Total:', len(results), 'PASS:', sum(r['status']=='pass' for r in results),
          'SKIPPED:', sum(r['status']!='pass' for r in results),
          '(pixel metrics, not perceptual quality)')
