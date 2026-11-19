#!/usr/bin/env python3
"""Vendor pinned runtime assets for SketchyAR Day 8 (build-time network only).

No Python binary wheels, WASM, or font binaries are committed in the source patch.
Run before npm run dev/build; GitHub Actions performs the same step.

Requirements: Python >=3.11, fonttools[woff] for Caveat WOFF2 conversion.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
PYODIDE_VERSION = '314.0.8'
PYODIDE_URL = f'https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/'
PYODIDE_DIR = APP / 'public' / 'pyodide' / f'v{PYODIDE_VERSION}'
FONTS_DIR = APP / 'src' / 'fonts'
FONTS_LICENSE_DIR = APP / 'public' / 'licenses'
CAVEAT_REVISION = '59745e818ef7973e11e70cb1358d0e902b56c5fc'
CAVEAT_SRC = (f'https://raw.githubusercontent.com/googlefonts/caveat/{CAVEAT_REVISION}/'
              'fonts/ttf/Caveat-Bold.ttf')
CAVEAT_LICENSE = f'https://raw.githubusercontent.com/googlefonts/caveat/{CAVEAT_REVISION}/OFL.txt'
CORE_FILES = (
    'pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm',
    'python_stdlib.zip', 'pyodide-lock.json',
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def retrieve(url: str, *, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'SketchyAR-Day8-Vendor/1.0 (Python urllib)',
                'Accept': '*/*',
            })
            with urllib.request.urlopen(req, timeout=110) as response:
                result = response.read()
            if not result:
                raise ValueError(f'Empty response: {url}')
            return result
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f'Cannot download {url}: {last_error}')


def write_asset(path: Path, data: bytes, expected: str | None = None) -> None:
    if expected and sha256(data).lower() != expected.lower():
        raise ValueError(f'Integrity mismatch for {path.name}: expected {expected}')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.part')
    temporary.write_bytes(data)
    temporary.replace(path)


def local_or_download(name: str, expected_hash: str | None = None) -> bytes:
    path = PYODIDE_DIR / name
    if path.exists():
        cached = path.read_bytes()
        if cached and (expected_hash is None or sha256(cached).lower() == expected_hash.lower()):
            print(f'  cached {name} ({len(cached):,} B)')
            return cached
    print(f'  download {name}')
    data = retrieve(PYODIDE_URL + urllib.parse.quote(name))
    write_asset(path, data, expected_hash)
    return data


def resolve_packages(lockfile: dict, selected: list[str]) -> list[str]:
    packages = lockfile.get('packages')
    if not isinstance(packages, dict):
        raise ValueError('Unsupported Pyodide lockfile structure: packages missing')
    ordered: list[str] = []
    visited: set[str] = set()

    def visit(package: str) -> None:
        if package in visited:
            return
        visited.add(package)
        entry = packages.get(package)
        if not isinstance(entry, dict):
            raise ValueError(f'Pyodide package {package!r} missing from release lockfile')
        for dep in entry.get('depends', []):
            visit(dep)
        ordered.append(package)

    for package in selected:
        visit(package)
    return ordered


def vendor_pyodide(with_opencv: bool) -> dict:
    print(f'Pyodide v{PYODIDE_VERSION} — own-origin runtime')
    pyodide_entries: dict[str, dict] = {}
    for name in CORE_FILES:
        data = local_or_download(name)
        if name == 'pyodide.asm.wasm' and not data.startswith(b'\x00asm'):
            raise ValueError('Invalid WASM header')
        if name in ('python_stdlib.zip',) and not data.startswith(b'PK'):
            raise ValueError('Invalid stdlib ZIP')
        pyodide_entries[name] = {'sha256': sha256(data), 'bytes': len(data)}

    raw_lock = (PYODIDE_DIR / 'pyodide-lock.json').read_text(encoding='utf-8')
    lock = json.loads(raw_lock)
    selected = ['numpy', *(['opencv-python'] if with_opencv else [])]
    packages = resolve_packages(lock, selected)
    for name in packages:
        entry = lock['packages'][name]
        filename = str(entry.get('file_name', ''))
        if not filename or '/' in filename or '\\' in filename or '..' in filename:
            raise ValueError(f'Unsafe wheel/archive name for {name}: {filename!r}')
        entry_sha = entry.get('sha256')
        data = local_or_download(filename, entry_sha)
        pyodide_entries[filename] = {'sha256': sha256(data), 'bytes': len(data), 'package': name}
    inventory = {
        'version': 1,
        'pyodideVersion': PYODIDE_VERSION,
        'transport': 'same-origin',
        'packages': packages,
        'opencvVendored': 'opencv-python' in packages,
        'files': pyodide_entries,
    }
    # A JSON manifest for the browser diagnostics; NOT a claim that SW caching is ready.
    inventory_path = PYODIDE_DIR / 'inventory.json'
    inventory_path.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('  total runtime: %.1f MiB' % (sum(e['bytes'] for e in pyodide_entries.values()) / 2**20))
    return inventory


def vendor_font() -> None:
    try:
        from fontTools.ttLib import TTFont  # type: ignore
    except ImportError as exc:
        raise RuntimeError('Install one-time font tool: python -m pip install "fonttools[woff]==4.63.0"') from exc
    print('Caveat Bold — source-pinned WOFF2 (includes Bulgarian Cyrillic)')
    path = FONTS_DIR / 'Caveat-Bold.woff2'
    if not path.exists():
        source = retrieve(CAVEAT_SRC)
        if source[:4] not in (b'\x00\x01\x00\x00', b'OTTO', b'true'):
            raise ValueError('Invalid font source header')
        font = TTFont(io.BytesIO(source))
        # Converting the container to WOFF2 preserves font metrics/glyphs.
        font.flavor = 'woff2'
        path.parent.mkdir(parents=True, exist_ok=True)
        font.save(path)
        print(f'  created {path.relative_to(ROOT)} ({path.stat().st_size:,} B)')
    else:
        print(f'  cached {path.relative_to(ROOT)} ({path.stat().st_size:,} B)')
    license_path = FONTS_LICENSE_DIR / 'Caveat-OFL.txt'
    if not license_path.exists():
        raw = retrieve(CAVEAT_LICENSE)
        if b'SIL OPEN FONT LICENSE' not in raw.upper():
            raise ValueError('Caveat license text could not be validated')
        write_asset(license_path, raw)
    print('  OFL notice: ' + str(license_path.relative_to(ROOT)))


def verify_local(with_opencv: bool) -> None:
    inv = PYODIDE_DIR / 'inventory.json'
    font = FONTS_DIR / 'Caveat-Bold.woff2'
    ofl = FONTS_LICENSE_DIR / 'Caveat-OFL.txt'
    if not (inv.is_file() and font.is_file() and ofl.is_file()):
        raise RuntimeError('Missing local assets. Run python scripts/vendor_day8.py first.')
    inventory = json.loads(inv.read_text(encoding='utf-8'))
    if inventory.get('pyodideVersion') != PYODIDE_VERSION:
        raise RuntimeError('Pyodide version mismatch')
    if with_opencv and not inventory.get('opencvVendored'):
        raise RuntimeError('Optional OpenCV was not included')
    for filename, info in inventory['files'].items():
        contents = (PYODIDE_DIR / filename).read_bytes()
        if sha256(contents) != info['sha256'] or len(contents) != info['bytes']:
            raise RuntimeError(f'Integrity check failed: {filename}')
    if font.read_bytes()[:4] != b'wOF2':
        raise RuntimeError('Caveat is not WOFF2')
    print(f'PASS: {len(inventory["files"])} verified Pyodide assets; WOFF2 + OFL present')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-opencv', action='store_true', help='Also vendor the optional OpenCV benchmark dependencies')
    parser.add_argument('--check', action='store_true', help='Check prepared assets locally; makes no HTTP requests')
    args = parser.parse_args()
    if args.check:
        verify_local(args.with_opencv)
        return
    vendor_font()
    vendor_pyodide(args.with_opencv)
    verify_local(args.with_opencv)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Day 8 asset preparation FAILED: {error}', file=sys.stderr)
        sys.exit(1)
