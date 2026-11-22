"""G31 CPython checks: style difference, nested details/widths, pixel limits,
score/tone caching, and deterministic sparse manga hatching."""
import numpy as np
import pytest

from ar_drawing import day31_manga as manga
from ar_drawing.day30_stroke import process_gray8_stroke


def scene(size=96):
    y, x = np.mgrid[:size, :size]
    # Portrait-like ellipsoid, black hair, angled shirt, two eyes and mouth.
    img = np.full((size, size), 223, dtype=np.uint8)
    face = (((x - size / 2) / (size * .26)) ** 2 +
            ((y - size * .47) / (size * .34)) ** 2 < 1)
    img[face] = 180
    img[(x > size * .25) & (x < size * .75) & (y < size * .26)] = 22
    img[((x - size * .41) ** 2 + (y - size * .45) ** 2 < size * .28)] = 28
    img[((x - size * .59) ** 2 + (y - size * .45) ** 2 < size * .28)] = 28
    img[(y > size * .63) & (y < size * .66) & (x > size * .43) & (x < size * .57)] = 38
    img[(y > size * .79) & (x > size * .1) & (x < size * .9)] = 58
    return img


def mask(image, detail=3, line='normal'):
    h, w = image.shape
    r = manga.process_gray8_manga(image.tobytes(), w, h, detail=detail, line=line)
    return np.frombuffer(r.ink, dtype=np.uint8).reshape(h, w).astype(bool), r


def test_manga_has_distinct_version_and_differs_from_sketch_v4():
    img = scene()
    manga_mask, result = mask(img)
    sketch = process_gray8_stroke(img.tobytes(), img.shape[1], img.shape[0])
    sketch_mask = np.frombuffer(sketch.ink, dtype=np.uint8).astype(bool).reshape(img.shape)
    assert result.engine_version == 'day31-manga-layers-v1'
    assert result.bridge_version == 'day31-gray8-manga-v1'
    assert manga_mask.any() and not np.array_equal(manga_mask, sketch_mask)
    assert result.ink_pixels == int(manga_mask.sum())
    assert set(result.ink).issubset({0, 1})


@pytest.mark.parametrize('line', ['thin', 'normal', 'thick'])
def test_detail_is_pixel_nested_at_fixed_width(line):
    img = scene()
    masks = [mask(img, i, line)[0] for i in range(1, 6)]
    assert np.all([np.all(a <= b) for a, b in zip(masks[:-1], masks[1:])])
    assert masks[-1].sum() > masks[0].sum()


@pytest.mark.parametrize('detail', [1, 2, 3, 4, 5])
def test_width_is_pixel_nested_at_fixed_detail(detail):
    img = scene()
    thin = mask(img, detail, 'thin')[0]
    normal = mask(img, detail, 'normal')[0]
    thick = mask(img, detail, 'thick')[0]
    assert np.all(thin <= normal)
    assert np.all(normal <= thick)
    assert thick.sum() >= normal.sum() >= thin.sum()


def test_hatch_only_in_deeper_tones_and_higher_detail():
    t = np.full((80, 80), .33, dtype=np.float32)
    assert not manga._hatch_mask(t, 3).any()
    d4 = manga._hatch_mask(t, 4)
    d5 = manga._hatch_mask(t, 5)
    assert d4.any() and np.all(d4 <= d5)
    assert not manga._hatch_mask(np.full_like(t, .92), 5).any()
    assert np.count_nonzero(d5) < t.size // 4  # traceable, not full dithering


def test_dark_mask_and_hatching_do_not_obliterate_light_paper():
    img = scene()
    m = mask(img, 5, 'thin')[0]
    assert m[:8, :8].sum() < 20  # empty corner still essentially white
    assert m[20:30, 35:60].sum() > 25  # dark hair region remains visible


def test_one_source_cache_reused_and_replaced_by_new_source():
    img = scene(80)
    a = manga._cached_manga_maps(img.tobytes(), 80, 80, 1.)
    b = manga._cached_manga_maps(img.tobytes(), 80, 80, 1.)
    assert a[0] is b[0] and a[1] is b[1] and a[2] is b[2]
    other = np.bitwise_xor(img, np.uint8(2))
    c = manga._cached_manga_maps(other.tobytes(), 80, 80, 1.)
    assert c[0] is not a[0]


@pytest.mark.parametrize('bad_detail', [0, 6, 2.0, None, True, '2'])
def test_detail_rejects_unsupported_values(bad_detail):
    with pytest.raises(ValueError):
        mask(scene(32), bad_detail)


@pytest.mark.parametrize('bad_line', ['heavy', '', None, 2, True])
def test_line_rejects_unsupported_values(bad_line):
    with pytest.raises(ValueError):
        mask(scene(32), 2, bad_line)


def test_bad_dimensions_or_bytes_rejected_before_computing():
    with pytest.raises((ValueError, TypeError)):
        manga.process_gray8_manga(b'123', 64, 64)
    with pytest.raises(ValueError):
        manga.process_gray8_manga(b'0'*16, 2, 8)
    with pytest.raises(ValueError):
        manga.process_gray8_manga(b'0' * (1025 * 4), 1025, 4)


@pytest.mark.parametrize('level', [0, 80, 180, 255])
def test_constant_source_has_no_false_manga_ink(level):
    img = np.full((80, 80), level, dtype=np.uint8)
    m, _ = mask(img, 5, 'thin')
    assert not m.any()


def test_no_cross_edge_wrapping_in_manga_thickness():
    from ar_drawing.day30_stroke import widen_contours
    a = np.zeros((11, 13), bool)
    a[0, 0] = True
    b = widen_contours(a, 'thick')
    assert not b[-1].any() and not b[:, -1].any()
    assert b[0, 0] and b[0, 1] and b[1, 0]
