"""SketchyAR Day 27 — importance-aware multiscale contour selection (Sketch V3).

Offline, deterministic, NumPy-only line extractor. V3 starts with multiscale
vector gradients, but scores candidate contours for agreement across scales
and soft local texture congestion *before* a single NMS/hysteresis decision.
This is classical signal processing, NOT face detection, a trained model, or
semantic understanding of eye/nose/hair. Image-specific visual QA is required.

The V1, Day25, and V2 implementations stay on disk as inactive benchmarks.
No OpenCV, SciPy, Pillow, remote services, or model weights in the iPhone Worker.
Independent implementation informed by public sketch-extraction research.
"""
from __future__ import annotations

import numpy as np

from .sketch_engine import gaussian_blur, sobel
from .day12_edges import non_maximum_suppression, hysteresis_threshold
from .day13_bridge import BridgeResult, MAX_PIXELS

SKETCH_QUALITY_VERSION = 'day27-importance-v3'
BRIDGE_VERSION = 'day27-gray8-importance-v1'
SCALE_FACTORS = (0.75, 1.55, 3.05)
SCALE_WEIGHTS = (0.50, 1.05, 1.50)
EDGE_QUANTILE = 80.0
HYSTERESIS_RATIO = 0.50


def _neighbor_support(mask: np.ndarray) -> np.ndarray:
    """8-neighbor count without boundary wraparound or modifying input."""
    p = np.pad(mask.astype(np.uint8, copy=False), 1, mode='constant')
    return (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] +
            p[1:-1, :-2] + p[1:-1, 2:] +
            p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:])


def contour_importance(image: np.ndarray, *, sigma: float = 1.0) -> np.ndarray:
    """Return float32 H×W NMS strength weighted by structural importance.

    1. Three signed gradient fields retain both fine and coarse contours.
    2. A single vector-field NMS avoids parallel displaced outlines.
    3. Persistent mid/coarse gradient responses weight meaningful structure;
       no hard suppression of small details just because they are fine scale.
    4. Local density of fine gradients applies a bounded *soft* penalty to
       grass/hair/background texture, rather than erasing areas wholesale.
    """
    source = np.asarray(image)
    if (source.ndim != 2 or not source.size or source.dtype.kind != 'f' or
            not np.isfinite(source).all() or np.any(source < 0) or np.any(source > 1)):
        raise ValueError('Expected finite grayscale float H×W in [0,1]')
    if not np.isfinite(sigma) or not 0.25 <= sigma <= 3.0:
        raise ValueError('sigma must be finite in [0.25, 3.0]')

    gray = np.ascontiguousarray(source, dtype=np.float32)
    scaled = []
    gx_sum = np.zeros(gray.shape, dtype=np.float32)
    gy_sum = np.zeros(gray.shape, dtype=np.float32)
    for factor, weight in zip(SCALE_FACTORS, SCALE_WEIGHTS):
        gx, gy, mag, _ = sobel(gaussian_blur(gray, factor * sigma))
        scaled.append(mag)
        gx_sum += np.float32(weight) * gx
        gy_sum += np.float32(weight) * gy
    strength = np.hypot(gx_sum, gy_sum).astype(np.float32, copy=False)
    angle = np.arctan2(gy_sum, gx_sum).astype(np.float32, copy=False)
    thin = non_maximum_suppression(strength, angle)
    if not np.any(thin > 1e-5):
        return thin

    fine, middle, coarse = scaled
    # The multiplier compensates for the naturally lower magnitudes at broad
    # scales. Ratios are clipped to avoid amplifying noise in flat regions.
    medium_persistence = np.clip(np.float32(1.30) * middle / (fine + np.float32(0.002)), 0, 1)
    coarse_persistence = np.clip(np.float32(1.75) * coarse / (middle + np.float32(0.002)), 0, 1)
    persistence = (np.float32(0.25) + np.float32(0.34) * medium_persistence +
                   np.float32(0.41) * coarse_persistence)

    # Texture congestion: local density of fine structures. Penalize softly,
    # capped at 29%, so eyes, lettering, and fur are not eliminated outright.
    significant = fine[fine > np.float32(1e-5)]
    if significant.size >= 4:
        reference = np.float32(np.percentile(significant, 52))
        active_fine = (fine > max(np.float32(0.012), reference)).astype(np.float32)
        congestion = gaussian_blur(active_fine, 7.0)
        penalty = np.float32(1.0) - np.float32(0.29) * np.clip(
            (congestion - np.float32(0.22)) / np.float32(0.50), 0, 1)
    else:
        penalty = np.float32(1.0)
    return (thin * persistence * penalty).astype(np.float32, copy=False)


def importance_contours(image: np.ndarray, *, sigma: float = 1.0,
                        low: float = 0.04, high: float = 0.10) -> np.ndarray:
    """Deterministic 1-pixel contour mask emphasizing stable shape boundaries."""
    if (not np.isfinite(low) or not np.isfinite(high) or
            low < 0 or high <= 0 or high > 1 or low > high):
        raise ValueError('Invalid V3 thresholds')
    score = contour_importance(image, sigma=sigma)
    candidates = score[score > np.float32(1e-5)]
    if candidates.size < 4:
        return np.zeros(score.shape, dtype=np.bool_)
    lower = max(0.007, 0.40 * low)
    upper = max(lower, 1.15 * high)
    high_t = float(np.clip(np.percentile(candidates, EDGE_QUANTILE), lower, upper))
    result = hysteresis_threshold(score, HYSTERESIS_RATIO * high_t, high_t)
    # Only reject strictly isolated *weak* specks; preserve isolated high
    # contrast dots (eyes, freckles, lettering). Never touch image boundaries.
    lonely = result & (_neighbor_support(result) == 0) & (score < np.float32(1.12 * high_t))
    result &= ~lonely
    return result


def process_gray8_importance(data: bytes | bytearray | memoryview,
                             width: int, height: int, sigma: float = 1.0,
                             low: float = 0.04, high: float = 0.10) -> BridgeResult:
    """Day 13 bridge-compatible bytes-0/1 output for browser alpha PNG."""
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
    mask = importance_contours(gray.astype(np.float32) * np.float32(1.0 / 255.0),
                               sigma=sigma, low=low, high=high)
    return BridgeResult(mask.astype(np.uint8).tobytes(order='C'), width, height,
                        int(np.count_nonzero(mask)),
                        engine_version=SKETCH_QUALITY_VERSION,
                        bridge_version=BRIDGE_VERSION)
