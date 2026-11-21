"""SketchyAR Day 26 — multiscale contour extraction (Sketch V2).

A purpose-built, offline, NumPy-only contour detector. Three Gaussian/Sobel
scales are blended *in gradient-vector space* before ONE NMS/hysteresis pass.
It uses a per-image robust edge threshold to keep weaker face / animal outlines
without indiscriminately lowering the threshold for all images.

Unlike directly OR-ing Canny masks from multiple scales, this produces ONE
localized thin contour mask, avoids parallel duplicate edge bands, and keeps
real Draw/IndexedDB semantics in the TypeScript layer. No ML/AI is claimed.
The old Day 12/13 + Day 25 pipelines remain unmodified, for baseline tests.

Historical inspiration: image2sketch's multiple-scale image analysis;
this is an independent implementation, not a port of its lattice code.
"""
from __future__ import annotations

import numpy as np

from .sketch_engine import gaussian_blur, sobel
from .day12_edges import non_maximum_suppression, hysteresis_threshold
from .day13_bridge import BridgeResult, MAX_PIXELS

SKETCH_QUALITY_VERSION = 'day26-multiscale-v2'
BRIDGE_VERSION = 'day26-gray8-multiscale-v1'

# Scale factors and coefficients are calibrated together. In particular, a
# coarse gradient is intrinsically weaker; the coefficient partly compensates.
# Combining signed Gx/Gy before NMS avoids duplicated displaced edges.
SCALE_FACTORS = (0.75, 1.55, 3.05)
SCALE_WEIGHTS = (0.50, 1.05, 1.50)
EDGE_QUANTILE = 75.0
LOW_HYSTERESIS_RATIO = 0.40


def multiscale_contours(image: np.ndarray, *, sigma: float = 1.0,
                        low: float = 0.04, high: float = 0.10) -> np.ndarray:
    """Return a deterministic boolean 1-pixel contour mask; no input mutation.

    Legacy low/high are retained as guardrails and provenance so the Worker
    contract stays backward compatible. The actual thresholds are adaptive:
      T_high = clip(Q75(local maxima), max(0.008, 0.45*low), 1.1*high)
      T_low  = 0.4*T_high.
    This is not semantic portrait / subject detection, and is not guaranteed
    to suppress every background pattern. Keep the V1 comparison available.
    """
    src = np.asarray(image)
    if (src.ndim != 2 or src.size == 0 or src.dtype.kind not in 'fu' or
            not np.isfinite(src).all() or np.any(src < 0) or np.any(src > 1)):
        raise ValueError('Expected finite grayscale float H×W in [0,1]')
    if (not np.isfinite(sigma) or not 0.25 <= sigma <= 3.0 or
            not np.isfinite(low) or not np.isfinite(high) or
            low < 0 or high <= 0 or high > 1 or low > high):
        raise ValueError('Invalid multiscale thresholds or sigma')
    source = np.ascontiguousarray(src, dtype=np.float32)
    gx_combined = np.zeros(source.shape, dtype=np.float32)
    gy_combined = np.zeros(source.shape, dtype=np.float32)
    for scale, weight in zip(SCALE_FACTORS, SCALE_WEIGHTS):
        gx, gy, _, _ = sobel(gaussian_blur(source, float(scale * sigma)))
        gx_combined += np.float32(weight) * gx
        gy_combined += np.float32(weight) * gy
    mag = np.hypot(gx_combined, gy_combined).astype(np.float32, copy=False)
    angle = np.arctan2(gy_combined, gx_combined).astype(np.float32, copy=False)
    strength = non_maximum_suppression(mag, angle)
    candidates = strength[strength > np.float32(1e-5)]
    if candidates.size < 4:
        return np.zeros(source.shape, dtype=np.bool_)
    min_high = max(0.008, 0.45 * low)
    max_high = max(min_high, 1.10 * high)
    high_adaptive = float(np.clip(np.percentile(candidates, EDGE_QUANTILE), min_high, max_high))
    mask = hysteresis_threshold(strength, LOW_HYSTERESIS_RATIO * high_adaptive, high_adaptive)
    return mask.astype(np.bool_, copy=False)


def process_gray8_multiscale(data: bytes | bytearray | memoryview,
                              width: int, height: int,
                              sigma: float = 1.0, low: float = 0.04,
                              high: float = 0.10) -> BridgeResult:
    """Same Day 13 binary bridge contract, with Sketch V2 instead of V1.

    Return bytes 0/1; TypeScript's existing canvas encoder makes a transparent
    black PNG. Validate the buffer before allocating the Gaussian intermediates.
    """
    if (type(width) is not int or type(height) is not int or
            width < 3 or height < 3 or width > 1024 or height > 1024 or
            width * height > MAX_PIXELS):
        raise ValueError('width and height must be integer 3..1024, max 1 Mi pixels')
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError('Expected a bytes-like gray8 buffer')
    view = memoryview(data)
    if view.ndim != 1 or view.itemsize != 1 or len(view) != width * height:
        raise ValueError('Expected exactly width*height uint8 bytes')
    gray = np.frombuffer(view, dtype=np.uint8).reshape((height, width))
    mask = multiscale_contours(gray.astype(np.float32) * np.float32(1.0 / 255.0),
                               sigma=sigma, low=low, high=high)
    return BridgeResult(mask.astype(np.uint8).tobytes(order='C'), width, height,
                        int(np.count_nonzero(mask)),
                        engine_version=SKETCH_QUALITY_VERSION,
                        bridge_version=BRIDGE_VERSION)
