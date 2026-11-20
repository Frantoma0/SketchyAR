"""Day 13 input/output and regression tests for the binary Python bridge."""
import numpy as np
import pytest

from ar_drawing.day13_bridge import process_gray8, BRIDGE_VERSION, MAX_PIXELS
from ar_drawing.day12_edges import canny_like


def test_day13_matches_day12_on_identical_gray_input():
    rng = np.random.default_rng(173)
    image = rng.integers(0, 256, (64, 95), dtype=np.uint8)
    before = image.copy()
    got = process_gray8(image.tobytes(), 95, 64, sigma=1, low=.04, high=.10)
    ref = canny_like(image.astype(np.float32) / np.float32(255), sigma=1, low=.04, high=.10)
    assert got.ink == ref.astype(np.uint8).tobytes()
    assert got.ink_pixels == int(ref.sum())
    assert got.bridge_version == BRIDGE_VERSION
    assert got.width == 95 and got.height == 64
    assert np.array_equal(image, before)


def test_gray8_flat_image_has_no_ink():
    res = process_gray8(bytes([150]) * 17 * 19, 17, 19)
    assert res.ink_pixels == 0
    assert set(res.ink) == {0}


def test_bytearray_and_memoryview_supported_and_no_mutation():
    data = bytearray(range(64))
    original = bytes(data)
    for obj in (data, memoryview(data)):
        result = process_gray8(obj, 8, 8)
        assert len(result.ink) == 64
        assert set(result.ink) <= {0, 1}
    assert bytes(data) == original


@pytest.mark.parametrize('w,h,blob', [
    (0, 8, b''), (2, 5, bytes(10)), (5, 2, bytes(10)),
    (1025, 3, bytes(3075)), (8, 8, bytes(63)), (8, 8, bytes(65)),
    (8, 8, b''), (8.0, 8, bytes(64)), (8, 8.0, bytes(64)),
])
def test_invalid_dimensions_or_buffer(w, h, blob):
    with pytest.raises((ValueError, TypeError)):
        process_gray8(blob, w, h)


def test_rejects_non_bytes_input():
    with pytest.raises(TypeError):
        process_gray8([0] * 64, 8, 8)


def test_max_pixels_constant():
    assert MAX_PIXELS == 1048576


def test_engine_threshold_validation():
    with pytest.raises(ValueError):
        process_gray8(bytes(64), 8, 8, high=0)
