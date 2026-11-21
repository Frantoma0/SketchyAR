"""SketchyAR Day 28 — Sketch V4: flow-coherent, importance-aware contours.

Production: deterministic NumPy-only, offline, max 1024x1024, black/transparent
PNG via the unchanged Day 13 bridge. Neither ETF nor FDoG is implemented
pixel-identically to any research publication: these are *lightweight,
vectorized approximations* using locally smoothed tangent orientations and
5-point directional support. No AI, portrait landmarks, model or OpenCV.

Historical V1/V2/V3 remain in the repository for laboratory comparisons and
are not imported by the production Worker. V4 reimplements its own structural
multiscale score and adds tangent-direction coherence and edge-preserving input
normalization. Preview selection / drawing / IndexedDB are handled by TS.
"""
from __future__ import annotations

from hashlib import sha256
import numpy as np

from .sketch_engine import gaussian_blur, gaussian_kernel, sobel
from .day12_edges import non_maximum_suppression, hysteresis_threshold
from .day13_bridge import BridgeResult, MAX_PIXELS

SKETCH_QUALITY_VERSION = 'day28-flow-coherent-v4'
BRIDGE_VERSION = 'day28-gray8-flow-v1'
SCALES = (0.75, 1.55, 3.05)
WEIGHTS = (0.50, 1.05, 1.50)
HYSTERESIS_RATIO = 0.46
EDGE_QUANTILE = 81.0

# Cache holds only the latest image's (H,W) float32 score and its provenance,
# never any source photo. Old entries are discarded by assigning a new value.
_SCORE_CACHE: tuple[tuple[bytes, int, int, float], np.ndarray] | None = None


def _blur_signed(image: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian on signed float32 orientation fields (no [0,1] assumption)."""
    kernel = gaussian_kernel(sigma)
    h, w = image.shape
    radius = len(kernel) // 2
    pad = np.pad(image.astype(np.float32, copy=False),
                 ((0, 0), (radius, radius)), mode='reflect')
    temp = np.zeros((h, w), np.float32)
    for i, coeff in enumerate(kernel):
        temp += coeff * pad[:, i:i+w]
    pad = np.pad(temp, ((radius, radius), (0, 0)), mode='reflect')
    out = np.zeros((h, w), np.float32)
    for i, coeff in enumerate(kernel):
        out += coeff * pad[i:i+h, :]
    return out

def _box3(src: np.ndarray) -> np.ndarray:
    """Vectorized 3x3 mean; a fixed nine-shift loop, never a pixel loop."""
    h, w = src.shape
    p = np.pad(src, 1, mode='reflect')
    result = np.zeros((h, w), dtype=np.float32)
    for dy in range(3):
        for dx in range(3):
            result += p[dy:dy+h, dx:dx+w]
    return result * np.float32(1.0 / 9.0)


def guided_preprocess(gray: np.ndarray) -> np.ndarray:
    """Conservative local linear self-guided filter before soft auto levels.

    Flat skin-like regions are smoothed; strong transitions are largely retained.
    This does not identify skin or facial features.
    """
    src = np.asarray(gray, dtype=np.float32)
    mean = _box3(src)
    var = np.maximum(_box3(src * src) - mean * mean, np.float32(0))
    a = var / (var + np.float32(0.0016))
    b = mean * (np.float32(1.0) - a)
    smooth = _box3(a) * src + _box3(b)
    # Avoid a harsh CLAHE-like enhancement of pores/shadows; keep the
    # original local contrast partly available for tiny facial details.
    smooth = (np.float32(0.85) * smooth + np.float32(0.15) * src)
    lo, hi = np.percentile(smooth, (1.5, 98.5))
    if hi - lo > 0.16:
        normalized = np.clip((smooth - np.float32(lo)) /
                             np.float32(hi - lo), 0, 1)
        smooth = np.float32(0.82) * smooth + np.float32(0.18) * normalized
    return np.clip(smooth, 0, 1).astype(np.float32, copy=False)


def _sample_nearest(src: np.ndarray, dx: np.ndarray, dy: np.ndarray,
                    offset: int, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """One (H,W) source sample along a vector field; bounded indices."""
    h, w = src.shape
    ix = np.clip(np.rint(x + np.float32(offset) * dx), 0, w-1).astype(np.int32)
    iy = np.clip(np.rint(y + np.float32(offset) * dy), 0, h-1).astype(np.int32)
    return src[iy, ix]


def _flow_support(gray: np.ndarray, mid_gx: np.ndarray,
                  mid_gy: np.ndarray, mid_mag: np.ndarray,
                  fine_mag: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """ETF-lite (undirected smoothed orientation) + five-tap FDoG-lite.

    Orientation is represented by doubled angles (not vectors) to avoid
    tangent sign cancellation. This approximation follows *local tangents*,
    not full curved streamline integration, and never allocates an HxWxK tensor.
    """
    eps = np.float32(1e-6)
    sq = mid_gx * mid_gx + mid_gy * mid_gy
    denom = sq + eps
    # Cos(2*normal_angle), sin(2*normal_angle), weighted by energy.
    u = _blur_signed((mid_gx * mid_gx - mid_gy * mid_gy) / denom * mid_mag, 1.8)
    v = _blur_signed((2.0 * mid_gx * mid_gy) / denom * mid_mag, 1.8)
    support = gaussian_blur(mid_mag, 1.8) + eps
    confidence = np.clip(np.hypot(u, v) / support, 0, 1).astype(np.float32)
    normal_angle = np.float32(0.5) * np.arctan2(v, u)
    tangent_x = -np.sin(normal_angle).astype(np.float32)
    tangent_y = np.cos(normal_angle).astype(np.float32)

    # Texture congestion reduces the influence of flow in grass, fur, pores.
    nonzero = fine_mag[fine_mag > np.float32(1e-6)]
    if nonzero.size > 4:
        active = (fine_mag > max(np.float32(0.012),
                                 np.float32(np.percentile(nonzero, 55)))).astype(np.float32)
        density = gaussian_blur(active, 5.0)
        texture = np.clip((density - np.float32(0.25)) / np.float32(0.55), 0, 1)
        confidence *= np.float32(1.0) - np.float32(0.52) * texture
    confidence *= np.float32(0.50)  # V3 score remains important at corners.

    # Normal-oriented contrast, then short smoothing along the estimated
    # tangent. This is a bounded FDoG-inspired approximation, not exact FDoG.
    y = np.arange(gray.shape[0], dtype=np.float32)[:, None]
    x = np.arange(gray.shape[1], dtype=np.float32)[None, :]
    normal_x = -tangent_y
    normal_y = tangent_x
    p = _sample_nearest(gray, normal_x, normal_y, 2, x, y)
    m = _sample_nearest(gray, normal_x, normal_y, -2, x, y)
    ridge = np.abs(gray - np.float32(0.5) * (p + m))
    directional = np.float32(0.72) * mid_mag + np.float32(0.28) * ridge
    del p, m, ridge
    flow = np.float32(0.48) * directional
    for offset, weight in [(-2, 0.06), (-1, 0.20), (1, 0.20), (2, 0.06)]:
        flow += np.float32(weight) * _sample_nearest(
            directional, tangent_x, tangent_y, offset, x, y)
    return flow.astype(np.float32, copy=False), confidence


def flow_importance(gray: np.ndarray, *, sigma: float = 1.0,
                    stage: str = 'fusion') -> np.ndarray:
    """Return float32 thinned score map; `stage` supports lab ablations.

    `stage='baseline'` is a self-contained V3-style structure score;
    `stage='preprocess'` adds guided normalization; `stage='flow'` tests
    directional signal alone; `stage='fusion'` is the production V4.
    """
    original = np.asarray(gray)
    if (original.ndim != 2 or not original.size or original.dtype.kind != 'f' or
            not np.isfinite(original).all() or np.any(original < 0) or
            np.any(original > 1)):
        raise ValueError('Expected finite float grayscale HxW in [0,1]')
    if not np.isfinite(sigma) or sigma < 0.25 or sigma > 3:
        raise ValueError('sigma must be finite in [0.25,3.0]')
    if stage not in ('baseline', 'preprocess', 'flow', 'fusion'):
        raise ValueError('Unsupported V4 ablation stage')
    img = np.ascontiguousarray(original, dtype=np.float32)
    if stage != 'baseline':
        img = guided_preprocess(img)
    gx_sum = np.zeros_like(img)
    gy_sum = np.zeros_like(img)
    scaled = []
    mid_gx = mid_gy = mid_mag = None
    for index, (factor, weight) in enumerate(zip(SCALES, WEIGHTS)):
        gx, gy, mag, _ = sobel(gaussian_blur(img, float(factor * sigma)))
        scaled.append(mag)
        gx_sum += np.float32(weight) * gx
        gy_sum += np.float32(weight) * gy
        if index == 1:
            mid_gx, mid_gy, mid_mag = gx, gy, mag
    mag_combined = np.hypot(gx_sum, gy_sum).astype(np.float32)
    normal_angle = np.arctan2(gy_sum, gx_sum).astype(np.float32)
    thin = non_maximum_suppression(mag_combined, normal_angle)
    if not np.any(thin > np.float32(1e-6)):
        return np.zeros_like(img)
    fine, middle, coarse = scaled
    # Importance based on persistence across multiple blur scales.
    p1 = np.clip(np.float32(1.30) * middle / (fine + np.float32(.002)), 0, 1)
    p2 = np.clip(np.float32(1.75) * coarse / (middle + np.float32(.002)), 0, 1)
    persistence = (np.float32(.25) + np.float32(.34) * p1 + np.float32(.41) * p2)
    v3_score = thin * persistence
    if stage in ('baseline', 'preprocess'):
        return v3_score.astype(np.float32, copy=False)
    assert mid_gx is not None and mid_gy is not None and mid_mag is not None
    flow, confidence = _flow_support(img, mid_gx, mid_gy, mid_mag, fine)
    # Avoid division by an almost empty FDoG map; normalize robust positive
    # percentiles so FDoG and V3 share comparable numeric scales.
    positive_a = v3_score[v3_score > np.float32(1e-5)]
    positive_b = flow[flow > np.float32(1e-5)]
    if positive_b.size >= 4 and positive_a.size >= 4:
        ratio = float(np.percentile(positive_a, 75)) / max(
            float(np.percentile(positive_b, 75)), 1e-5)
        flow *= np.float32(np.clip(ratio, 0.3, 3.0))
    if stage == 'flow':
        return non_maximum_suppression(flow, normal_angle)
    fused = (np.float32(1.0) - confidence) * v3_score + confidence * flow
    fused = non_maximum_suppression(fused, normal_angle)
    # Soft guard against removing short, strong details at corners of eyes,
    # nose, text and small objects, where an ETF field can be ambiguous.
    fused = np.maximum(fused, np.float32(0.69) * v3_score)
    return fused.astype(np.float32, copy=False)


def select_flow_contours(score: np.ndarray, *, low: float = .04,
                         high: float = .10) -> np.ndarray:
    """One final V4 binary mask. UI detail/line controls stay visual-only."""
    if (not np.isfinite(low) or not np.isfinite(high) or low < 0 or
            high <= 0 or high > 1 or low > high):
        raise ValueError('Invalid V4 thresholds')
    valid = score[score > np.float32(1e-5)]
    if valid.size < 4:
        return np.zeros_like(score, dtype=np.bool_)
    min_high = max(0.006, 0.36 * low)
    max_high = max(min_high, 1.10 * high)
    threshold = float(np.clip(np.percentile(valid, EDGE_QUANTILE), min_high, max_high))
    mask = hysteresis_threshold(score, HYSTERESIS_RATIO * threshold, threshold)
    # Remove only single-pixel *weak* outliers, not freckles/eye-corner dots.
    p = np.pad(mask.astype(np.uint8), 1)
    neighbors = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] +
                 p[1:-1, :-2] + p[1:-1, 2:] +
                 p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:])
    mask &= ~((neighbors == 0) & (score < np.float32(1.08 * threshold)))
    return mask


def process_gray8_flow(data: bytes | bytearray | memoryview,
                       width: int, height: int, sigma: float = 1.,
                       low: float = .04, high: float = .10) -> BridgeResult:
    """Day13-compatible binary mask 0/1 with per-input bounded score cache."""
    global _SCORE_CACHE
    if (type(width) is not int or type(height) is not int or
            width < 3 or height < 3 or width > 1024 or height > 1024 or
            width * height > MAX_PIXELS):
        raise ValueError('Invalid gray8 dimensions (max 1024x1024)')
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError('Expected bytes-like grayscale input')
    view = memoryview(data)
    if view.ndim != 1 or view.itemsize != 1 or len(view) != width * height:
        raise ValueError('gray8 length must equal width*height')
    if not np.isfinite(sigma) or not .25 <= sigma <= 3:
        raise ValueError('Invalid sigma')
    if (not np.isfinite(low) or not np.isfinite(high) or low < 0 or
            high <= 0 or high > 1 or low > high):
        raise ValueError('Invalid threshold range')
    # Use a digest rather than retaining the original photo bytes in RAM.
    key = (sha256(view).digest(), width, height, float(sigma))
    if _SCORE_CACHE is not None and _SCORE_CACHE[0] == key:
        score = _SCORE_CACHE[1]
    else:
        gray = np.frombuffer(view, dtype=np.uint8).reshape(height, width)
        score = flow_importance(gray.astype(np.float32) / np.float32(255.0), sigma=sigma)
        _SCORE_CACHE = (key, score)
    mask = select_flow_contours(score, low=low, high=high)
    return BridgeResult(mask.astype(np.uint8).tobytes(), width, height,
                        int(np.count_nonzero(mask)),
                        engine_version=SKETCH_QUALITY_VERSION,
                        bridge_version=BRIDGE_VERSION)


def clear_flow_cache() -> None:
    """Free retained score after tests, or upon future memory-pressure hints."""
    global _SCORE_CACHE
    _SCORE_CACHE = None
