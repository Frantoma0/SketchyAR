"""Day 25 quality invariants: conservative, deterministic, no fake art."""
import numpy as np
import pytest

from ar_drawing.day13_bridge import process_gray8
from ar_drawing.day25_quality import (
    BRIDGE_VERSION, SKETCH_QUALITY_VERSION, bridge_single_pixel_gaps,
    process_gray8_quality, refine_sketch_mask, remove_tiny_weak_components,
)


def test_remove_weak_specks_preserve_bold_dot_and_long_silhouette():
    m = np.zeros((24, 24), dtype=bool)
    g = np.zeros(m.shape, dtype=np.float32)
    m[3, 3] = True; g[3, 3] = .12  # sensor speck
    m[8, 8] = True; g[8, 8] = .25  # tiny high-contrast drawn dot
    m[12, 2:20] = True; g[12, 2:20] = .11  # intentional hairline
    original = m.copy(); gradients = g.copy()
    result = remove_tiny_weak_components(m, g)
    assert not result[3, 3]
    assert result[8, 8]
    assert result[12, 2:20].all()
    assert np.array_equal(m, original) and np.array_equal(g, gradients)


def test_short_weak_fragments_removed_diagonal_component_of_four_retained():
    m = np.zeros((24, 24), dtype=bool)
    m[3, 3:5] = True
    m[7, 4:7] = True
    for k in range(4):
        m[14 + k, 12 + k] = True
    g = np.full(m.shape, np.float32(.12))
    out = remove_tiny_weak_components(m, g)
    assert not out[3, 3:5].any()
    assert not out[7, 4:7].any()
    assert all(out[14 + k, 12 + k] for k in range(4))


@pytest.mark.parametrize('coords', [
    ((5, 4), (5, 6), (5, 5)),
    ((4, 5), (6, 5), (5, 5)),
    ((4, 4), (6, 6), (5, 5)),
    ((4, 6), (6, 4), (5, 5)),
])
def test_repair_exact_one_pixel_opposite_gap(coords):
    a, b, center = coords
    mask = np.zeros((11, 11), dtype=bool)
    mask[a] = True; mask[b] = True
    out = bridge_single_pixel_gaps(mask)
    assert out[center]
    assert out.sum() == 3
    assert mask.sum() == 2


def test_do_not_fill_ambiguous_branch_or_boundary_or_thicken():
    m = np.zeros((12, 12), dtype=bool)
    m[5, 4] = m[5, 6] = m[4, 5] = True
    m[0, 4] = m[0, 6] = True
    m[9, 3:8] = True
    out = bridge_single_pixel_gaps(m)
    assert not out[5, 5], 'Three neighbor junction is ambiguous'
    assert not out[0, 5], 'No fabricated boundary pixels'
    assert out[9, 3:8].all()
    assert not out[8, 3:8].any(), 'Do not thicken an existing line'


def test_quality_deterministic_and_always_binary_and_source_untouched():
    rng = np.random.default_rng(25)
    src = rng.integers(0, 256, size=(88, 92), dtype=np.uint8)
    old = src.copy()
    a = process_gray8_quality(src.tobytes(), src.shape[1], src.shape[0])
    b = process_gray8_quality(src.tobytes(), src.shape[1], src.shape[0])
    assert a.ink == b.ink
    assert a.ink_pixels == np.frombuffer(a.ink, dtype=np.uint8).sum()
    assert set(a.ink).issubset({0, 1})
    assert np.array_equal(src, old)
    assert a.engine_version == SKETCH_QUALITY_VERSION
    assert a.bridge_version == BRIDGE_VERSION


def test_quality_preserves_long_square_outline_and_baseline_remains_available():
    src = np.full((100, 100), 240, dtype=np.uint8)
    src[20:80, 20:80] = 30
    legacy = process_gray8(src.tobytes(), 100, 100)
    result = process_gray8_quality(src.tobytes(), 100, 100)
    mask = np.frombuffer(result.ink, dtype=np.uint8).reshape((100, 100))
    assert legacy.engine_version == 'day12-canny-like-v1'
    assert result.ink_pixels > 150
    assert mask[16:24, 30:70].any()
    assert mask[75:84, 30:70].any()
    assert mask[30:70, 16:24].any()
    assert mask[30:70, 75:84].any()
    assert mask[35:65, 35:65].sum() == 0


def test_validation_before_work_and_malformed_strength():
    for data, w, h in [([0]*25, 5, 5), (bytes(10), 5, 5), (bytes(9), 2, 4)]:
        with pytest.raises((ValueError, TypeError)):
            process_gray8_quality(data, w, h)
    with pytest.raises(ValueError):
        process_gray8_quality(bytes(25), 5, 5, sigma=0)
    with pytest.raises(ValueError):
        process_gray8_quality(bytes(25), 5, 5, low=.2, high=.1)
    with pytest.raises(ValueError):
        remove_tiny_weak_components(np.zeros((4,4), bool), np.ones((4,4), np.float32)*np.nan)
    with pytest.raises(ValueError):
        bridge_single_pixel_gaps(np.zeros((4,4), np.uint8))


def test_cleanup_is_consistent_across_two_passes():
    m = np.zeros((17,17), bool)
    m[8, 4:8] = True
    m[8, 9:13] = True
    m[4,4] = True
    g = np.zeros((17,17), np.float32)
    g[m] = .12
    once = refine_sketch_mask(m,g)
    twice = refine_sketch_mask(once,g)
    assert np.array_equal(once,twice)
    assert once[8,8]
    assert not once[4,4]
