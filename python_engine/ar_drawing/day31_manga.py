"""Day 31 — Manga V1, offline NumPy-only photo-to-ink renderer.

Original implementation inspired by *design principles* of MangaScreen
(line / tone separation), manga-filter (two-scale fine lines and sparse
screentone), and white-box cartoonization (structure vs. texture), not copied
code or licensed ML weights. No segmentation AI or invented facial features.

The output is binary ink (1) / transparent (0) so it can be traced over camera.
Fixed-source caches store only the previous source's maps; D1..D5 and stroke
changes do not recompute the expensive V4 contour score or tone maps.
"""
from __future__ import annotations

from hashlib import sha256
import numpy as np

from .day12_edges import non_maximum_suppression
from .day13_bridge import BridgeResult
from .day28_flow_coherent import get_cached_flow_score
from .day29_detail import select_detail_contours
from .day30_stroke import widen_contours, STROKES
from .sketch_engine import gaussian_blur, sobel

MANGA_QUALITY_VERSION = 'day31-manga-layers-v1'
MANGA_BRIDGE_VERSION = 'day31-gray8-manga-v1'
# All cutoff lists progress from selective to inclusive. No non-monotone
# per-detail pruning: each lower D must be a subset of every higher D.
_FINE_FACTORS = (2.10, 1.65, 1.34, 1.12, 0.94)
_BLACK_LEVELS = (0.0, 0.105, 0.155, 0.205, 0.255)
_HATCH_LEVELS = (0.0, 0.0, 0.0, 0.36, 0.49)
# Just one source-scoped cache, never a map per style/detail/width combination.
# digest + shape + sigma => levels, extra fine-line NMS, stable dark-region map.
_MANGA_CACHE: tuple[tuple[bytes, int, int, float], tuple[np.ndarray, np.ndarray, np.ndarray]] | None = None


def _tone_levels(gray: np.ndarray) -> np.ndarray:
    """Guided global auto-levels + spatial low-pass for clean areas.

    A narrow input range is NOT violently stretched: prevents noise in plain
    paper and flat grey skies from becoming random dark ink.
    """
    tone = gaussian_blur(gray, 2.3)
    # Robust distribution sampling bounds percentile work and memory on iPhone.
    sampled = tone[::3, ::3]
    low, high = np.percentile(sampled, (2.0, 98.0))
    span = high - low
    # Flat dark or grey photos must not become a solid black page just
    # because their mean is low; keep V4 edges but suppress flat-area ink.
    if span < 0.075:
        return np.ones_like(tone)
    if span >= 0.13:
        balanced = np.clip((tone - np.float32(low)) / np.float32(span), 0, 1)
        tone = np.float32(0.78) * balanced + np.float32(0.22) * tone
    return np.clip(tone, 0, 1).astype(np.float32, copy=False)


def _fine_nms(gray: np.ndarray) -> np.ndarray:
    """Additional fine pen lines: two-scale DoG + Sobel/NMS, not raw noise.

    NMS keeps the extra lines roughly one pixel wide. A global threshold later
    limits over-detailed photographic texture at lower detail settings.
    """
    small = gaussian_blur(gray, 0.75)
    large = gaussian_blur(gray, 1.9)
    dog = np.abs(small - large)
    _, _, magnitude, angle = sobel(small)
    thinned = non_maximum_suppression(magnitude, angle)
    # Distinct DoG response: boost coherent features over flat-area gradients.
    thinned *= np.float32(0.78) + np.minimum(np.float32(1.8) * dog, np.float32(0.50))
    return thinned


def _cached_manga_maps(data: bytes | bytearray | memoryview,
                       width: int, height: int, sigma: float
                       ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cache one (tone, fine-score, dark-map); no original pixels retained."""
    global _MANGA_CACHE
    key = (sha256(memoryview(data)).digest(), width, height, float(sigma))
    if _MANGA_CACHE is not None and _MANGA_CACHE[0] == key:
        return _MANGA_CACHE[1]
    image = np.frombuffer(data, dtype=np.uint8).reshape(height, width)
    gray = image.astype(np.float32) * np.float32(1 / 255)
    tone = _tone_levels(gray)
    fine = _fine_nms(gray)
    # Light spatial smoothing avoids isolated shadow pinholes while not turning
    # all thin dark structures into solid black (the V4 line map handles those).
    dark = gaussian_blur(tone, 1.8)
    _MANGA_CACHE = (key, (tone, fine, dark))
    return tone, fine, dark


def _hatch_mask(tone: np.ndarray, detail: int) -> np.ndarray:
    """Sparse uniform 45-degree pen hatching in selected shadow regions.

    Deterministic in image coordinates across D and stroke changes. No noisy
    full-image dithering and no embedded speech bubbles/panels. D4 hatch is a
    subset of D5; a second cross-direction may appear in deeper D5 shadows.
    """
    h, w = tone.shape
    if detail < 4:
        return np.zeros((h, w), dtype=np.bool_)
    y = np.arange(h, dtype=np.int32)[:, None]
    x = np.arange(w, dtype=np.int32)[None, :]
    diagonal = ((x + y) % 16) == 0
    mask = (tone < np.float32(_HATCH_LEVELS[detail - 1])) & diagonal
    if detail == 5:
        # Cross-lines only in deep tone. Intersection with black areas is fine.
        mask |= (tone < np.float32(0.27)) & (((x - y) % 19) == 0)
    return mask


def compose_manga_mask(score: np.ndarray, tone: np.ndarray,
                       fine: np.ndarray, dark: np.ndarray, detail: int,
                       low: float = 0.04, high: float = 0.10) -> np.ndarray:
    """Monotone union of V4 structural lines, delicate NMS, shadows and hatch."""
    if type(detail) is not int or not 1 <= detail <= 5:
        raise ValueError('Detail must be integer 1..5')
    if any(a.ndim != 2 or a.shape != score.shape for a in (tone, fine, dark)):
        raise ValueError('Incompatible Manga layer dimensions')
    # V4 silhouette backbone, exact D1 subset ... subset D5.
    contour = select_detail_contours(score, detail, low=low, high=high)
    positive = fine[fine > np.float32(1e-5)]
    if positive.size >= 8:
        # Fixed source-scoped cutoff; each more-detailed tier relaxes it.
        base = np.float32(max(0.024, np.percentile(positive, 72)))
        contour |= fine >= base * np.float32(_FINE_FACTORS[detail - 1])
    if detail >= 2:
        # Cap solid ink to a source-stable tonal quantile; very dark scenes
        # must not become 80–100% black. Because the cap is identical for
        # all D, the detail nesting property still holds exactly.
        black_limit = min(_BLACK_LEVELS[detail - 1], float(np.percentile(dark[::3, ::3], 38)))
        contour |= dark < np.float32(black_limit)
    if detail >= 4:
        contour |= _hatch_mask(tone, detail)
    return contour


def process_gray8_manga(data: bytes | bytearray | memoryview,
                        width: int, height: int,
                        sigma: float = 1.0, low: float = 0.04, high: float = 0.10,
                        detail: int = 3, line: str = 'normal') -> BridgeResult:
    """Return normalized opaque-black / transparent binary manga mask."""
    if type(detail) is not int or not 1 <= detail <= 5:
        raise ValueError('Detail must be integer 1..5')
    if type(line) is not str or line not in STROKES:
        raise ValueError('Line must be thin, normal or thick')
    # Validates dimensions, byte buffer, 0.25<=sigma<=3 and low/high.
    score = get_cached_flow_score(data, width, height, sigma=sigma, low=low, high=high)
    tone, fine, dark = _cached_manga_maps(data, width, height, sigma)
    composite = compose_manga_mask(score, tone, fine, dark, detail, low, high)
    # Thickness is a *final* transform, shared with Sketch but not changing V4.
    ink = widen_contours(composite, line)
    return BridgeResult(ink.astype(np.uint8).tobytes(), width, height,
                        int(np.count_nonzero(ink)),
                        engine_version=MANGA_QUALITY_VERSION,
                        bridge_version=MANGA_BRIDGE_VERSION)
