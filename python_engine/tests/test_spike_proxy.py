import numpy as np
import pytest

from ar_drawing.spike_proxy import benchmark, gaussian_separable, process, sobel_magnitude


def test_shape_dtype_and_constant_image():
    image = np.ones((16, 19), dtype=np.float32)
    output = process(image)
    assert output.shape == image.shape
    assert output.dtype == np.float32
    assert np.max(np.abs(output)) < 1e-6


def test_sobel_on_horizontal_ramp():
    image = np.tile(np.arange(20, dtype=np.float32), (20, 1))
    magnitude = sobel_magnitude(image)
    assert magnitude[10, 10] == pytest.approx(1.0)
    assert gaussian_separable(image).dtype == np.float32


def test_benchmark_schema():
    result = benchmark(size=16, runs=2)
    assert result["task"] == "numpy_gaussian5_sobel_proxy"
    assert result["runs"] == 2
    assert result["median_s"] >= 0
    assert len(result["seconds"]) == 2
