#!/usr/bin/env python3
"""Day 26 private benchmark: compare V1 vs V2 for an archive of user-owned photos.

Requires Pillow, NumPy; optional HEIC decoder `heif-convert` on PATH. Never
prints or writes original filenames/images to output. Use:
 python scripts/day26_benchmark_private.py path/to/photos.zip --output private.csv
HEIC files unsupported by local decoder are counted as skipped (not PASS).
This is a technical pixel/CPU benchmark, NOT an aesthetic quality metric.
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

from ar_drawing.day25_quality import process_gray8_quality
from ar_drawing.day26_multiscale import process_gray8_multiscale

EXTENSIONS = {'.jpg','.jpeg','.png','.heic'}


def load_image(blob: bytes, extension: str):
    if extension != '.heic':
        return ImageOps.exif_transpose(Image.open(io.BytesIO(blob))).convert('RGB')
    if not shutil.which('heif-convert'):
        return None
    with tempfile.TemporaryDirectory(prefix='sketchyar-heic-') as d:
        inp=Path(d)/'original.heic'; out=Path(d)/'decoded.jpg'
        inp.write_bytes(blob)
        res=subprocess.run(['heif-convert',str(inp),str(out)],stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL,timeout=60,check=False)
        if res.returncode or not out.exists():return None
        with Image.open(out) as im:
            return ImageOps.exif_transpose(im).convert('RGB')


def benchmark_zip(archive: Path, output: Path, max_side: int = 512):
    rows=[]
    with ZipFile(archive) as files:
        entries=sorted([p for p in files.namelist()
                        if not p.endswith('/') and Path(p).suffix.lower() in EXTENSIONS])
        for i, member in enumerate(entries,1):
            ext=Path(member).suffix.lower(); name=f'img-{i:02d}'
            print('Processing',name,'/',len(entries),'kind',ext,flush=True)
            img=load_image(files.read(member),ext)
            if img is None:
                rows.append(dict(id=name,format=ext[1:],status='skipped-no-HEIC-decoder'))
                continue
            scale=min(1.0, max_side/max(img.size))
            if scale < 1: img=img.resize((max(3,int(round(img.width*scale))),
                                         max(3,int(round(img.height*scale)))),Image.Resampling.LANCZOS)
            gray=np.asarray(img.convert('L'),dtype=np.uint8)
            payload=gray.tobytes()
            t=perf_counter();old=process_gray8_quality(payload,gray.shape[1],gray.shape[0]);old_ms=(perf_counter()-t)*1000
            t=perf_counter();new=process_gray8_multiscale(payload,gray.shape[1],gray.shape[0]);new_ms=(perf_counter()-t)*1000
            a=np.frombuffer(old.ink,dtype=np.uint8).astype(bool)
            b=np.frombuffer(new.ink,dtype=np.uint8).astype(bool)
            union=int((a|b).sum()); intersection=int((a&b).sum());total=gray.size
            rows.append(dict(id=name,format=ext[1:],status='pass',width=gray.shape[1],height=gray.shape[0],
                             old_ink_pct=round(100*a.sum()/total,3),new_ink_pct=round(100*b.sum()/total,3),
                             new_unique_pct=round(100*(b & ~a).sum()/total,3),
                             lost_old_pct=round(100*(a & ~b).sum()/total,3),
                             edge_jaccard=round(intersection/union,4) if union else 1,
                             old_cpu_ms=round(old_ms,2),new_cpu_ms=round(new_ms,2)))
    output.parent.mkdir(parents=True,exist_ok=True)
    fields=['id','format','status','width','height','old_ink_pct','new_ink_pct',
            'new_unique_pct','lost_old_pct','edge_jaccard','old_cpu_ms','new_cpu_ms']
    with output.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
    return rows


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('--output',type=Path,
                 default=Path('day26-private-results.csv'));p.add_argument('--max-side',type=int,default=512)
    args=p.parse_args();rows=benchmark_zip(args.archive,args.output,args.max_side)
    print('Total:',len(rows),'PASS:',sum(r['status']=='pass' for r in rows),
          'SKIPPED:',sum(r['status']!='pass' for r in rows),'(no original filenames saved)')
