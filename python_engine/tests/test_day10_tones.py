"""Day 10: finite inputs, deterministic 3–5 tone maps, Sobel and XDoG composition."""
from __future__ import annotations

import numpy as np
import pytest

from ar_drawing.day10_tones import (
    DAY10_ENGINE_VERSION, benchmark_day10, sobel_ink, sobel_ink_preview,
    tone_and_ink, tone_and_ink_preview, tone_preview, tone_quantize,
)
from ar_drawing.sketch_engine import sobel


@pytest.mark.parametrize('levels', [3, 4, 5])
def test_tone_bounds_exact_palette_and_dtype(levels):
    src = np.linspace(0, 1, 80, dtype=np.float32).reshape(8, 10)
    old = src.copy()
    out = tone_quantize(src, levels)
    assert out.dtype == np.float32
    assert out.shape == src.shape
    np.testing.assert_array_equal(src, old)
    palette = np.linspace(0, 1, levels, dtype=np.float32)
    assert len(np.unique(out)) == levels
    np.testing.assert_allclose(np.unique(out), palette, atol=5e-7)
    np.testing.assert_array_equal(tone_preview(src, levels), np.rint(out*255).astype(np.uint8))


def test_tone_thresholds_and_idempotence():
    src = np.array([[0, .12, .24, .25, .49, .50, .75, .9, 1]], dtype=np.float32)
    got = tone_quantize(src, 3)
    np.testing.assert_array_equal(got, [[0, 0, 0, 0, .5, .5, 1, 1, 1]])
    np.testing.assert_allclose(tone_quantize(got, 3), got, atol=1e-7)
    assert tone_quantize(np.full((1, 1), 1, np.float32), 5)[0, 0] == 1


@pytest.mark.parametrize('bad', [2, 6, 0, 4.0, True, None, '4'])
def test_tone_bad_level_rejected(bad):
    with pytest.raises(ValueError):
        tone_quantize(np.ones((4,4), dtype=np.float32), bad)


def test_sobel_ink_is_binary_and_line_is_continuous():
    img = np.zeros((64, 64), dtype=np.float32)
    img[:, 32:] = 1
    old = img.copy()
    ink = sobel_ink(img, sigma=.65, threshold=.07)
    assert ink.dtype == np.bool_ and ink.shape == img.shape
    assert ink[3:61, 31:33].any(axis=1).all()
    assert not ink[5:59, 4:20].any()
    np.testing.assert_array_equal(img, old)
    preview = sobel_ink_preview(img, sigma=.65, threshold=.07)
    assert preview.dtype == np.uint8
    assert set(np.unique(preview)).issubset({0,255})
    assert (preview[ink] == 0).all()


def test_sobel_reference_direct_2d_convolution():
    # Independent simple 3x3 reference; avoid reusing the vectorized formula.
    img = np.random.default_rng(42).random((10, 13), dtype=np.float32)
    gx, gy, *_ = sobel(img)
    kx = np.array([[-1,0,1], [-2,0,2], [-1,0,1]], np.float32) / 8
    ky = kx.T
    padded = np.pad(img, 1, mode='reflect')
    refx = np.zeros_like(img)
    refy = np.zeros_like(img)
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            neighborhood = padded[y:y+3, x:x+3]
            refx[y,x] = np.sum(neighborhood * kx, dtype=np.float32)
            refy[y,x] = np.sum(neighborhood * ky, dtype=np.float32)
    np.testing.assert_allclose(gx, refx, atol=1e-7)
    np.testing.assert_allclose(gy, refy, atol=1e-7)


@pytest.mark.parametrize('threshold', [0, -1, 1.1, np.nan, np.inf])
def test_sobel_threshold_validation(threshold):
    with pytest.raises(ValueError):
        sobel_ink(np.zeros((3,3), dtype=np.float32), threshold=threshold)


def test_combo_preview_valid_and_non_mutating():
    img = np.zeros((24, 24), dtype=np.float32)
    img[5:19, 5:19] = .72
    unchanged = img.copy()
    for n in (3,4,5):
        out = tone_and_ink(img, levels=n, preset='balanced')
        assert out.dtype == np.float32 and out.shape == img.shape
        assert (out >= 0).all() and (out <= 1).all()
        preview = tone_and_ink_preview(img, levels=n)
        np.testing.assert_array_equal(preview, np.rint(out*255).astype(np.uint8))
    np.testing.assert_array_equal(img, unchanged)


def test_benchmark_reproducible_and_dtype_contract():
    a = benchmark_day10(16, runs=2)
    b = benchmark_day10(16, runs=1)
    assert a['pipelineVersion'] == DAY10_ENGINE_VERSION
    assert a['shape'] == [16,16] and a['dtype'] == 'float32'
    assert a['includesDecodeOrWorkerStart'] is False
    assert a['inputBytes'] == 16*16*4
    assert len(a['benchmarks']) == 4
    for x,y in zip(a['benchmarks'],b['benchmarks']):
        assert x['checksum'] == y['checksum']
        assert x['median_s'] >= 0 and len(x['seconds']) == 2
    assert a['benchmarks'][0]['uniqueValues'] <= 3
    assert a['benchmarks'][1]['uniqueValues'] <= 5
    assert a['benchmarks'][2]['outputDtype'] == 'bool'


@pytest.mark.parametrize('size,runs', [(8,2),(2049,2),(16,0),(16,31),(16,1.5)])
def test_benchmark_rejects_invalid_inputs(size, runs):
    with pytest.raises(ValueError):
        benchmark_day10(size, runs=runs)
