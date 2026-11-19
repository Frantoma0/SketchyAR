"""SketchyAR Day 11: Otsu thresholding and binary morphology (NumPy only).

Dark-ink convention: True means a black stroke/foreground pixel.
Morphology uses an odd square structuring element with constant False padding;
no pixel wraps around borders. All outputs have the same H×W shape.
No SciPy/OpenCV/Pillow/browser dependency at runtime.
"""
from __future__ import annotations

from time import perf_counter
import platform
import statistics

import numpy as np

from .sketch_engine import to_grayscale

DAY11_ENGINE_VERSION = 'day11-otsu-morph-v1'


def otsu_threshold(image: np.ndarray, *, foreground: str = 'dark') -> tuple[int, np.ndarray]:
    """Return uint8 Otsu threshold (0..255) and a boolean foreground mask.

    Convert normalized image to uint8 using nearest-integer quantization, then
    maximize between-class variance over thresholds 0..254. If several
    thresholds tie, choose the *first* (as in common reference implementations).
    Uniform images return an empty foreground mask rather than an all-ink mask.
    """
    if foreground not in ('dark', 'light'):
        raise ValueError("foreground must be 'dark' or 'light'")
    gray = to_grayscale(image)
    quantized = np.rint(gray * np.float32(255)).astype(np.uint8)
    hist = np.bincount(quantized.ravel(), minlength=256).astype(np.float64)
    if np.count_nonzero(hist) < 2:
        return int(quantized[0, 0]), np.zeros(gray.shape, dtype=np.bool_)

    bins = np.arange(256, dtype=np.float64)
    w0 = np.cumsum(hist)[:-1]
    mu0 = np.cumsum(hist * bins)[:-1]
    total = float(quantized.size)
    mu_total = float(np.sum(hist * bins))
    valid = (w0 > 0) & (w0 < total)
    variance = np.full(255, -1.0, dtype=np.float64)
    numerator = mu_total * w0[valid] - total * mu0[valid]
    variance[valid] = numerator * numerator / (w0[valid] * (total - w0[valid]))
    threshold = int(np.argmax(variance))
    mask = quantized <= threshold if foreground == 'dark' else quantized > threshold
    return threshold, mask


def _validate_mask(mask: np.ndarray) -> np.ndarray:
    raw = np.asarray(mask)
    if raw.ndim != 2 or raw.size == 0 or raw.dtype != np.bool_:
        raise ValueError('Expected a non-empty 2-D boolean foreground mask')
    return raw


def _step(mask: np.ndarray, *, kernel_size: int, dilate: bool) -> np.ndarray:
    radius = kernel_size // 2
    height, width = mask.shape
    padded = np.pad(mask, radius, mode='constant', constant_values=False)
    result = np.zeros(mask.shape, dtype=np.bool_) if dilate else np.ones(mask.shape, dtype=np.bool_)
    for y in range(kernel_size):
        for x in range(kernel_size):
            view = padded[y:y+height, x:x+width]
            if dilate:
                np.logical_or(result, view, out=result)
            else:
                np.logical_and(result, view, out=result)
    return result


def binary_morphology(mask: np.ndarray, operation: str, *, kernel_size: int = 3,
                      iterations: int = 1) -> np.ndarray:
    """Erode/dilate/open/close a bool mask; returns new bool array.

    Border pixels outside the image are False for each primitive. Erosion
    therefore shrinks full-frame foreground at the image boundary.
    Iterations mean repeat erosion/dilation that many times; for opening and
    closing, perform all erosion passes then all dilation passes (or reverse).
    """
    src = _validate_mask(mask)
    if operation not in ('erode', 'dilate', 'open', 'close'):
        raise ValueError('operation must be erode, dilate, open or close')
    if type(kernel_size) is not int or kernel_size not in (1, 3, 5):
        raise ValueError('kernel_size must be 1, 3 or 5 (square)')
    if type(iterations) is not int or not 1 <= iterations <= 4:
        raise ValueError('iterations must be an integer in 1..4')
    sequence = {
        'erode': (False,), 'dilate': (True,),
        'open': (False, True), 'close': (True, False),
    }[operation]
    output = src
    for dilate in sequence:
        for _ in range(iterations):
            output = _step(output, kernel_size=kernel_size, dilate=dilate)
    return output.copy() if output is src else output


def ink_preview(mask: np.ndarray) -> np.ndarray:
    """Return paper=255 / ink=0 uint8 image, suitable for PNG preview."""
    return np.where(_validate_mask(mask), np.uint8(0), np.uint8(255))


def make_fixture(size: int, seed: int = 173) -> np.ndarray:
    """Synthetic black strokes/blocks, white background and seeded noise."""
    if type(size) is not int or not 32 <= size <= 2048:
        raise ValueError('size must be in 32..2048')
    rng = np.random.default_rng(seed)
    src = np.full((size, size), np.float32(.94), dtype=np.float32)
    src[size//4:size//4+max(3, size//128), size//8:7*size//8] = np.float32(.12)
    src[size//3:3*size//4, size//2:size//2+max(3, size//128)] = np.float32(.09)
    src[3*size//5:4*size//5, size//8:size//4] = np.float32(.18)
    noise = rng.random((size, size), dtype=np.float32)
    src[noise < .004] = np.float32(.04)   # isolated dark dust
    src[noise > .997] = np.float32(.99)  # sparse bright holes
    return src


def benchmark_day11(size: int = 512, runs: int = 3, seed: int = 173) -> dict:
    """Deterministic CPython/Pyodide workload; excludes decode and Worker start."""
    if type(size) is not int or not 32 <= size <= 2048:
        raise ValueError('size must be an integer in 32..2048')
    if type(runs) is not int or not 1 <= runs <= 30:
        raise ValueError('runs must be an integer in 1..30')
    src = make_fixture(size, seed)
    _, original = otsu_threshold(src)
    tasks = (
        ('otsu_dark', lambda: otsu_threshold(src)[1]),
        ('open_3x3', lambda: binary_morphology(original, 'open', kernel_size=3)),
        ('close_3x3', lambda: binary_morphology(original, 'close', kernel_size=3)),
        ('open_then_close_3x3', lambda: binary_morphology(binary_morphology(original, 'open'), 'close')),
    )
    records = []
    for name, task in tasks:
        task()  # warm-up excluded
        times = []
        for _ in range(runs):
            started = perf_counter()
            result = task()
            times.append(perf_counter() - started)
        records.append({
            'task': name,
            'median_s': round(statistics.median(times), 6),
            'seconds': [round(t, 6) for t in times],
            'checksum': int(np.count_nonzero(result)),
            'foregroundPixels': int(np.count_nonzero(result)),
            'resultDtype': str(result.dtype),
        })
    threshold, _ = otsu_threshold(src)
    return {
        'schemaVersion': 1,
        'task': 'day11_otsu_morphology',
        'pipelineVersion': DAY11_ENGINE_VERSION,
        'shape': [size, size],
        'dtype': 'float32',
        'runs': runs,
        'seed': seed,
        'python': platform.python_version(),
        'numpy': np.__version__,
        'otsuThresholdUint8': threshold,
        'borderMode': 'constant-false',
        'kernel': 'square-3x3',
        'includesDecodeOrWorkerStart': False,
        'benchmarks': records,
    }
