"""Compare source-scoped Day 11 benchmark checksums across desktop and device.

Example: python scripts/day11_compare_device.py experiments/outputs/day11-cpython-benchmark.json C:\\path\\to\\sketchyar-diagnostics.json
"""
from pathlib import Path
import argparse
import json


def main():
    p = argparse.ArgumentParser()
    p.add_argument('desktop', type=Path)
    p.add_argument('diagnostics', type=Path)
    args = p.parse_args()
    pc = json.loads(args.desktop.read_text('utf-8'))
    diagnostics = json.loads(args.diagnostics.read_text('utf-8'))
    events = [e for e in diagnostics.get('events', []) if e.get('type') == 'day11.otsu_morphology' and 'completed' in e.get('msg', '')]
    results = {}
    for event in events:
        data = event.get('data') or {}
        if data.get('task') == 'day11_otsu_morphology':
            results[data.get('shape', [0])[0]] = data
    failures = []
    for desktop in pc.get('results', []):
        size = desktop['shape'][0]
        phone = results.get(size)
        if phone is None:
            failures.append(f'No Day11 iPhone result for {size} px')
            continue
        for k in ('task', 'shape', 'seed', 'otsuThresholdUint8', 'pipelineVersion', 'borderMode'):
            if desktop[k] != phone.get(k):
                failures.append(f'{size}: {k}: Windows {desktop[k]!r}, iPhone {phone.get(k)!r}')
        for row in desktop['benchmarks']:
            partner = next((x for x in phone['benchmarks'] if x['task'] == row['task']), None)
            if partner is None or row['checksum'] != partner['checksum']:
                failures.append(f'{size}: {row["task"]} checksum: Windows {row["checksum"]}, iPhone {partner["checksum"] if partner else "missing"}')
    if failures:
        print('FAIL: ' + '\n'.join(failures))
        raise SystemExit(1)
    print('PASS: Otsu thresholds and all Day11 foreground pixel counts agree for every tested size.')


if __name__ == '__main__':
    main()
