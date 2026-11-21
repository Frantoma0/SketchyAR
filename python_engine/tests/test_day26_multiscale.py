"""Day 26 — multiscale engine contract and backward compatibility tests."""
import numpy as np
import pytest

from ar_drawing.day26_multiscale import (
    BRIDGE_VERSION, SKETCH_QUALITY_VERSION, SCALE_FACTORS, SCALE_WEIGHTS,
    multiscale_contours, process_gray8_multiscale,
)
from ar_drawing.day25_quality import process_gray8_quality
from ar_drawing.day13_bridge import process_gray8


def _gray(shape=(96, 113)):
    y, x = np.indices(shape)
    gray = np.full(shape, 215, dtype=np.uint8)
    gray[(x - 53) ** 2 / 30 ** 2 + (y - 48) ** 2 / 35 ** 2 < 1] = 155
    gray[(x - 46) ** 2 + (y - 38) ** 2 < 5 ** 2] = 83
    gray[(x - 62) ** 2 + (y - 38) ** 2 < 5 ** 2] = 83
    gray[(y > 58) & (y < 60) & (x > 40) & (x < 68)] = 80
    return gray


def test_multiscale_is_versioned_and_numpy_only():
    assert SKETCH_QUALITY_VERSION == 'day26-multiscale-v2'
    assert BRIDGE_VERSION == 'day26-gray8-multiscale-v1'
    assert len(SCALE_FACTORS) == len(SCALE_WEIGHTS) == 3
    assert SCALE_FACTORS[0] < SCALE_FACTORS[1] < SCALE_FACTORS[2]


def test_output_is_binary_deterministic_with_matching_dimensions_and_no_mutation():
    gray = _gray()
    before = gray.copy()
    a = process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0])
    b = process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0])
    assert a.ink == b.ink
    assert len(a.ink) == gray.size
    assert 100 < a.ink_pixels < gray.size // 3
    assert set(a.ink) == {0, 1}
    assert a.ink_pixels == sum(a.ink)
    assert a.engine_version == SKETCH_QUALITY_VERSION
    assert a.bridge_version == BRIDGE_VERSION
    assert np.array_equal(gray, before)


def test_weak_contours_kept_in_a_synthetic_face_not_just_high_contrast_ink():
    gray = _gray()
    result = np.frombuffer(process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0]).ink,
                           dtype=np.uint8).reshape(gray.shape).astype(bool)
    assert result[14:82, 19:87].sum() > 100
    assert result[28:49, 38:70].any()
    # Eyebrows/eyes and a silhouette are retained; extremely short fine
    # strokes such as a synthetic two-pixel mouth are not guaranteed.


def test_uniform_gray_produces_no_fabricated_edges():
    for value in (0, 88, 255):
        gray = np.full((48, 64), value, dtype=np.uint8)
        result = process_gray8_multiscale(gray.tobytes(), 64, 48)
        assert result.ink_pixels == 0 and set(result.ink) == {0}


def test_source_is_unmodified_and_old_v1_v25_still_callable():
    gray = _gray()
    old = process_gray8(gray.tobytes(), gray.shape[1], gray.shape[0])
    day25 = process_gray8_quality(gray.tobytes(), gray.shape[1], gray.shape[0])
    v2 = process_gray8_multiscale(gray.tobytes(), gray.shape[1], gray.shape[0])
    assert old.engine_version == 'day12-canny-like-v1'
    assert day25.engine_version == 'day25-sketch-quality-v1'
    assert v2.engine_version == 'day26-multiscale-v2'
    # The new pipeline is an actual change on this reduced-contrast fixture.
    assert v2.ink != day25.ink
    assert old.ink == process_gray8(gray.tobytes(), gray.shape[1], gray.shape[0]).ink


@pytest.mark.parametrize('bad,w,h', [
    (bytes(23), 5, 5),
    (bytes(25), 0, 5),
    (bytes(25), 5, 0),
    (bytes(25), 1025, 2),
    (bytes(6), 2, 3),
    ([12] * 25, 5, 5),
])
def test_invalid_input_is_rejected_before_computation(bad, w, h):
    with pytest.raises((ValueError, TypeError)):
        process_gray8_multiscale(bad, w, h)


@pytest.mark.parametrize('opts', [
    {'sigma': 0}, {'sigma': 4}, {'sigma': np.nan},
    {'low': -.1}, {'high': 0}, {'high': 1.1},
    {'low': .2, 'high': .1}, {'high': np.inf},
])
def test_invalid_processing_parameters_rejected(opts):
    with pytest.raises(ValueError):
        process_gray8_multiscale(bytes(25), 5, 5, **opts)


def test_direct_mask_validation_and_reproducible_float_grayscale():
    gray = _gray().astype(np.float32) / 255.0
    a = multiscale_contours(gray)
    b = multiscale_contours(gray.copy())
    assert a.dtype == np.bool_
    assert np.array_equal(a, b)
    with pytest.raises(ValueError):
        multiscale_contours(np.full((4, 4), np.nan, np.float32))
    with pytest.raises(ValueError):
        multiscale_contours(np.ones((5, 5), np.float32) * 1.01)
