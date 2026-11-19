"""Day 11: deterministic NumPy-only Otsu/morphology contracts."""
import numpy as np
import pytest
from ar_drawing.day11_morphology import (
    otsu_threshold, binary_morphology, ink_preview, make_fixture, benchmark_day11
)


def test_otsu_black_on_white():
    src = np.ones((10, 10), dtype=np.float32)
    src[2:8, 2:8] = 0
    t, ink = otsu_threshold(src)
    assert t == 0
    assert int(ink.sum()) == 36
    assert ink[2, 2] and not ink[0, 0]


def test_otsu_light_foreground():
    src = np.ones((8, 8), dtype=np.float32)
    src[2:6, 2:6] = 0
    t, light = otsu_threshold(src, foreground='light')
    assert t == 0 and light.sum() == 48


@pytest.mark.parametrize('constant', [0., .4, 1.])
def test_otsu_flat_image_is_empty(constant):
    t, mask = otsu_threshold(np.full((5, 7), constant, dtype=np.float32))
    assert t >= 0 and mask.dtype == np.bool_ and not mask.any()


def test_otsu_rgb_and_uint8():
    rgb = np.zeros((12, 12, 3), dtype=np.uint8)
    rgb[:, 6:] = 255
    t, dark = otsu_threshold(rgb)
    assert t == 0 and dark[:, :6].all() and not dark[:, 6:].any()


@pytest.mark.parametrize('operation', ['erode', 'dilate', 'open', 'close'])
def test_morphology_type_shape_input_unchanged(operation):
    source = np.zeros((7, 9), dtype=bool)
    source[2:5, 3:6] = True
    source_copy = source.copy()
    out = binary_morphology(source, operation, kernel_size=3)
    assert out.shape == source.shape and out.dtype == np.bool_
    assert np.array_equal(source, source_copy)
    assert not np.shares_memory(source, out)


def test_erosion_center_square():
    source = np.zeros((7, 7), bool)
    source[1:6, 1:6] = True
    out = binary_morphology(source, 'erode', kernel_size=3)
    assert out.sum() == 9 and out[3, 3] and not out[1, 1]


def test_dilation_single_pixel_and_border():
    source = np.zeros((7, 7), bool)
    source[0, 0] = True
    out = binary_morphology(source, 'dilate')
    assert out.sum() == 4 and out[:2, :2].all()
    assert not out[-1, -1]


def test_opening_removes_isolated_noise():
    source = np.zeros((9, 9), bool)
    source[2:7, 2:7] = True
    source[0, 0] = True
    out = binary_morphology(source, 'open')
    assert not out[0, 0] and out[4, 4]
    assert out.sum() == 25


def test_closing_fills_single_hole():
    source = np.zeros((9, 9), bool)
    source[2:7, 2:7] = True
    source[4, 4] = False
    out = binary_morphology(source, 'close')
    assert out[4, 4] and out.sum() == 25


def test_kernel_one_is_identity_for_all_operators():
    source = np.array([[False, True, False], [True, False, True]], bool)
    for op in ['erode', 'dilate', 'open', 'close']:
        assert np.array_equal(binary_morphology(source, op, kernel_size=1), source)


def test_iteration_count_dilation():
    source = np.zeros((9, 9), bool)
    source[4, 4] = True
    out = binary_morphology(source, 'dilate', iterations=2)
    assert out.sum() == 25


def test_kernel_five():
    source = np.zeros((9, 9), bool)
    source[4, 4] = True
    assert binary_morphology(source, 'dilate', kernel_size=5).sum() == 25


def test_erosion_on_full_image_shrinks_boundary():
    out = binary_morphology(np.ones((5, 5), bool), 'erode')
    assert out.sum() == 9 and not out[0].any()


def test_ink_preview_colors():
    mask = np.array([[True, False]], bool)
    assert ink_preview(mask).tolist() == [[0, 255]]
    assert ink_preview(mask).dtype == np.uint8


@pytest.mark.parametrize('bad', ['foo', None, 1])
def test_invalid_operation(bad):
    with pytest.raises(ValueError):
        binary_morphology(np.zeros((5, 5), bool), bad)


@pytest.mark.parametrize('bad', [0, 2, 4, 7, True, 3.])
def test_bad_kernel(bad):
    with pytest.raises(ValueError):
        binary_morphology(np.zeros((5, 5), bool), 'open', kernel_size=bad)


@pytest.mark.parametrize('bad', [0, -1, 5, 1.5, True])
def test_bad_iterations(bad):
    with pytest.raises(ValueError):
        binary_morphology(np.zeros((5, 5), bool), 'open', iterations=bad)


def test_morphology_reject_non_bool_or_empty():
    for src in [np.zeros((2, 2), np.uint8), np.zeros((0, 5), bool), np.zeros((2, 2, 2), bool)]:
        with pytest.raises(ValueError):
            binary_morphology(src, 'open')


def test_otsu_reject_invalid_input():
    for src in [np.full((4, 4), np.nan, dtype=np.float32), np.ones((0, 0), dtype=np.float32)]:
        with pytest.raises(ValueError):
            otsu_threshold(src)
    with pytest.raises(ValueError):
        otsu_threshold(np.zeros((4, 4), np.float32), foreground='pink')


def test_fixture_deterministic():
    assert np.array_equal(make_fixture(64), make_fixture(64))
    assert not np.array_equal(make_fixture(64, 12), make_fixture(64, 13))


@pytest.mark.parametrize('size', [64, 128])
def test_benchmark_determinism(size):
    a = benchmark_day11(size=size, runs=2, seed=173)
    b = benchmark_day11(size=size, runs=2, seed=173)
    assert a['pipelineVersion'] == 'day11-otsu-morph-v1'
    assert a['otsuThresholdUint8'] == b['otsuThresholdUint8']
    assert len(a['benchmarks']) == 4
    assert [(x['task'], x['checksum']) for x in a['benchmarks']] == [(x['task'], x['checksum']) for x in b['benchmarks']]
    assert all(x['median_s'] >= 0 for x in a['benchmarks'])
