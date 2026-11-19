"""Day 9 behavior, numeric contracts, edge cases, and deterministic results."""
from __future__ import annotations

import numpy as np
import pytest

from ar_drawing.sketch_engine import (
    PRESETS, benchmark, gaussian_blur, gaussian_kernel, sketch_preview,
    sobel, to_grayscale, xdog, xdog_preset,
)


def test_input_validation_and_rgb_grayscale():
    rgb = np.zeros((4, 5, 3), np.uint8)
    rgb[:, :, 1] = 255
    out = to_grayscale(rgb)
    assert out.dtype == np.float32 and out.shape == (4, 5)
    np.testing.assert_allclose(out, .7152, atol=1e-6)
    assert to_grayscale(np.zeros((1, 1, 4), np.uint8)).shape == (1, 1)
    with pytest.raises(ValueError):
        to_grayscale(np.array([[np.nan]], dtype=np.float32))
    with pytest.raises(ValueError):
        to_grayscale(np.ones((1, 1), np.float32) * 1.1)
    with pytest.raises(TypeError):
        to_grayscale(np.ones((3, 3), dtype=np.uint16))
    with pytest.raises(ValueError):
        to_grayscale(np.empty((0, 4), dtype=np.uint8))
    with pytest.raises(ValueError):
        to_grayscale(np.zeros((3, 3, 2), dtype=np.uint8))


@pytest.mark.parametrize('sigma', [0.35, 0.75, 1.0, 2.5, 5.0])
def test_gaussian_kernel_normalized_symmetric(sigma):
    k = gaussian_kernel(sigma)
    assert k.dtype == np.float32
    assert k.sum() == pytest.approx(1.0, abs=2e-7)
    np.testing.assert_array_equal(k, k[::-1])


@pytest.mark.parametrize('sigma', [0.5, 1, 3])
def test_gaussian_preserves_constants_and_dtype(sigma):
    src = np.full((19, 23), .3, np.float32)
    out = gaussian_blur(src, sigma)
    assert out.dtype == np.float32 and out.shape == src.shape
    np.testing.assert_allclose(out, .3, atol=2e-6)
    assert src[0, 0] == pytest.approx(.3)  # no source mutation


def test_gaussian_impulse_symmetric_and_singleton_shape():
    impulse = np.zeros((13, 13), np.float32)
    impulse[6, 6] = 1
    blurred = gaussian_blur(impulse, 1)
    np.testing.assert_allclose(blurred, blurred[::-1, :], atol=1e-7)
    np.testing.assert_allclose(blurred, blurred[:, ::-1], atol=1e-7)
    assert blurred[6, 6] > blurred[6, 5] > blurred[6, 2]
    assert gaussian_blur(np.array([[.5]], np.float32), .8).shape == (1, 1)


def test_sobel_vertical_edge_and_orientation():
    image = np.zeros((21, 21), np.float32)
    image[:, 10:] = 1.0
    gx, gy, mag, angle = sobel(image)
    assert all(x.dtype == np.float32 for x in (gx, gy, mag, angle))
    assert np.mean(mag[:, 9:11]) > np.mean(mag[:, :6]) * 20
    np.testing.assert_allclose(gy[2:-2, 8:12], 0, atol=1e-7)
    np.testing.assert_allclose(angle[2:-2, 9:11], 0, atol=1e-6)
    np.testing.assert_allclose(gx[2:-2, 9:11], .5, atol=1e-6)


def test_sobel_constant_and_horizontal_edge():
    _, _, mag, direction = sobel(np.full((9, 9), .6, np.float32))
    np.testing.assert_allclose(mag, 0, atol=1e-7)
    assert np.isfinite(direction).all()
    im = np.zeros((16, 18), np.float32)
    im[8:, :] = 1.0
    gx, gy, mag, direction = sobel(im)
    np.testing.assert_allclose(gx, 0, atol=1e-7)
    assert (gy[7, 3:-3] > 0).all()
    np.testing.assert_allclose(direction[7, 3:-3], np.pi / 2, atol=1e-6)


@pytest.mark.parametrize('preset', list(PRESETS))
def test_xdog_presets_valid_and_non_mutating(preset):
    src = np.zeros((40, 40), np.float32)
    src[10:30, 10:30] = .8
    original = src.copy()
    out = xdog_preset(src, preset)
    assert out.dtype == np.float32 and out.shape == src.shape
    assert np.isfinite(out).all()
    assert out.min() >= 0 and out.max() <= 1
    assert np.any(out < .99), 'Expected at least some visible ink at rectangle border'
    np.testing.assert_array_equal(src, original)
    uint8 = sketch_preview(src, preset)
    assert uint8.dtype == np.uint8 and uint8.shape == src.shape
    np.testing.assert_array_equal(uint8, np.rint(out * 255).astype(np.uint8))


def test_xdog_blank_is_white_and_parameters_fail():
    for val in [0.0, .5, 1.0]:
        np.testing.assert_allclose(xdog(np.full((30, 30), val, np.float32)), 1, atol=1e-7)
    with pytest.raises(ValueError):
        xdog_preset(np.zeros((2, 2), np.float32), 'unknown')
    for kw in ({'sigma': 0}, {'sigma': 8, 'k': 2}, {'k': 1}, {'tau': 2}, {'phi': 0}, {'epsilon': np.nan}):
        with pytest.raises(ValueError):
            xdog(np.zeros((8, 8), np.float32), **kw)


def test_benchmark_contract_and_checksum():
    x = benchmark(size=16, runs=2)
    y = benchmark(size=16, runs=1)
    assert x['shape'] == [16, 16] and x['dtype'] == 'float32'
    assert len(x['benchmarks']) == 3 and x['runs'] == 2
    for a, b in zip(x['benchmarks'], y['benchmarks']):
        assert a['median_s'] >= 0 and len(a['seconds']) == 2
        assert a['checksum'] == b['checksum']
    with pytest.raises(ValueError):
        benchmark(size=8)
