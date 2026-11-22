"""G30: real three stroke widths, source+detail cache, backward compatibility."""
import numpy as np
import pytest
from ar_drawing import day28_flow_coherent as v4
from ar_drawing import day29_detail as d29
from ar_drawing import day30_stroke as d30


def sample(w=96, h=80):
    y, x = np.mgrid[:h, :w]
    gray = np.full((h, w), 185, np.uint8)
    gray[((x-w//2)**2 + (y-h//2)**2) < 25**2] = 95
    gray[15:17, 15:w-15] = 25
    return gray


def unpack(result):
    return np.frombuffer(result.ink, np.uint8).reshape(result.height, result.width).astype(bool)


def test_exact_stroke_geometry_center_and_borders():
    mask = np.zeros((11, 11), bool)
    mask[5, 5] = True
    thin = d30.widen_contours(mask, 'thin')
    normal = d30.widen_contours(mask, 'normal')
    thick = d30.widen_contours(mask, 'thick')
    assert (thin.sum(), normal.sum(), thick.sum()) == (1, 5, 13)
    assert np.all(thin <= normal) and np.all(normal <= thick)
    assert np.array_equal(thin, mask)
    mask[:] = False
    mask[0, 0] = True
    edge = d30.widen_contours(mask, 'thick')
    assert edge.sum() == 6 and not edge[-1, -1]


@pytest.mark.parametrize('detail', range(1,6))
def test_all_three_widths_are_real_and_nested_for_each_detail(detail):
    gray = sample()
    results = [d30.process_gray8_stroke(gray.tobytes(), gray.shape[1], gray.shape[0],
                                         detail=detail, line=line) for line in d30.STROKES]
    masks = list(map(unpack, results))
    assert all(result.engine_version == d30.SKETCH_QUALITY_VERSION for result in results)
    assert all(result.bridge_version == d30.BRIDGE_VERSION for result in results)
    assert all(set(r.ink).issubset({0,1}) for r in results)
    assert all(np.all(~a | b) for a,b in zip(masks, masks[1:]))
    assert all(r.ink_pixels == int(m.sum()) for r,m in zip(results,masks))
    assert results[-1].ink_pixels > results[0].ink_pixels


@pytest.mark.parametrize('line', d30.STROKES)
def test_detail_nesting_survives_dilation(line):
    gray = sample()
    masks = [unpack(d30.process_gray8_stroke(gray.tobytes(), gray.shape[1], gray.shape[0],
                                           detail=detail, line=line)) for detail in range(1,6)]
    assert all(np.all(~a | b) for a,b in zip(masks,masks[1:]))


def test_reuses_exact_same_v4_score_once_for_all_15_variants(monkeypatch):
    src = sample()
    v4.clear_flow_cache()
    times = []
    original = v4.flow_importance
    def counted(*args, **kwargs):
        times.append(1)
        return original(*args, **kwargs)
    monkeypatch.setattr(v4, 'flow_importance', counted)
    for detail in (1,2,3,4,5):
        for line in ('thin','normal','thick'):
            d30.process_gray8_stroke(src.tobytes(),src.shape[1],src.shape[0],detail=detail,line=line)
    assert len(times) == 1
    changed = src.copy(); changed[1,1] ^= 5
    d30.process_gray8_stroke(changed.tobytes(),changed.shape[1],changed.shape[0])
    assert len(times) == 2
    v4.clear_flow_cache()


def test_normal_width_matches_d29_contours_after_only_dilation():
    gray=sample()
    d29_bridge=d29.process_gray8_detail(gray.tobytes(),gray.shape[1],gray.shape[0],detail=3)
    expected=d30.widen_contours(unpack(d29_bridge), 'normal')
    actual=unpack(d30.process_gray8_stroke(gray.tobytes(),gray.shape[1],gray.shape[0],detail=3))
    assert np.array_equal(expected,actual)


@pytest.mark.parametrize('bad',[None,1,'Thin','wide','',True])
def test_invalid_stroke_rejected(bad):
    img=sample()
    with pytest.raises(ValueError,match='Line'):
        d30.process_gray8_stroke(img.tobytes(),img.shape[1],img.shape[0],line=bad)


def test_constant_image_remains_empty_no_fake_contours():
    gray=np.full((48,64),200,np.uint8)
    for line in d30.STROKES:
        output=d30.process_gray8_stroke(gray.tobytes(),64,48,detail=5,line=line)
        assert output.ink_pixels == 0


def test_invalid_input_and_invalid_detail_still_rejected():
    img=sample()
    with pytest.raises(ValueError): d30.process_gray8_stroke(img.tobytes()[:-1],img.shape[1],img.shape[0])
    with pytest.raises(ValueError): d30.process_gray8_stroke(img.tobytes(),img.shape[1],img.shape[0],detail=0)
