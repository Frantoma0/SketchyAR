"""Day 27: new active importance-aware Sketch V3, with historical V2 intact."""

import numpy as np
import pytest

from ar_drawing.day27_importance import (
    SKETCH_QUALITY_VERSION, BRIDGE_VERSION, SCALE_FACTORS,
    importance_contours, contour_importance, process_gray8_importance,
)
from ar_drawing.day26_multiscale import process_gray8_multiscale
from ar_drawing.day25_quality import process_gray8_quality
from ar_drawing.day13_bridge import process_gray8


def synthetic_portrait():
    y, x = np.indices((150, 170))
    photo = np.full((150, 170), 220, np.uint8)
    face = ((x - 90) / 43) ** 2 + ((y - 72) / 56) ** 2 < 1
    photo[face] = 175
    photo[(x - 73) ** 2 + (y - 62) ** 2 < 5 ** 2] = 94
    photo[(x - 106) ** 2 + (y - 62) ** 2 < 5 ** 2] = 94
    photo[(x > 80) & (x < 100) & (y > 97) & (y < 100)] = 74
    return photo


def test_contract_and_version():
    assert SKETCH_QUALITY_VERSION == 'day27-importance-v3'
    assert BRIDGE_VERSION == 'day27-gray8-importance-v1'
    assert len(SCALE_FACTORS) == 3
    assert sorted(SCALE_FACTORS) == list(SCALE_FACTORS)


def test_portrait_features_survive_and_v3_is_not_v2():
    gray = synthetic_portrait()
    frozen = gray.copy()
    a = process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0])
    b = process_gray8_importance(gray.tobytes(), gray.shape[1], gray.shape[0])
    assert b.ink != a.ink  # actual changed algorithm, not only a version string
    out = np.frombuffer(b.ink, dtype=np.uint8).reshape(gray.shape).astype(bool)
    assert out[55:69, 64:115].sum() >= 40  # eyes remain outlined
    assert out[20:140, 40:140].sum() >= 200  # silhouette survives
    assert b.ink_pixels <= a.ink_pixels  # reduced clutter on this fixture
    assert np.array_equal(gray, frozen)


def test_bridge_is_deterministic_binary_and_uses_same_dimensions():
    gray = synthetic_portrait()
    x = process_gray8_importance(gray.tobytes(), gray.shape[1], gray.shape[0])
    y = process_gray8_importance(memoryview(gray.tobytes()), gray.shape[1], gray.shape[0])
    assert x.ink == y.ink
    assert len(x.ink) == gray.size
    assert set(x.ink) == {0, 1}
    assert x.ink_pixels == sum(x.ink)
    assert x.engine_version == SKETCH_QUALITY_VERSION
    assert x.bridge_version == BRIDGE_VERSION


@pytest.mark.parametrize('shade', [0, 60, 155, 255])
def test_flat_images_do_not_hallucinate_lines(shade):
    result = process_gray8_importance(bytes([shade]) * (48 * 64), 64, 48)
    assert result.ink_pixels == 0


def test_structural_score_float32_finite_and_non_mutating():
    original = synthetic_portrait().astype(np.float32) / 255
    before = original.copy()
    importance = contour_importance(original)
    mask = importance_contours(original)
    assert importance.dtype == np.float32
    assert importance.shape == mask.shape == original.shape
    assert mask.dtype == np.bool_
    assert np.isfinite(importance).all() and (importance >= 0).all()
    assert np.array_equal(original, before)
    assert np.array_equal(mask, importance_contours(original.copy()))
    assert importance.sum() > 0


@pytest.mark.parametrize('args', [
    (bytes(24), 5, 5), (bytes(25), 2, 12), (bytes(25), 5, 2),
    (bytes(25), 1025, 1), (bytes(25), 0, 5), ([1] * 25, 5, 5),
    (bytes(25), 5.0, 5), (bytes(25), True, 5),
])
def test_bad_buffer_shape_and_type_rejected_before_processing(args):
    with pytest.raises((ValueError, TypeError)):
        process_gray8_importance(*args)


@pytest.mark.parametrize('kwargs', [
    {'sigma': 0}, {'sigma': 3.1}, {'sigma': np.nan},
    {'low': -0.1}, {'high': 0}, {'high': np.inf},
    {'high': 1.1}, {'low': 0.2, 'high': 0.1},
])
def test_bad_parameters_rejected(kwargs):
    with pytest.raises(ValueError):
        process_gray8_importance(bytes(25), 5, 5, **kwargs)


def test_direct_score_rejects_invalid_inputs():
    with pytest.raises(ValueError):
        contour_importance(np.zeros((4, 4), dtype=np.uint8))
    with pytest.raises(ValueError):
        contour_importance(np.full((4, 4), np.nan, dtype=np.float32))
    with pytest.raises(ValueError):
        contour_importance(np.full((4, 4), -0.1, dtype=np.float32))
    with pytest.raises(ValueError):
        contour_importance(np.zeros((4, 4, 3), dtype=np.float32))


def test_historical_v1_day25_and_v2_are_still_callable_unmodified():
    gray = synthetic_portrait()
    a = process_gray8(gray.tobytes(), gray.shape[1], gray.shape[0])
    b = process_gray8_quality(gray.tobytes(), gray.shape[1], gray.shape[0])
    c = process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0])
    d = process_gray8_importance(gray.tobytes(), gray.shape[1], gray.shape[0])
    assert a.engine_version == 'day12-canny-like-v1'
    assert b.engine_version == 'day25-sketch-quality-v1'
    assert c.engine_version == 'day26-multiscale-v2'
    assert d.engine_version == SKETCH_QUALITY_VERSION
    assert c.ink != d.ink
