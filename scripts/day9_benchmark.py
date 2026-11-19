#!/usr/bin/env python3
"""Day 9 repeatable CPython timing and checksums (compare same task on iPhone)."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tracemalloc

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.sketch_engine import benchmark  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description='SketchyAR Day 9 NumPy kernel benchmark')
    p.add_argument('--sizes', type=int, nargs='+', default=[512, 1024])
    p.add_argument('--runs', type=int, default=5)
    p.add_argument('--output', type=Path, default=ROOT / 'experiments/outputs/day9-cpython-benchmark.json')
    args = p.parse_args()
    results = [benchmark(size=s, runs=args.runs) for s in args.sizes]
    # A separate, untimed reference for Python-traced allocations. This is NOT
    # full Windows RSS or iOS WebKit/WASM memory consumption.
    import numpy as np
    from ar_drawing.sketch_engine import xdog_preset
    for item in results:
        n = item['shape'][0]
        src = np.random.default_rng(173).random((n, n), dtype=np.float32)
        tracemalloc.start()
        tracemalloc.reset_peak()
        xdog_preset(src, 'balanced')
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        item['inputBytes'] = int(src.nbytes)
        item['pythonTracemallocPeakBytes'] = int(peak)
    dest = args.output if args.output.is_absolute() else ROOT / args.output
    dest.parent.mkdir(parents=True, exist_ok=True)
    report = {
        'schemaVersion': 1,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'environment': 'CPython workstation; compare ONLY same-task benchmarks, not Day8 proxy',
        'peakRamMeasured': False,
        'note': 'Kernel timing excludes loading/decoding/worker transfer. pythonTracemallocPeakBytes is ONLY Python-traced allocations, not full process RSS or iOS/WASM RAM.',
        'results': results,
    }
    dest.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    csv_path = dest.with_suffix('.csv')
    with csv_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['size', 'task', 'median_ms', 'checksum', 'min', 'max', 'runs', 'python', 'numpy'])
        writer.writeheader()
        for record in results:
            for item in record['benchmarks']:
                writer.writerow({
                    'size': record['shape'][0], 'task': item['task'],
                    'median_ms': round(1000 * item['median_s'], 3),
                    'checksum': item['checksum'], 'min': item['min'], 'max': item['max'],
                    'runs': record['runs'], 'python': record['python'], 'numpy': record['numpy'],
                })
    print(json.dumps({'json': str(dest), 'csv': str(csv_path), 'results': results}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
