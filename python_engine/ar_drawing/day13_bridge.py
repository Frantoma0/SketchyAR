"""SketchyAR Day 13: binary grayscale bridge to the existing Day 12 edge engine.

Input: one row-major uint8 grayscale buffer, H*W bytes. Output: one row-major
uint8 mask, H*W bytes (0=no ink, 1=ink). No PNG generation, DOM or network in
Python: the browser is responsible for lossless transparent PNG encoding.
"""
from __future__ import annotations
from dataclasses import dataclass

import numpy as np
from .day12_edges import canny_like, DAY12_ENGINE_VERSION

MAX_PIXELS = 1024 * 1024
BRIDGE_VERSION = 'day13-gray8-mask-v1'


@dataclass(frozen=True)
class BridgeResult:
    ink: bytes
    width: int
    height: int
    ink_pixels: int
    engine_version: str = DAY12_ENGINE_VERSION
    bridge_version: str = BRIDGE_VERSION


def process_gray8(data: bytes | bytearray | memoryview, width: int, height: int,
                  sigma: float = 1.0, low: float = .04, high: float = .10) -> BridgeResult:
    """Run NumPy-first Canny-like on a browser-resized grayscale frame.

    All validation happens before the expensive Gaussian/Sobel stages.
    The incoming buffer is never modified. The working grayscale is float32.
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
    normalized = gray.astype(np.float32) * np.float32(1.0 / 255.0)
    result = canny_like(normalized, sigma=sigma, low=low, high=high)
    pixels = result.astype(np.uint8).tobytes(order='C')
    return BridgeResult(pixels, width, height, int(np.count_nonzero(result)))
