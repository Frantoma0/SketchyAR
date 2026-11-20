"""CPython Day 12 benchmark: reproducible across iPhone Pyodide & Windows."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day12_edges import benchmark_day12


def main() -> None:
    parser = argparse.ArgumentParser(description='SketchyAR Day 12 benchmark')
    parser.add_argument('--sizes', nargs='+', type=int, default=[512, 1024])
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--seed', type=int, default=173)
    parser.add_argument('--output', type=Path,
                        default=ROOT / 'experiments/outputs/day12-cpython-benchmark.json')
    args = parser.parse_args()
    rows = [benchmark_day12(size, args.runs, args.seed) for size in args.sizes]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'schemaVersion': 1, 'environment': 'CPython', 'results': rows},
                                      ensure_ascii=False, indent=2), encoding='utf-8')
    with args.output.with_suffix('.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=['size', 'task', 'median_ms', 'checksum',
                                                    'nonzero', 'pipelineVersion', 'python', 'numpy'])
        writer.writeheader()
        for row in rows:
            for result in row['benchmarks']:
                writer.writerow({
                    'size': row['shape'][0], 'task': result['task'],
                    'median_ms': round(result['median_s'] * 1000, 3),
                    'checksum': result['checksum'], 'nonzero': result['nonzero'],
                    'pipelineVersion': row['pipelineVersion'],
                    'python': row['python'], 'numpy': row['numpy'],
                })
    print(json.dumps({'json': str(args.output), 'csv': str(args.output.with_suffix('.csv')),
                      'summary': [{'shape': r['shape'], 'finalPixels': r['finalPixels'],
                                   'ms': {x['task']: round(1000 * x['median_s'], 3)
                                          for x in r['benchmarks']}} for r in rows]},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
