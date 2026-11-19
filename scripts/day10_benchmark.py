#!/usr/bin/env python3
"""Reproducible Day 10 CPython timing (same workload as Pyodide)."""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day10_tones import benchmark_day10  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--sizes', nargs='+', type=int, default=[512, 1024])
    p.add_argument('--runs', type=int, default=5)
    p.add_argument('--output', type=Path, default=ROOT / 'experiments/outputs/day10-cpython-benchmark.json')
    args = p.parse_args()
    records = [benchmark_day10(x, runs=args.runs) for x in args.sizes]
    dest = args.output if args.output.is_absolute() else ROOT / args.output
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'schemaVersion': 1, 'createdAt': datetime.now(timezone.utc).isoformat(),
        'environment': 'CPython on development computer',
        'notes': [
            'Synthetic seeded float32 inputs. No decoding, browser rendering, worker transfer or WASM startup.',
            'Interpret memory independently; no whole-process RSS or iPhone Safari memory reported.',
            'Compare identical day10 task/shape/seed against the iPhone JSON, not the old Day8/9 workloads.',
        ], 'results': records,
    }
    dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    csv_dest = dest.with_suffix('.csv')
    with csv_dest.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['size','task','median_ms','checksum','runs','python','numpy'])
        writer.writeheader()
        for rec in records:
            for row in rec['benchmarks']:
                writer.writerow({
                    'size': rec['shape'][0], 'task': row['task'],
                    'median_ms': round(row['median_s']*1000,3), 'checksum': row['checksum'],
                    'runs': rec['runs'], 'python': rec['python'], 'numpy': rec['numpy'],
                })
    print(json.dumps({'json': str(dest), 'csv': str(csv_dest), 'results': records}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
