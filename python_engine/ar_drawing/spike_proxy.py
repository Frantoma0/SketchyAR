"""Day-2 NumPy G1 proxy: separable Gaussian + Sobel magnitude, float32.

This is a *proxy* for future sketch processing, not a complete Canny implementation.
On the iPhone, run ``benchmark()`` through Pyodide and log ``median_s``.
Runtime initialization/loading is measured separately from this kernel.
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
from time import perf_counter

import numpy as np


def _gray_float32(image: np.ndarray) -> np.ndarray:
    image = np.asarray(image, dtype=np.float32)
    if image.ndim != 2 or min(image.shape) == 0:
        raise ValueError("Expected a non-empty grayscale H×W array")
    return image


def gaussian_separable(image: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """5-tap Gaussian applied horizontally and vertically (reflect border)."""
    if sigma <= 0:
        raise ValueError("sigma must be positive")
    src = _gray_float32(image)
    x = np.arange(-2, 3, dtype=np.float32)
    kernel = np.exp(-(x * x) / np.float32(2.0 * sigma * sigma))
    kernel = (kernel / kernel.sum()).astype(np.float32)
    h, w = src.shape
    padded_x = np.pad(src, ((0, 0), (2, 2)), mode="reflect")
    tmp = np.zeros_like(src)
    for idx, weight in enumerate(kernel):
        tmp += weight * padded_x[:, idx:idx + w]
    padded_y = np.pad(tmp, ((2, 2), (0, 0)), mode="reflect")
    out = np.zeros_like(tmp)
    for idx, weight in enumerate(kernel):
        out += weight * padded_y[idx:idx + h, :]
    return out


def sobel_magnitude(image: np.ndarray) -> np.ndarray:
    """3×3 Sobel magnitude, normalized by 8, with reflect border."""
    src = _gray_float32(image)
    p = np.pad(src, 1, mode="reflect")
    gx = (-p[:-2, :-2] + p[:-2, 2:]
          - 2 * p[1:-1, :-2] + 2 * p[1:-1, 2:]
          - p[2:, :-2] + p[2:, 2:]) / np.float32(8.0)
    gy = (-p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]
          + p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) / np.float32(8.0)
    return np.hypot(gx, gy).astype(np.float32, copy=False)


def process(image: np.ndarray) -> np.ndarray:
    return sobel_magnitude(gaussian_separable(image))


def benchmark(size: int = 1024, runs: int = 5, seed: int = 173) -> dict:
    """Deterministic input; one warm-up; runs excludes Python/Pyodide startup."""
    if size < 8 or runs < 1:
        raise ValueError("size must be >=8 and runs >=1")
    rng = np.random.default_rng(seed)
    image = rng.random((size, size), dtype=np.float32)
    output = process(image)  # warm-up
    times = []
    for _ in range(runs):
        start = perf_counter()
        output = process(image)
        times.append(round(perf_counter() - start, 6))
    return {
        "task": "numpy_gaussian5_sobel_proxy",
        "shape": list(image.shape),
        "dtype": str(image.dtype),
        "runs": runs,
        "seconds": times,
        "median_s": round(statistics.median(times), 6),
        "output_checksum": round(float(output.sum()), 5),
        "python": platform.python_version(),
        "numpy": np.__version__,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(benchmark(size=args.size, runs=args.runs), ensure_ascii=False, indent=2))
