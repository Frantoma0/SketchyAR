"""SketchyAR Day 25: cautious refinement of the existing Day 12 contours.

The output is still a ONE-PIXEL boolean contour mask, not a hallucinated drawing.
We leave the Gaussian/Sobel/NMS/hysteresis engine unchanged and perform only:
  1. removal of tiny, weak, isolated fragments (never high-contrast small marks),
  2. one-pass repair of exact one-pixel opposite-direction gaps.

No SciPy/OpenCV/PIL/network or whole-image rethresholding is used by the PWA.
The v1 Python bridge remains available for reproducible Day 12/13 baselines.
"""
from __future__ import annotations

import numpy as np

from .day12_edges import edge_stages
from .day13_bridge import BridgeResult

SKETCH_QUALITY_VERSION = 'day25-sketch-quality-v1'
BRIDGE_VERSION = 'day25-gray8-quality-v1'


def remove_tiny_weak_components(mask: np.ndarray, strength: np.ndarray,
                                *, max_pixels: int = 3, weak_peak: float = 0.18) -> np.ndarray:
    """Drop 8-connected specks of <=3 pixels only if their gradient is weak.

    A high-contrast dot, a longer thin line, or a component attached diagonally
    to the drawing is preserved. Never change input arrays.
    """
    binary = np.asarray(mask)
    mag = np.asarray(strength)
    if (binary.ndim != 2 or binary.dtype != np.bool_ or mag.shape != binary.shape or
            mag.dtype.kind != 'f' or not np.isfinite(mag).all() or np.any(mag < 0)):
        raise ValueError('Expected a bool mask and equal finite nonnegative gradient H×W')
    if (type(max_pixels) is not int or not 1 <= max_pixels <= 8 or
            not np.isfinite(weak_peak) or weak_peak <= 0):
        raise ValueError('Invalid tiny-component parameters')
    h, w = binary.shape
    output = binary.copy()
    visited = np.zeros((h, w), dtype=np.bool_)
    ys, xs = np.nonzero(binary)
    for y, x in zip(ys, xs):
        if visited[y, x]:
            continue
        visited[y, x] = True
        stack = [(int(y), int(x))]
        component = []
        peak = 0.0
        # We only need full exploration for tiny components. For larger ones,
        # mark each reachable pixel as visited without storing the component.
        while stack:
            cy, cx = stack.pop()
            if len(component) <= max_pixels:
                component.append((cy, cx))
            peak = max(peak, float(mag[cy, cx]))
            for ny in range(max(0, cy - 1), min(h, cy + 2)):
                for nx in range(max(0, cx - 1), min(w, cx + 2)):
                    if binary[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((ny, nx))
        if len(component) <= max_pixels and peak < weak_peak:
            for cy, cx in component:
                output[cy, cx] = False
    return output


def bridge_single_pixel_gaps(mask: np.ndarray) -> np.ndarray:
    """Connect ONLY a missing pixel between exactly two opposite edge pixels.

    This cannot extend a line outwards, thicken a 2px contour or bridge an
    arbitrary broad gap: there must be exactly two neighbors of the missing
    pixel and those neighbors must be opposite in the 8-neighborhood.
    One pass only, no cascade or image wraparound.
    """
    binary = np.asarray(mask)
    if binary.ndim != 2 or binary.dtype != np.bool_ or binary.size == 0:
        raise ValueError('Expected a non-empty bool H×W contour mask')
    if min(binary.shape) < 3:
        return binary.copy()
    p = np.pad(binary, 1, mode='constant', constant_values=False)
    n = p[:-2, 1:-1]; s = p[2:, 1:-1]
    e = p[1:-1, 2:]; w = p[1:-1, :-2]
    ne = p[:-2, 2:]; sw = p[2:, :-2]
    nw = p[:-2, :-2]; se = p[2:, 2:]
    count = (n.astype(np.uint8) + s.astype(np.uint8) + e.astype(np.uint8) +
             w.astype(np.uint8) + ne.astype(np.uint8) + sw.astype(np.uint8) +
             nw.astype(np.uint8) + se.astype(np.uint8))
    fill = (~binary) & (count == 2) & ((n & s) | (e & w) | (ne & sw) | (nw & se))
    # Never synthesize a black pixel at the image boundary.
    fill[0, :] = False; fill[-1, :] = False
    fill[:, 0] = False; fill[:, -1] = False
    return binary | fill


def refine_sketch_mask(mask: np.ndarray, strength: np.ndarray) -> np.ndarray:
    """Stable, deterministic, conservative quality pass."""
    cleaned = remove_tiny_weak_components(mask, strength)
    return bridge_single_pixel_gaps(cleaned)


def process_gray8_quality(data: bytes | bytearray | memoryview, width: int, height: int,
                          sigma: float = 1.0, low: float = .04, high: float = .10) -> BridgeResult:
    """Day 25 product pipeline, preserving the baseline validation and thresholds.

    Keeps the Day 12 contour geometry as the starting point; does not change
    edge-detector thresholds or invent line thickness/detail controls.
    """
    # Validation is delegated to the proven bridge and always happens BEFORE
    # expensive processing. This also leaves the Day 13 engine unchanged.
    # Fast validation via the original bridge would run processing twice;
    # validate locally with exactly the same rules instead.
    if (type(width) is not int or type(height) is not int or width < 3 or height < 3 or
            width > 1024 or height > 1024 or width * height > 1024 * 1024):
        raise ValueError('width and height must be integer 3..1024, max 1 Mi pixels')
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError('Expected a bytes-like gray8 buffer')
    view = memoryview(data)
    if view.ndim != 1 or view.itemsize != 1 or len(view) != width * height:
        raise ValueError('Expected exactly width*height uint8 bytes')
    gray = np.frombuffer(view, dtype=np.uint8).reshape((height, width))
    stages = edge_stages(gray.astype(np.float32) * np.float32(1 / 255),
                         sigma=sigma, low=low, high=high)
    quality = refine_sketch_mask(stages.final, stages.suppressed)
    return BridgeResult(quality.astype(np.uint8).tobytes(order='C'), width, height,
                        int(np.count_nonzero(quality)),
                        engine_version=SKETCH_QUALITY_VERSION, bridge_version=BRIDGE_VERSION)
