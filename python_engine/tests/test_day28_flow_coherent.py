"""Day28 V4 flow-coherent NumPy contract, cache and portrait regressions."""

import numpy as np
import pytest

import ar_drawing.day28_flow_coherent as v4
from ar_drawing.day27_importance import process_gray8_importance


def make_portrait(width=170, height=180):
    yy, xx = np.indices((height, width))
    img = np.full((height, width), 214, dtype=np.uint8)
    ellipse = ((xx-width*.50)/(width*.31))**2 + ((yy-height*.50)/(height*.39))**2 < 1
    img[ellipse] = 175
    img[((xx-width*.39)/8)**2+((yy-height*.45)/4)**2 < 1] = 57
    img[((xx-width*.61)/8)**2+((yy-height*.45)/4)**2 < 1] = 57
    img[(xx>width*.43)&(xx<width*.58)&(yy>height*.64)&(yy<height*.65)] = 58
    return img


def test_version_and_staged_implementation():
    assert v4.SKETCH_QUALITY_VERSION == 'day28-flow-coherent-v4'
    assert v4.BRIDGE_VERSION == 'day28-gray8-flow-v1'
    assert len(v4.SCALES) == len(v4.WEIGHTS) == 3


@pytest.mark.parametrize('shade', [0, 23, 127, 255])
def test_flat_images_do_not_hallucinate(shade):
    v4.clear_flow_cache()
    result = v4.process_gray8_flow(bytes([shade]) * (60 * 80), 80, 60)
    assert result.ink_pixels == 0
    assert set(result.ink) == {0}


def test_real_v4_binary_deterministic_and_read_only():
    data = make_portrait()
    untouched = data.copy()
    a = v4.process_gray8_flow(data.tobytes(), data.shape[1], data.shape[0])
    b = v4.process_gray8_flow(memoryview(data.tobytes()), data.shape[1], data.shape[0])
    assert a.ink == b.ink
    assert a.ink_pixels == sum(a.ink)
    assert a.engine_version == v4.SKETCH_QUALITY_VERSION
    assert a.bridge_version == v4.BRIDGE_VERSION
    assert len(a.ink) == data.size
    assert 0 < a.ink_pixels < data.size * .20
    assert set(a.ink).issubset({0, 1})
    assert np.array_equal(data, untouched)


def test_portrait_eye_and_outer_face_still_exist():
    data=make_portrait()
    result=v4.process_gray8_flow(data.tobytes(),data.shape[1],data.shape[0])
    mask=np.frombuffer(result.ink,dtype=np.uint8).reshape(data.shape)
    assert mask[70:95, 45:125].sum() > 35
    assert mask[24:170, 26:150].sum() > 150
    # Different from V3 numerically, not just a renamed pipeline string.
    previous=process_gray8_importance(data.tobytes(),data.shape[1],data.shape[0])
    assert previous.ink != result.ink


def test_score_stages_float32_finite_and_non_destructive():
    photo=make_portrait().astype(np.float32)/np.float32(255.0)
    frozen=photo.copy()
    stage_maps=[v4.flow_importance(photo,stage=s) for s in
                ('baseline','preprocess','flow','fusion')]
    for score in stage_maps:
        assert score.shape == photo.shape and score.dtype==np.float32
        assert np.all(np.isfinite(score)) and np.min(score)>=0
    assert not np.array_equal(stage_maps[0],stage_maps[-1])
    assert np.array_equal(photo,frozen)


def test_cache_hits_and_keys_change_with_photo_and_sigma(monkeypatch):
    v4.clear_flow_cache()
    photo=make_portrait()
    count={'n':0}
    compute=v4.flow_importance
    def counted(*args,**kwargs):
        count['n']+=1
        return compute(*args,**kwargs)
    monkeypatch.setattr(v4,'flow_importance',counted)
    v4.process_gray8_flow(photo.tobytes(),170,180)
    v4.process_gray8_flow(photo.tobytes(),170,180,low=.03,high=.09)
    assert count['n']==1
    v4.process_gray8_flow(photo.tobytes(),170,180,sigma=1.1)
    assert count['n']==2
    changed=photo.copy(); changed[20:30,20:30]=55
    v4.process_gray8_flow(changed.tobytes(),170,180,sigma=1.1)
    assert count['n']==3
    assert v4._SCORE_CACHE[1].shape==(180,170)
    assert v4._SCORE_CACHE[1].dtype==np.float32
    v4.clear_flow_cache()
    assert v4._SCORE_CACHE is None


@pytest.mark.parametrize('args',[ (b'123',5,5),(bytes(25),2,12),
    (bytes(25),5,2),(bytes(25),5.0,5), (bytes(25),True,5),
    (bytes(25),1025,1),([0]*25,5,5) ])
def test_reject_invalid_bridge_input(args):
    with pytest.raises((ValueError,TypeError)):
        v4.process_gray8_flow(*args)


@pytest.mark.parametrize('settings',[{'sigma':np.nan},{'sigma':0.1},{'sigma':4},
     {'low':-1},{'high':np.inf},{'high':0},{'high':1.2},
     {'low':.3,'high':.1}])
def test_reject_bad_settings(settings):
    with pytest.raises(ValueError):
        v4.process_gray8_flow(bytes(25),5,5,**settings)


def test_reject_invalid_score_and_stages():
    with pytest.raises(ValueError):
        v4.flow_importance(np.zeros((5,5),np.uint8))
    with pytest.raises(ValueError):
        v4.flow_importance(np.full((5,5),np.nan,np.float32))
    with pytest.raises(ValueError):
        v4.flow_importance(np.ones((5,5,3),np.float32))
    with pytest.raises(ValueError):
        v4.flow_importance(np.zeros((5,5),np.float32),stage='not-supported')


def test_cache_is_one_image_only_not_a_gallery_of_private_sources():
    v4.clear_flow_cache()
    a=make_portrait()
    b=255-a
    v4.process_gray8_flow(a.tobytes(),170,180)
    previous=v4._SCORE_CACHE[0]
    v4.process_gray8_flow(b.tobytes(),170,180)
    assert v4._SCORE_CACHE[0]!=previous
    assert len(v4._SCORE_CACHE)==2
