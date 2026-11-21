"""Day29: real detail tiers, score-cache reuse, source safety, V4 compatibility."""
import numpy as np
import pytest
from ar_drawing import day28_flow_coherent as v4
from ar_drawing import day29_detail as d29


def sample(w=160, h=128):
    y, x = np.mgrid[:h, :w]
    gray = np.full((h, w), 205, np.uint8)
    gray[((x-80)**2/40**2 + (y-68)**2/45**2 < 1)] = 155
    gray[((x-80)**2/36**2 + (y-68)**2/40**2 < 1)] = 188
    gray[(y-57)**2 + (x-65)**2 < 5**2] = 30
    gray[(y-57)**2 + (x-95)**2 < 5**2] = 30
    gray[(y==83) & (x>65) & (x<95)] = 40
    gray[(x>=10)&(x<20)&(y<128)] = 80
    return gray


def test_five_real_nested_levels():
    gray = sample()
    v4.clear_flow_cache()
    masks = [d29.process_gray8_detail(gray.tobytes(), gray.shape[1], gray.shape[0], detail=k) for k in range(1,6)]
    arrays = [np.frombuffer(m.ink,dtype=np.uint8).reshape(gray.shape).astype(bool) for m in masks]
    assert all(m.engine_version == d29.SKETCH_QUALITY_VERSION for m in masks)
    assert all(m.bridge_version == d29.BRIDGE_VERSION for m in masks)
    assert all(np.all(~a | b) for a,b in zip(arrays,arrays[1:]))
    assert 0 < masks[0].ink_pixels <= masks[-1].ink_pixels
    assert len(set(m.ink_pixels for m in masks)) >= 3
    assert all(m.ink_pixels == int(np.count_nonzero(a)) for m,a in zip(masks,arrays))
    assert all(set(m.ink).issubset({0,1}) for m in masks)


def test_shared_worker_score_cache_single_recompute(monkeypatch):
    gray=sample()
    v4.clear_flow_cache()
    calls=[]
    original=v4.flow_importance
    def wrapped(*args,**kw):
        calls.append(1)
        return original(*args,**kw)
    monkeypatch.setattr(v4,'flow_importance',wrapped)
    for detail in [3,1,5,2,4,5]:
        d29.process_gray8_detail(gray.tobytes(),gray.shape[1],gray.shape[0],detail=detail)
    assert len(calls)==1
    altered=gray.copy();altered[20,20]=0
    d29.process_gray8_detail(altered.tobytes(),gray.shape[1],gray.shape[0],detail=3)
    assert len(calls)==2
    d29.process_gray8_detail(gray.tobytes(),gray.shape[1],gray.shape[0],detail=3)
    assert len(calls)==3  # one latest source, no cross-project cache mixing
    v4.clear_flow_cache()


@pytest.mark.parametrize('bad',[0,6,-1,1.5,True,None,'3'])
def test_invalid_levels_rejected(bad):
    gray=sample(32,32)
    with pytest.raises(ValueError,match='Detail'):
        d29.process_gray8_detail(gray.tobytes(),32,32,detail=bad)


def test_empty_or_constant_image_and_invalid_length():
    src=np.full((64,80),180,np.uint8)
    assert d29.process_gray8_detail(src.tobytes(),80,64,detail=5).ink_pixels==0
    with pytest.raises(ValueError):
        d29.process_gray8_detail(src.tobytes()[:11],80,64,detail=3)


def test_historical_v4_method_still_available():
    gray=sample(80,80)
    old=v4.process_gray8_flow(gray.tobytes(),80,80)
    new=d29.process_gray8_detail(gray.tobytes(),80,80,detail=3)
    assert old.engine_version==v4.SKETCH_QUALITY_VERSION
    assert new.engine_version==d29.SKETCH_QUALITY_VERSION
    assert old.width==new.width==80
    assert old.height==new.height==80
