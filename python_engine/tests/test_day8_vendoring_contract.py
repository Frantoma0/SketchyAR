"""Offline unit tests for release-manifest dependency selection (no HTTP calls)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts' / 'vendor_day8.py'
_spec = importlib.util.spec_from_file_location('vendor_day8', SCRIPT)
assert _spec and _spec.loader
vendor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vendor)


def test_package_closure_is_recursive_and_dependency_first():
    lock = {'packages': {
        'numpy': {'depends': ['openblas'], 'file_name': 'numpy.whl'},
        'openblas': {'depends': ['libgcc'], 'file_name': 'openblas.zip'},
        'libgcc': {'depends': [], 'file_name': 'libgcc.zip'},
    }}
    assert vendor.resolve_packages(lock, ['numpy']) == ['libgcc', 'openblas', 'numpy']


def test_duplicate_package_dependencies_not_downloaded_twice():
    lock = {'packages': {
        'numpy': {'depends': ['openblas'], 'file_name': 'numpy.whl'},
        'other': {'depends': ['openblas'], 'file_name': 'other.whl'},
        'openblas': {'depends': [], 'file_name': 'openblas.zip'},
    }}
    assert vendor.resolve_packages(lock, ['numpy', 'other']) == ['openblas', 'numpy', 'other']


def test_unknown_package_is_hard_failure():
    with pytest.raises(ValueError, match='missing from release lockfile'):
        vendor.resolve_packages({'packages': {}}, ['numpy'])


def test_sha256_matches_known_digest():
    assert vendor.sha256(b'abc') == (
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
