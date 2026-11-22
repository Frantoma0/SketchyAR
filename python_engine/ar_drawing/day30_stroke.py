"""Day 30 — real three-level line width for the V4/D1–D5 Sketch pipeline.

The score and binary contour selection are exactly the Day 28/29 algorithms.
Only the final binary mask is widened; this never re-runs ETF-lite/FDoG-lite.
Thin=1-pixel, normal=radius-1 Euclidean cross, thick=3x3 square.
The cross and square footprints are nested, so contour pixels cannot disappear when
switching to a wider stroke at a fixed detail level.
"""
from __future__ import annotations

import numpy as np

from .day13_bridge import BridgeResult
from .day28_flow_coherent import get_cached_flow_score
from .day29_detail import select_detail_contours

SKETCH_QUALITY_VERSION = 'day30-v4-stroke-v2'
BRIDGE_VERSION = 'day30-gray8-stroke-v2'
STROKES = ('thin', 'normal', 'thick')
_RADII = {'thin': 0, 'normal': 1, 'thick': 1}


def widen_contours(mask: np.ndarray, line: str = 'normal') -> np.ndarray:
    """Dilation by a small bounded cross/square footprint, without cv2/SciPy or image wrapping.

    Input must be a 2-D binary mask. Output retains binary dtype; both
    spatial dimensions are unchanged and border pixels are not wrapped.
    """
    if type(line) is not str or line not in STROKES:
        raise ValueError('Line must be thin, normal or thick')
    original = np.asarray(mask)
    if original.ndim != 2 or original.dtype != np.bool_:
        raise ValueError('Expected a 2-D boolean contour mask')
    height, width = original.shape
    radius = _RADII[line]
    out = original.copy()
    if not radius or not height or not width:
        return out

    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if (line != 'thick' and dx * dx + dy * dy > radius * radius) or (dx == 0 and dy == 0):
                continue
            source_y_start, source_y_stop = max(0, -dy), min(height, height - dy)
            source_x_start, source_x_stop = max(0, -dx), min(width, width - dx)
            if source_y_stop <= source_y_start or source_x_stop <= source_x_start:
                continue
            out[source_y_start + dy:source_y_stop + dy,
                source_x_start + dx:source_x_stop + dx] |= original[
                    source_y_start:source_y_stop, source_x_start:source_x_stop]
    return out


def process_gray8_stroke(data: bytes | bytearray | memoryview, width: int, height: int,
                         sigma: float = 1.0, low: float = 0.04, high: float = 0.10,
                         detail: int = 3, line: str = 'normal') -> BridgeResult:
    if type(line) is not str or line not in STROKES:
        raise ValueError('Line must be thin, normal or thick')
    # Day 28 owns source validation and SHA-256/size/sigma bounded score cache.
    score = get_cached_flow_score(data, width, height, sigma=sigma, low=low, high=high)
    selected = select_detail_contours(score, detail, low=low, high=high)
    mask = widen_contours(selected, line)
    return BridgeResult(mask.astype(np.uint8).tobytes(), width, height,
                        int(np.count_nonzero(mask)),
                        engine_version=SKETCH_QUALITY_VERSION,
                        bridge_version=BRIDGE_VERSION)
