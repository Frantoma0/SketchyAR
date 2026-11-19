"""SketchyAR Day 10 — NumPy-only tone simplification and edge/tonal comparison.

This module reuses Day 9's unchanged Gaussian/Sobel/XDoG kernels.
No Pillow, OpenCV, network calls, browser APIs, or SciPy at runtime.

These are *stylization and analysis* methods, not semantic guidance or Canny.
Output previews have WHITE=255/1 and BLACK=0; color inputs ignore alpha
as documented in sketch_engine.to_grayscale.
"""
from __future__ import annotations

from time import perf_counter
import platform
import statistics

import numpy as np
from .sketch_engine import gaussian_blur, sobel, to_grayscale, xdog_preset


DAY10_ENGINE_VERSION = 'day10-raster-v1'


def tone_quantize(image: np.ndarray, levels: int = 4) -> np.ndarray:
    """Map grayscale to exactly ``levels`` possible uniformly-spaced tones.

    Nearest-level rounding minimizes scalar squared error for fixed centers;
    no learned/scene-adaptive segmentation is claimed. At most ``levels``
    tones may actually occur in a given input. Returns [0,1] float32.
    """
    if type(levels) is not int or levels not in (3, 4, 5):
        raise ValueError('levels must be exactly 3, 4, or 5')
    src = to_grayscale(image)
    m = np.float32(levels - 1)
    return (np.rint(src * m) / m).astype(np.float32, copy=False)


def tone_preview(image: np.ndarray, levels: int = 4) -> np.ndarray:
    """Export-ready uint8 tone image; preserves dimensions."""
    return np.rint(tone_quantize(image, levels) * np.float32(255)).astype(np.uint8)


def sobel_ink(image: np.ndarray, *, sigma: float = 1.0,
              threshold: float = 0.08) -> np.ndarray:
    """Deterministic binary ink mask (True=ink) from smoothed Sobel magnitude.

    Threshold is in absolute normalized-intensity Sobel units, NOT a
    per-image percentile or a claim of Canny-quality contours. Keep the
    threshold comparable between test images. ``sigma`` follows Day9 limits.
    """
    if not np.isfinite(threshold) or not 0 < threshold <= 1:
        raise ValueError('threshold must be finite in (0,1]')
    blur = gaussian_blur(image, sigma=sigma)
    magnitude = sobel(blur)[2]
    return magnitude >= np.float32(threshold)


def sobel_ink_preview(image: np.ndarray, *, sigma: float = 1.0,
                      threshold: float = 0.08) -> np.ndarray:
    """Black edges on white uint8 paper, with a transparent path to PNG later."""
    ink = sobel_ink(image, sigma=sigma, threshold=threshold)
    return np.where(ink, np.uint8(0), np.uint8(255))


def tone_and_ink(image: np.ndarray, *, levels: int = 4,
                 preset: str = 'balanced') -> np.ndarray:
    """Combine tonal planes and XDoG for a grayscale illustrative preview.

    This multiplies two [0,1] images; it is not a layer-by-layer draw order.
    Future Guided Drawing V2 will use ONE final mask F and nested subsets.
    """
    tones = tone_quantize(image, levels)
    lines = xdog_preset(image, preset)
    np.multiply(tones, lines, out=tones)
    return tones


def tone_and_ink_preview(image: np.ndarray, *, levels: int = 4,
                         preset: str = 'balanced') -> np.ndarray:
    return np.rint(tone_and_ink(image, levels=levels, preset=preset) * np.float32(255)).astype(np.uint8)


def benchmark_day10(size: int = 512, runs: int = 3, seed: int = 173) -> dict:
    """Same warmed-in-advance deterministic kernel workload on PC / iPhone.

    Deliberately excludes decoding, worker startup, canvas copies and camera;
    compare ONLY to benchmark_day10 with identical shape, versions and seed.
    """
    if type(size) is not int or not 16 <= size <= 2048:
        raise ValueError('size must be an integer from 16 to 2048')
    if type(runs) is not int or not 1 <= runs <= 30:
        raise ValueError('runs must be an integer from 1 to 30')
    rng = np.random.default_rng(seed)
    src = rng.random((size, size), dtype=np.float32)
    tasks = (
        ('tone_3_levels', lambda: tone_quantize(src, 3)),
        ('tone_5_levels', lambda: tone_quantize(src, 5)),
        ('sobel_ink_sigma_1_threshold_0.08', lambda: sobel_ink(src, sigma=1.0, threshold=0.08)),
        ('tone_4_plus_xdog_balanced', lambda: tone_and_ink(src, levels=4, preset='balanced')),
    )
    records: list[dict] = []
    for name, run in tasks:
        run()  # one excluded warm-up for each kernel
        times = []
        for _ in range(runs):
            t0 = perf_counter()
            result = run()
            times.append(perf_counter() - t0)
        records.append({
            'task': name,
            'median_s': round(statistics.median(times), 6),
            'seconds': [round(x, 6) for x in times],
            'checksum': round(float(np.sum(result, dtype=np.float64)), 5),
            'outputDtype': str(result.dtype),
            'min': round(float(np.min(result)), 5),
            'max': round(float(np.max(result)), 5),
            'uniqueValues': (int(np.unique(result).size) if name.startswith('tone_') and 'xdog' not in name else None),
        })
    return {
        'schemaVersion': 1,
        'task': 'day10_tones_and_ink',
        'pipelineVersion': DAY10_ENGINE_VERSION,
        'shape': [size, size],
        'dtype': 'float32',
        'runs': runs,
        'seed': seed,
        'python': platform.python_version(),
        'numpy': np.__version__,
        'inputBytes': int(src.nbytes),
        'includesDecodeOrWorkerStart': False,
        'benchmarks': records,
    }
