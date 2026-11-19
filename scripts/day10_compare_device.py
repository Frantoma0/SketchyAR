#!/usr/bin/env python3
"""Compare DAY 10 iPhone diagnostic event checksums with Windows benchmark JSON.

Usage: python scripts/day10_compare_device.py experiments/outputs/day10-cpython-benchmark.json \
        path/to/sketchyar-diagnostics-iphone.json
This script reads only local files. The diagnostics can include past sessions,
so only successful 'day10.sketch_engine' events from the supplied JSON are used.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path


def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument('windows', type=Path)
    p.add_argument('iphone', type=Path)
    p.add_argument('--rtol',type=float,default=2e-5)
    p.add_argument('--atol',type=float,default=0.02)
    args=p.parse_args()
    pc=json.loads(args.windows.read_text(encoding='utf-8'))
    phone=json.loads(args.iphone.read_text(encoding='utf-8'))
    by_size={int(row['shape'][0]):row for row in pc['results']}
    current={}
    for item in phone.get('events',[]):
        if item.get('type')=='day10.sketch_engine' and item.get('level')=='info':
            obj=item.get('data',{})
            if obj.get('task')=='day10_tones_and_ink':
                current[int(obj['shape'][0])]=obj
    if not current:
        raise SystemExit('No successful Day 10 iPhone benchmark events in diagnostic JSON')
    rows=[]
    all_ok=True
    for size, phone_run in sorted(current.items()):
        if size not in by_size:
            print(f'NOTICE: iPhone size={size} has no Windows benchmark entry')
            all_ok=False
            continue
        pc_run=by_size[size]
        if phone_run.get('seed')!=pc_run.get('seed') or phone_run.get('pipelineVersion')!=pc_run.get('pipelineVersion'):
            raise SystemExit(f'Incompatible seed/pipeline version for {size}')
        pc_tasks={v['task']:v for v in pc_run['benchmarks']}
        for item in phone_run['benchmarks']:
            task=item['task']
            if task not in pc_tasks:
                raise SystemExit(f'Unknown task {task} for size {size}')
            a=float(pc_tasks[task]['checksum']);b=float(item['checksum'])
            matched=math.isclose(a,b,rel_tol=args.rtol,abs_tol=args.atol)
            all_ok &= matched
            rows.append({
                'shape':size,'task':task,'checksum_windows':a,'checksum_iphone':b,
                'abs_diff':round(abs(a-b),5),
                'windows_median_ms':round(pc_tasks[task]['median_s']*1000,3),
                'iphone_median_ms':round(item['median_s']*1000,3),
                'status':'PASS' if matched else 'FAIL',
            })
    print(json.dumps({'status':'PASS' if all_ok else 'FAIL', 'comparisons':rows,
                      'note':'Different hardware, so timings are NOT speed equivalence tests.'},indent=2,ensure_ascii=False))
    if not all_ok:raise SystemExit(1)

if __name__=='__main__':main()
