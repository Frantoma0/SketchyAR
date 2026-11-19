"""Run reproducible Day 11 Otsu and morphology benchmark in local CPython."""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day11_morphology import benchmark_day11


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sizes', nargs='+', type=int, default=[512, 1024])
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--seed', type=int, default=173)
    parser.add_argument('--output', type=Path, default=ROOT / 'experiments/outputs/day11-cpython-benchmark.json')
    args = parser.parse_args()
    results = [benchmark_day11(size, args.runs, args.seed) for size in args.sizes]
    target = args.output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({'schemaVersion': 1, 'environment': 'Windows CPython', 'results': results}, indent=2), encoding='utf-8')
    csv_path = target.with_suffix('.csv')
    with csv_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['size', 'task', 'median_ms', 'checksum', 'threshold_uint8', 'python', 'numpy'])
        writer.writeheader()
        for r in results:
            for b in r['benchmarks']:
                writer.writerow({'size': r['shape'][0], 'task': b['task'], 'median_ms': round(b['median_s'] * 1000, 3), 'checksum': b['checksum'], 'threshold_uint8': r['otsuThresholdUint8'], 'python': r['python'], 'numpy': r['numpy']})
    print(json.dumps({'json': str(target), 'csv': str(csv_path), 'records': results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
