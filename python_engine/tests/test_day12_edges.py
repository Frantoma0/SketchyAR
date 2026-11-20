"""Day 12: rigorous contracts for NMS, 8-connected hysteresis and pipeline."""
import numpy as np
import pytest

from ar_drawing.day12_edges import (
    DAY12_ENGINE_VERSION, non_maximum_suppression, hysteresis_threshold,
    edge_stages, canny_like, ink_preview, benchmark_day12,
)
from ar_drawing.day11_morphology import make_fixture


def peak(direction, coords):
    mag = np.zeros((7, 7), dtype=np.float32)
    theta = np.zeros_like(mag)
    # Center should beat only its two neighbors in the selected normal direction.
    mag[3, 3] = 0.9
    for y, x in coords:
        mag[y, x] = 0.2
    theta[3, 3] = np.float32(direction)
    return non_maximum_suppression(mag, theta)


@pytest.mark.parametrize('degrees,neighbors', [
    (0, [(3, 2), (3, 4)]),
    (45, [(2, 2), (4, 4)]),
    (90, [(2, 3), (4, 3)]),
    (135, [(2, 4), (4, 2)]),
    (-45, [(2, 4), (4, 2)]),
])
def test_nms_correct_gradient_axis(degrees, neighbors):
    out = peak(np.deg2rad(degrees), neighbors)
    assert out[3, 3] == pytest.approx(.9)
    assert out.dtype == np.float32


def test_nms_suppresses_weaker_center():
    mag = np.zeros((7, 7), np.float32)
    mag[3, 2], mag[3, 3], mag[3, 4] = .8, .3, .9
    theta = np.zeros_like(mag)
    assert non_maximum_suppression(mag, theta)[3, 3] == 0


def test_nms_avoids_duplicate_plateaus_and_zero_border():
    mag = np.zeros((6, 9), np.float32)
    mag[2:5, 2:7] = .6
    theta = np.zeros_like(mag)
    out = non_maximum_suppression(mag, theta)
    assert not out[0, :].any() and not out[-1, :].any()
    # One representative per horizontal plateau at each pixel row.
    assert np.all(np.count_nonzero(out, axis=1) <= 1)


def test_nms_degenerate_small_shapes():
    for shape in [(1, 7), (2, 4), (7, 1)]:
        zeros = np.ones(shape, np.float32)
        assert not non_maximum_suppression(zeros, zeros).any()


def test_nms_does_not_modify_or_share_input():
    mag = np.random.default_rng(173).random((32, 33), dtype=np.float32)
    th = np.zeros_like(mag)
    before, bt = mag.copy(), th.copy()
    out = non_maximum_suppression(mag, th)
    assert np.array_equal(mag, before) and np.array_equal(th, bt)
    assert not np.shares_memory(out, mag)


@pytest.mark.parametrize('mag,angle', [
    (np.ones((4, 5)), np.ones((5, 4))),
    (np.full((3, 4), np.nan, np.float32), np.zeros((3, 4), np.float32)),
    (np.full((3, 4), -1, np.float32), np.zeros((3, 4), np.float32)),
    (np.ones((0, 4), np.float32), np.ones((0, 4), np.float32)),
    (np.ones((3, 3), np.uint8), np.ones((3, 3), np.float32)),
    (np.ones((3, 3), np.float32), np.full((3, 3), np.inf, np.float32)),
])
def test_nms_rejects_bad_arrays(mag, angle):
    with pytest.raises(ValueError):
        non_maximum_suppression(mag, angle)


def test_hysteresis_eight_connected_diagonal_weak_chain():
    arr = np.zeros((9, 9), dtype=np.float32)
    arr[1, 1] = .9
    for i in range(2, 8):
        arr[i, i] = .3
    arr[1, 7] = .3  # Unconnected weak noise must not survive.
    res = hysteresis_threshold(arr, low=.2, high=.6)
    assert int(res.sum()) == 7
    assert res[7, 7] and not res[1, 7]
    assert res.dtype == np.bool_


def test_hysteresis_traces_long_line_without_iteration_cap():
    arr = np.full((3, 1800), 0, dtype=np.float32)
    arr[1, 5] = .8
    arr[1, 6:1790] = .25
    out = hysteresis_threshold(arr, low=.2, high=.5)
    assert out[1, 1789] and int(out.sum()) == 1785


def test_hysteresis_no_seed_and_zero_magnitude():
    src = np.zeros((5, 5), np.float32)
    src[2, 2] = .3
    assert not hysteresis_threshold(src, .2, .4).any()
    assert not hysteresis_threshold(np.zeros((5, 5), np.float32), 0, .4).any()


def test_hysteresis_boundary_no_wraparound():
    src = np.zeros((3, 4), np.float32)
    src[0, 3] = .9  # rightmost column
    src[1, 0] = .3  # next row, leftmost column, NOT adjacent
    assert int(hysteresis_threshold(src, .2, .6).sum()) == 1


def test_hysteresis_seed_counts_and_input_unchanged():
    src = np.zeros((9, 9), np.float32)
    src[3:6, 3:6] = .4
    src[4, 4] = .8
    before = src.copy()
    out = hysteresis_threshold(src, .2, .6)
    assert out.sum() == 9 and np.array_equal(src, before)
    assert not np.shares_memory(src, out)


@pytest.mark.parametrize('low,high', [
    (-.1, .1), (.5, .2), (.2, 0), (0, -1), (np.nan, .4), (.3, np.inf),
])
def test_invalid_thresholds(low, high):
    with pytest.raises(ValueError):
        hysteresis_threshold(np.ones((5, 5), np.float32), low, high)


@pytest.mark.parametrize('bad', [
    np.ones((3, 3), np.uint8),
    np.full((3, 3), np.inf, np.float32),
    np.full((3, 3), -1, np.float32),
    np.empty((3, 0), np.float32),
])
def test_hysteresis_rejects_invalid_input(bad):
    with pytest.raises(ValueError):
        hysteresis_threshold(bad, .1, .2)


def test_pipeline_flat_grayscale_and_black_returns_empty():
    for c in [0, .5, 1]:
        arr = np.full((40, 60), c, np.float32)
        stages = edge_stages(arr)
        assert stages.final.shape == arr.shape
        assert stages.final.dtype == np.bool_
        assert not stages.final.any()


def test_pipeline_detects_simple_square_without_border_wrap():
    arr = np.ones((80, 80), np.float32)
    arr[20:60, 20:60] = 0
    stages = edge_stages(arr, sigma=1, low=.04, high=.1)
    assert 80 < int(stages.final.sum()) < 500
    assert not stages.final[0].any()
    assert not stages.final[-1].any()
    assert stages.suppressed.dtype == np.float32
    assert stages.magnitude.dtype == np.float32
    assert np.all(stages.suppressed <= stages.magnitude + 1e-7)


def test_canny_like_uint8_rgb_equivalent_to_float():
    gray = np.ones((64, 64), np.uint8) * 255
    gray[16:48, 16:48] = 0
    rgb = np.repeat(gray[:, :, None], 3, axis=2)
    assert np.array_equal(canny_like(gray), canny_like(rgb))


def test_canny_like_remains_deterministic_and_pure():
    arr = make_fixture(128, 173)
    copy = arr.copy()
    a = canny_like(arr)
    b = canny_like(arr)
    assert np.array_equal(a, b)
    assert np.array_equal(arr, copy)


def test_validations_on_pipeline():
    src = np.ones((10, 10), np.float32)
    for params in [{'sigma': 0}, {'low': -.01}, {'low': .2, 'high': .1}, {'high': 0}]:
        with pytest.raises(ValueError):
            edge_stages(src, **params)
    with pytest.raises(ValueError):
        canny_like(np.full((5, 5), np.nan, np.float32))


def test_ink_preview_values():
    src = np.array([[True, False]], dtype=np.bool_)
    assert ink_preview(src).tolist() == [[0, 255]]
    with pytest.raises(ValueError):
        ink_preview(src.astype(np.uint8))


@pytest.mark.parametrize('size', [64, 128])
def test_benchmark_reproducibility(size):
    a = benchmark_day12(size=size, runs=2, seed=173)
    b = benchmark_day12(size=size, runs=2, seed=173)
    assert a['pipelineVersion'] == DAY12_ENGINE_VERSION
    assert a['nms'] == 'four-direction quantized asymmetric tie'
    assert len(a['benchmarks']) == 3
    assert a['finalPixels'] == b['finalPixels']
    assert [(r['task'], r['checksum']) for r in a['benchmarks']] == [
        (r['task'], r['checksum']) for r in b['benchmarks']]


def test_large_photo_style_input_runs_without_extra_dependencies():
    rng = np.random.default_rng(7)
    src = rng.random((256, 192), dtype=np.float32)
    out = canny_like(src, sigma=1.2, low=.04, high=.11)
    assert out.dtype == np.bool_ and out.shape == src.shape
