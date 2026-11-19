"""SketchyAR NumPy-first sketch engine — Day 9.

Public API:
    to_grayscale(image): normalized float32 H×W, range [0, 1]
    gaussian_blur(image, sigma): separable normalized float32 Gaussian
    sobel(image): gx, gy, magnitude, direction, all float32
    xdog(image, preset=...): grayscale float32 output (white paper=1)
    sketch_preview(image, preset=...): uint8 paper/ink preview
    benchmark(size=512, runs=3): deterministic CPython/Pyodide check

No OpenCV, SciPy, Pillow, networking, or browser APIs needed at runtime.
All inputs are non-empty 2-D grayscale or H×W×(1,3,4) arrays. Inputs may be
uint8 [0..255] or floating [0..1]. Alpha in RGBA is intentionally ignored;
Day 9 doesn't perform alpha compositing. NaN/Inf and out-of-range values fail.

XDoG here is a *stylized edge filter*, not semantic line-art detection.
Multi-scale results must NOT later be directly merged as drawing steps;
Day 16 uses ONE final contour mask F and scores its segments instead.
"""
from __future__ import annotations

from time import perf_counter
import platform
import statistics

import numpy as np


# Presets are an experimental starting point; do not imply optimal settings.
PRESETS: dict[str, dict[str, float]] = {
    "soft":     {"sigma": 1.4, "k": 1.6, "tau": 0.98, "epsilon": 0.0, "phi": 18.0},
    "balanced": {"sigma": 1.0, "k": 1.6, "tau": 0.98, "epsilon": 0.0, "phi": 28.0},
    "bold":     {"sigma": 1.1, "k": 1.6, "tau": 0.99, "epsilon": 0.0, "phi": 45.0},
    "detail":   {"sigma": 0.65, "k": 1.6, "tau": 0.98, "epsilon": 0.0, "phi": 25.0},
}


def to_grayscale(image: np.ndarray) -> np.ndarray:
    """Convert uint8 (0..255) or float (0..1) to contiguous grayscale float32."""
    raw = np.asarray(image)
    if raw.ndim not in (2, 3) or any(dim < 1 for dim in raw.shape[:2]):
        raise ValueError("Expected a non-empty H×W or H×W×(1,3,4) image")
    if raw.ndim == 3 and raw.shape[2] not in (1, 3, 4):
        raise ValueError("Expected 1, 3, or 4 image channels")
    if raw.dtype == np.uint8:
        src = raw.astype(np.float32) * np.float32(1.0 / 255.0)
    elif np.issubdtype(raw.dtype, np.floating):
        src = raw.astype(np.float32, copy=False)
    else:
        raise TypeError("Expected uint8 or floating image; convert other bit depths explicitly")
    if not np.isfinite(src).all() or np.any(src < 0) or np.any(src > 1):
        raise ValueError("Input image must be finite with values in [0, 1]")
    if src.ndim == 2:
        return np.ascontiguousarray(src)
    if src.shape[2] == 1:
        return np.ascontiguousarray(src[:, :, 0])
    # Ignore alpha; callers importing RGBA must composite explicitly if needed.
    gray = (np.float32(.2126) * src[:, :, 0] +
            np.float32(.7152) * src[:, :, 1] +
            np.float32(.0722) * src[:, :, 2])
    return np.ascontiguousarray(gray, dtype=np.float32)


def gaussian_kernel(sigma: float) -> np.ndarray:
    """Symmetric 1-D Gaussian, truncate to ceil(3*sigma), normalized to 1."""
    if not np.isfinite(sigma) or not (0.15 <= sigma <= 12.0):
        raise ValueError("sigma must be finite and between 0.15 and 12.0")
    radius = max(1, int(np.ceil(3.0 * sigma)))
    offsets = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-np.square(offsets / np.float32(sigma)) * np.float32(.5))
    return (k / np.sum(k, dtype=np.float32)).astype(np.float32, copy=False)


def gaussian_blur(image: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """Gaussian blur with separable horizontal/vertical passes, reflect border."""
    img = to_grayscale(image)
    kernel = gaussian_kernel(float(sigma))
    radius = (len(kernel) - 1) // 2
    h, w = img.shape
    p = np.pad(img, ((0, 0), (radius, radius)), mode="reflect")
    temp = np.zeros((h, w), dtype=np.float32)
    for i, weight in enumerate(kernel):
        temp += weight * p[:, i:i+w]
    del p
    p = np.pad(temp, ((radius, radius), (0, 0)), mode="reflect")
    out = np.zeros((h, w), dtype=np.float32)
    for i, weight in enumerate(kernel):
        out += weight * p[i:i+h, :]
    return out


def sobel(image: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return Gx, Gy, gradient magnitude, direction (radians).

    Kernel amplitudes are divided by 8; border is reflect. A unit-intensity
    linear ramp along X yields magnitude ~1/width, not 1 (input range [0,1]).
    """
    img = to_grayscale(image)
    p = np.pad(img, 1, mode="reflect")
    gx = (-p[:-2, :-2] + p[:-2, 2:] -
          np.float32(2) * p[1:-1, :-2] + np.float32(2) * p[1:-1, 2:] -
          p[2:, :-2] + p[2:, 2:]) * np.float32(.125)
    gy = (-p[:-2, :-2] - np.float32(2) * p[:-2, 1:-1] - p[:-2, 2:] +
          p[2:, :-2] + np.float32(2) * p[2:, 1:-1] + p[2:, 2:]) * np.float32(.125)
    mag = np.hypot(gx, gy).astype(np.float32, copy=False)
    direction = np.arctan2(gy, gx).astype(np.float32, copy=False)
    return gx.astype(np.float32), gy.astype(np.float32), mag, direction


def xdog(image: np.ndarray, *, sigma: float = 1.0, k: float = 1.6,
         tau: float = 0.98, epsilon: float = 0.0, phi: float = 28.0) -> np.ndarray:
    """Extended Difference-of-Gaussians, returning black ink on white [0,1].

    Difference D = G_sigma - tau*G_(k*sigma).
    Output = 1 if D >= epsilon else 1 + tanh(phi*(D-epsilon)).
    This retains continuous antialiased ink levels; it is not a binary edge mask.
    """
    if (not np.isfinite(k) or k <= 1 or
            not np.isfinite(tau) or not (0 < tau <= 1) or
            not np.isfinite(epsilon) or not (-1 <= epsilon <= 1) or
            not np.isfinite(phi) or not (0 < phi <= 200)):
        raise ValueError("Invalid XDoG parameters")
    # gaussian_kernel also checks the upper bound of k*sigma.
    base = gaussian_blur(image, sigma)
    wide = gaussian_blur(image, sigma * k)
    diff = base - np.float32(tau) * wide
    del base, wide
    below = diff < np.float32(epsilon)
    # Avoid allocating a full image in float64 for the hyperbolic tangent.
    np.subtract(diff, np.float32(epsilon), out=diff)
    np.multiply(diff, np.float32(phi), out=diff)
    np.tanh(diff, out=diff)
    np.add(diff, np.float32(1), out=diff)
    diff[~below] = np.float32(1)
    np.clip(diff, np.float32(0), np.float32(1), out=diff)
    return diff


def xdog_preset(image: np.ndarray, preset: str = "balanced") -> np.ndarray:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset}. Choose: {', '.join(PRESETS)}")
    return xdog(image, **PRESETS[preset])


def sketch_preview(image: np.ndarray, preset: str = "balanced") -> np.ndarray:
    """8-bit grayscale image for export/preview; does not require Pillow."""
    return np.rint(xdog_preset(image, preset) * np.float32(255)).astype(np.uint8)


def benchmark(size: int = 512, runs: int = 3, seed: int = 173) -> dict:
    """Deterministic workload used *unchanged* in CPython and Pyodide.

    Measures warmed kernels only. Includes no image decoding, WASM start,
    Web Worker startup or canvas transfer. Each task has its own warm-up.
    """
    if not isinstance(size, int) or size < 16 or size > 2048 or runs < 1 or runs > 100:
        raise ValueError("size: 16..2048 and runs: 1..100")
    rng = np.random.default_rng(seed)
    src = rng.random((size, size), dtype=np.float32)
    tasks = {
        "gaussian_sigma_1": lambda: gaussian_blur(src, 1.0),
        "sobel_magnitude": lambda: sobel(src)[2],
        "xdog_balanced": lambda: xdog_preset(src, "balanced"),
    }
    results = []
    for name, fn in tasks.items():
        fn()  # unmeasured warm-up
        times: list[float] = []
        for _ in range(runs):
            t0 = perf_counter()
            result = fn()
            times.append(perf_counter() - t0)
        results.append({
            "task": name,
            "median_s": round(statistics.median(times), 6),
            "seconds": [round(t, 6) for t in times],
            "checksum": round(float(np.sum(result, dtype=np.float64)), 5),
            "min": round(float(np.min(result)), 5),
            "max": round(float(np.max(result)), 5),
        })
    return {
        "schemaVersion": 1,
        "task": "day9_sketch_engine",
        "shape": [size, size],
        "dtype": "float32",
        "runs": runs,
        "seed": seed,
        "python": platform.python_version(),
        "numpy": np.__version__,
        "presets": list(PRESETS),
        "benchmarks": results,
    }
