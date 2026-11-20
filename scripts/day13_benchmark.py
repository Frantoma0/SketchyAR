"""Repeatable CPython benchmark for the Day 13 grayscale byte bridge.

Does NOT measure browser decode, JS->WASM transfer, PNG encode or IndexedDB.
"""
from __future__ import annotations
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day13_bridge import process_gray8, BRIDGE_VERSION


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--sizes', nargs='+', type=int, default=[512, 1024])
    p.add_argument('--runs', type=int, default=5)
    args = p.parse_args()
    if not 1 <= args.runs <= 30:
        raise SystemExit('Runs must be 1..30')
    records = []
    for size in args.sizes:
        if not 3 <= size <= 1024:
            raise SystemExit('Size must be 3..1024')
        rng = np.random.default_rng(173)
        src = rng.integers(0, 256, size=(size, size), dtype=np.uint8).tobytes()
        process_gray8(src, size, size)
        times = []
        for _ in range(args.runs):
            start = time.perf_counter()
            result = process_gray8(src, size, size)
            times.append(time.perf_counter()-start)
        records.append({
            'task': 'day13_gray8_to_mask', 'pipelineVersion': result.engine_version,
            'bridgeVersion': BRIDGE_VERSION, 'width': size, 'height': size,
            'inputBytes': len(src), 'outputBytes': len(result.ink),
            'inkPixels': result.ink_pixels, 'runs': args.runs,
            'seconds': [round(v, 6) for v in times],
            'median_s': round(statistics.median(times), 6),
            'includesDecodeTransferPngOrIndexedDB': False,
        })
    dest = ROOT / 'experiments/outputs/day13-cpython-benchmark.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({'schemaVersion': 1, 'environment': 'CPython', 'records':records}, indent=2), encoding='utf-8')
    print(json.dumps({'file': str(dest), 'records': records}, indent=2))

if __name__ == '__main__':
    main()
