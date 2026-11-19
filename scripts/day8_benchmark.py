#!/usr/bin/env python3
"""Reproducible Windows/CPython baseline for Day 8 (distinct from iPhone timing)."""
from __future__ import annotations
import argparse
import csv
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.spike_proxy import benchmark  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sizes', type=int, nargs='+', default=[512, 1024])
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--output', default='experiments/outputs/day8-cpython-benchmark.json')
    args = parser.parse_args()
    if not args.sizes or any(s < 8 for s in args.sizes) or args.runs < 1:
        parser.error('size >= 8; runs >= 1')
    rows = [benchmark(size=size, runs=args.runs, seed=173) for size in args.sizes]
    report = {
        'schemaVersion': 1,
        'environment': 'Windows/CPython or local CPython; not iPhone/Pyodide',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'platform': platform.platform(),
        'records': rows,
    }
    outfile = ROOT / args.output
    outfile.parent.mkdir(parents=True, exist_ok=True)
    outfile.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with outfile.with_suffix('.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=['task', 'size_px', 'runs', 'median_s', 'dtype', 'python', 'numpy'])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                'task': row['task'], 'size_px': row['shape'][0], 'runs': row['runs'],
                'median_s': row['median_s'], 'dtype': row['dtype'],
                'python': row['python'], 'numpy': row['numpy']})
    print(json.dumps({'json': str(outfile), 'records': rows}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
