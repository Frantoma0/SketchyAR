"""SketchyAR Day 12 — NumPy-first thin-edge pipeline.

Grayscale H×W in [0, 1] -> separable Gaussian -> Sobel -> 4-direction NMS
-> absolute dual thresholds -> complete 8-connected hysteresis.

All arrays stay float32/bool; no SciPy, OpenCV, Pillow or network requests
at runtime. 'True' in the final mask means dark ink. A single final F mask
can later support monotone Guided V2 steps; this module DOES NOT plan steps.

This is *Canny-like*, not pixel-identical to cv2.Canny, whose Gaussian,
threshold conventions, border handling and NMS may differ.
"""
from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
import platform
import statistics

import numpy as np

from .sketch_engine import gaussian_blur, sobel
from .day11_morphology import make_fixture

DAY12_ENGINE_VERSION = 'day12-canny-like-v1'


@dataclass(frozen=True)
class EdgeStages:
    """Prepared for numerical checks/preview, not a persistent project asset."""
    magnitude: np.ndarray  # float32 H×W
    suppressed: np.ndarray  # float32 H×W (NMS)
    final: np.ndarray       # bool H×W, one authoritative mask F


def non_maximum_suppression(magnitude: np.ndarray, direction: np.ndarray) -> np.ndarray:
    """Quantized four-orientation NMS. Radians measured in image coordinates.

    Angles 0/45/90/135 degrees compare E/W, NW/SE, N/S, NE/SW respectively,
    since positive Y points *downwards*. A plateau keeps at most one side by
    requiring >= in the forward direction and > in the backward direction.
    The outer 1px border is always suppressed, and thin (<3px) inputs return
    all zeros. Does not modify inputs. This is not subpixel/bilinear NMS.
    """
    mag = np.asarray(magnitude)
    theta = np.asarray(direction)
    if (mag.ndim != 2 or mag.size == 0 or mag.shape != theta.shape or
            mag.dtype.kind != 'f' or theta.dtype.kind != 'f' or
            not np.isfinite(mag).all() or not np.isfinite(theta).all() or
            np.any(mag < 0)):
        raise ValueError('NMS requires equal non-empty finite floating H×W arrays; magnitude >= 0')
    m = mag.astype(np.float32, copy=False)
    d = theta.astype(np.float32, copy=False)
    h, w = m.shape
    out = np.zeros((h, w), dtype=np.float32)
    if h < 3 or w < 3:
        return out

    center = m[1:-1, 1:-1]
    # Bin gradient normals into 4 orientations, mod pi (signed gradients equal).
    angles = np.mod(d[1:-1, 1:-1], np.float32(np.pi))
    bins = np.floor((angles + np.float32(np.pi / 8)) * np.float32(4 / np.pi)).astype(np.uint8) % 4
    # Direction 45: NW/SE; direction 135: NE/SW, because Y grows down.
    pairs = (
        (m[1:-1, 2:], m[1:-1, :-2]),   # right / left
        (m[2:, 2:], m[:-2, :-2]),       # down-right / up-left
        (m[2:, 1:-1], m[:-2, 1:-1]),   # down / up
        (m[2:, :-2], m[:-2, 2:]),     # down-left / up-right
    )
    interior = out[1:-1, 1:-1]
    for i, (forward, backward) in enumerate(pairs):
        keep = (bins == i) & (center > 0) & (center >= forward) & (center > backward)
        interior[keep] = center[keep]
    return out


def hysteresis_threshold(suppressed: np.ndarray, low: float, high: float) -> np.ndarray:
    """Complete 8-connected flood fill from strong to weak NMS pixels.

    Thresholds are absolute Sobel magnitudes, not OpenCV's uint8 thresholds.
    A pixel >= high is a seed; pixels >= low and >0 are added ONLY when
    connected to a strong seed by any 8-neighbor path. The queue grows to at
    most the number of candidate pixels; long winding lines aren't truncated.
    """
    raw = np.asarray(suppressed)
    if (raw.ndim != 2 or raw.size == 0 or raw.dtype.kind != 'f' or
            not np.isfinite(raw).all() or np.any(raw < 0)):
        raise ValueError('hysteresis requires a non-empty finite nonnegative float H×W array')
    if (not np.isfinite(low) or not np.isfinite(high) or
            low < 0 or high <= 0 or low > high):
        raise ValueError('Thresholds must satisfy 0 <= low <= high, high > 0')
    h, w = raw.shape
    candidates = ((raw >= low) & (raw > 0)).ravel()
    seeds = np.flatnonzero(raw.ravel() >= high)
    visited = np.zeros(raw.size, dtype=np.bool_)
    if seeds.size == 0:
        return visited.reshape((h, w))

    # NumPy int32 queue keeps memory linear without thousands of Python
    # integer/deque allocations for dense 1024px edge maps.
    queue = np.empty(int(np.count_nonzero(candidates)), dtype=np.int32)
    queue[:seeds.size] = seeds
    visited[seeds] = True
    head, tail = 0, int(seeds.size)
    while head < tail:
        index = int(queue[head])
        head += 1
        y, x = divmod(index, w)
        for dy in (-1, 0, 1):
            ny = y + dy
            if ny < 0 or ny >= h:
                continue
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx = x + dx
                if nx < 0 or nx >= w:
                    continue
                at = ny * w + nx
                if candidates[at] and not visited[at]:
                    visited[at] = True
                    queue[tail] = at
                    tail += 1
    return visited.reshape((h, w))


def edge_stages(image: np.ndarray, *, sigma: float = 1.0,
                low: float = 0.04, high: float = 0.10) -> EdgeStages:
    """Apply Gaussian, Sobel, NMS and hysteresis; preserve stages for QA.

    Fixed thresholds are intentionally transparent experimental parameters;
    do not assume these work equally well for every photograph.
    """
    if not (np.isfinite(sigma) and 0.15 <= sigma <= 12):
        raise ValueError('sigma must be in [0.15, 12]')
    # Validate thresholds before expensive Gaussian/Sobel work.
    if (not np.isfinite(low) or not np.isfinite(high) or low < 0 or high <= 0 or low > high):
        raise ValueError('Expected 0 <= low <= high, high > 0')
    blurred = gaussian_blur(image, sigma)
    _, _, magnitude, direction = sobel(blurred)
    suppressed = non_maximum_suppression(magnitude, direction)
    final = hysteresis_threshold(suppressed, low, high)
    return EdgeStages(magnitude, suppressed, final)


def canny_like(image: np.ndarray, *, sigma: float = 1.0,
               low: float = 0.04, high: float = 0.10) -> np.ndarray:
    """Return one final bool mask F. Pure NumPy; no mutable project state."""
    return edge_stages(image, sigma=sigma, low=low, high=high).final


def ink_preview(mask: np.ndarray) -> np.ndarray:
    """White paper 255 / black ink 0 for a final bool edge mask."""
    raw = np.asarray(mask)
    if raw.ndim != 2 or raw.size == 0 or raw.dtype != np.bool_:
        raise ValueError('ink_preview requires a non-empty boolean H×W mask')
    return np.where(raw, np.uint8(0), np.uint8(255))


def benchmark_day12(size: int = 512, runs: int = 3, seed: int = 173) -> dict:
    """The exact same deterministic warmed workload for Windows/iPhone.

    Excludes worker startup, image decode, browser transfer and camera FPS.
    """
    if type(size) is not int or not 32 <= size <= 2048:
        raise ValueError('size must be an integer in 32..2048')
    if type(runs) is not int or not 1 <= runs <= 30:
        raise ValueError('runs must be an integer in 1..30')
    src = make_fixture(size, seed=seed)
    blurred = gaussian_blur(src, 1.0)
    _, _, magnitude, direction = sobel(blurred)
    suppressed = non_maximum_suppression(magnitude, direction)
    tasks = (
        ('nms_4_direction', lambda: non_maximum_suppression(magnitude, direction)),
        ('hysteresis_8_connected', lambda: hysteresis_threshold(suppressed, 0.04, 0.10)),
        ('gaussian_sobel_nms_hysteresis', lambda: canny_like(src, sigma=1.0, low=0.04, high=0.10)),
    )
    results = []
    for name, task in tasks:
        task()
        times = []
        for _ in range(runs):
            started = perf_counter()
            out = task()
            times.append(perf_counter() - started)
        results.append({
            'task': name,
            'median_s': round(statistics.median(times), 6),
            'seconds': [round(t, 6) for t in times],
            'checksum': round(float(np.sum(out, dtype=np.float64)), 5),
            'nonzero': int(np.count_nonzero(out)),
            'resultDtype': str(out.dtype),
        })
    final = tasks[-1][1]()
    return {
        'schemaVersion': 1,
        'task': 'day12_edge_pipeline',
        'pipelineVersion': DAY12_ENGINE_VERSION,
        'shape': [size, size],
        'dtype': 'float32',
        'runs': runs,
        'seed': seed,
        'python': platform.python_version(),
        'numpy': np.__version__,
        'nms': 'four-direction quantized asymmetric tie',
        'connectivity': 8,
        'sigma': 1.0,
        'low': 0.04,
        'high': 0.10,
        'finalPixels': int(np.count_nonzero(final)),
        'includesDecodeOrWorkerStart': False,
        'benchmarks': results,
    }
