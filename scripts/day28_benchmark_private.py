#!/usr/bin/env python3
"""Day28 private Sketch V3/V4 CPython A/B and an anonymized CSV report.

Usage (from repo root):
 PYTHONPATH=python_engine python scripts/day28_benchmark_private.py photos.zip \
   --output docs/day28-anonymized-metrics.csv --max-side 512
Only record index/extension and measured quantities; never names, hashes, originals.
HEIC requires a separately installed heif-convert (optional, outside PWA).
These are pixel occupancy/timing measurements, NOT perceptual quality scores.
"""
from __future__ import annotations
import argparse
import csv
from pathlib import Path
from time import perf_counter
from zipfile import ZipFile
import io
import shutil
import subprocess
import tempfile
import numpy as np
from PIL import Image, ImageOps
from ar_drawing.day27_importance import process_gray8_importance
from ar_drawing.day28_flow_coherent import process_gray8_flow, clear_flow_cache

FIELDS = ['id','format','status','width','height','v3_ink_pct','v4_ink_pct',
          'v4_added_pct','v4_removed_pct','intersection_over_union',
          'v3_cpu_ms','v4_cpu_ms']
SUPPORTED = {'.jpg','.jpeg','.png','.heic'}


def decode(blob: bytes, suffix: str):
    if suffix != '.heic':
        with Image.open(io.BytesIO(blob)) as im:
            return ImageOps.exif_transpose(im).convert('RGB')
    if not shutil.which('heif-convert'):
        return None
    with tempfile.TemporaryDirectory(prefix='sketchyar-heic-') as temp:
        raw=Path(temp)/'in.heic'; dst=Path(temp)/'out.jpg';raw.write_bytes(blob)
        proc=subprocess.run(['heif-convert',str(raw),str(dst)],capture_output=True,
                             timeout=90,check=False)
        if proc.returncode != 0 or not dst.exists():return None
        with Image.open(dst) as im:
            return ImageOps.exif_transpose(im).convert('RGB')


def run(archive: Path, output: Path, max_side: int=512) -> list[dict]:
    if not 128 <= max_side <= 1024:
        raise ValueError('max-side must be 128..1024')
    result=[]
    with ZipFile(archive) as z:
        files=sorted((i for i in z.infolist() if not i.is_dir() and
                      Path(i.filename).suffix.lower() in SUPPORTED),key=lambda i:i.filename)
        for index, member in enumerate(files,1):
            ext=Path(member.filename).suffix.lower()
            row={'id':f'img-{index:02d}', 'format':ext.lstrip('.')}
            print(f'{index}/{len(files)} {row["id"]}',flush=True)
            if member.file_size > 60*1024*1024:
                result.append({**row,'status':'skipped-oversized'});continue
            photo=decode(z.read(member),ext)
            if photo is None:
                result.append({**row,'status':'skipped-no-heic-decoder'});continue
            scale=min(1.0,max_side / max(photo.size))
            if scale < 1.0:
                photo=photo.resize(tuple(max(3,round(s*scale)) for s in photo.size),Image.Resampling.LANCZOS)
            gray=np.asarray(photo.convert('L'),np.uint8)
            height,width=gray.shape
            started=perf_counter(); v3=process_gray8_importance(gray.tobytes(),width,height)
            v3_ms=(perf_counter()-started)*1000
            clear_flow_cache()
            started=perf_counter();v4=process_gray8_flow(gray.tobytes(),width,height)
            v4_ms=(perf_counter()-started)*1000
            aa=np.frombuffer(v3.ink,dtype=np.uint8).astype(bool)
            bb=np.frombuffer(v4.ink,dtype=np.uint8).astype(bool)
            both=int(np.count_nonzero(aa&bb));either=int(np.count_nonzero(aa|bb))
            pixels=gray.size
            result.append({**row,'status':'pass','width':width,'height':height,
                'v3_ink_pct':round(v3.ink_pixels/pixels*100,3),
                'v4_ink_pct':round(v4.ink_pixels/pixels*100,3),
                'v4_added_pct':round(np.count_nonzero(bb&~aa)/pixels*100,3),
                'v4_removed_pct':round(np.count_nonzero(aa&~bb)/pixels*100,3),
                'intersection_over_union':round(both/either,4) if either else 1.,
                'v3_cpu_ms':round(v3_ms,2),'v4_cpu_ms':round(v4_ms,2)})
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('w',newline='',encoding='utf-8') as o:
        writer=csv.DictWriter(o,fieldnames=FIELDS); writer.writeheader(); writer.writerows(result)
    clear_flow_cache()
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive',type=Path)
    parser.add_argument('--max-side',type=int,default=512)
    parser.add_argument('--output',type=Path,default=Path('day28-anonymized-metrics.csv'))
    args=parser.parse_args()
    rows=run(args.archive,args.output,args.max_side)
    print('Total:',len(rows),'PASS:',sum(r['status']=='pass' for r in rows),
          '(timing/occupancy only, not quality)',flush=True)
