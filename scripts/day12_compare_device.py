"""Check exact checksums of the same Day 12 fixtures on CPython and iPhone.

Time is intentionally not compared; hardware and Python/NumPy versions differ.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('windows_json', type=Path)
    parser.add_argument('iphone_diagnostics_json', type=Path)
    args = parser.parse_args()
    windows = json.loads(args.windows_json.read_text(encoding='utf-8'))
    iphone = json.loads(args.iphone_diagnostics_json.read_text(encoding='utf-8'))
    runs = [event['data'] for event in iphone.get('events', [])
            if event.get('type') == 'day12.edge_pipeline' and
            'completed' in event.get('msg', '') and isinstance(event.get('data'), dict)]
    by_size = {int(d['shape'][0]): d for d in runs if d.get('task') == 'day12_edge_pipeline'}
    failed = False
    for win in windows['results']:
        size = win['shape'][0]
        candidate = by_size.get(size)
        if not candidate:
            print(f'{size}: NO IPHONE RESULT')
            failed = True
            continue
        if win['pipelineVersion'] != candidate.get('pipelineVersion') or win['seed'] != candidate.get('seed'):
            print(f'{size}: VERSION/SEED MISMATCH')
            failed = True
            continue
        local = {v['task']: v for v in win['benchmarks']}
        remote = {v['task']: v for v in candidate['benchmarks']}
        for name, result in local.items():
            other = remote.get(name)
            passed = (other is not None and result['nonzero'] == other['nonzero'] and
                      abs(result['checksum'] - other['checksum']) <= 0.01)
            print(f'{size} {name}: {"PASS" if passed else "FAIL"} '
                  f'Windows={result["checksum"]} iPhone={None if other is None else other["checksum"]}')
            failed |= not passed
    if failed:
        raise SystemExit(1)
    print('Day 12 output checks passed. These checksums do not prove pixelwise identity.')


if __name__ == '__main__':
    main()
