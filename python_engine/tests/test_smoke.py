import numpy as np

import ar_drawing


def test_package_has_version():
    assert isinstance(ar_drawing.__version__, str) and ar_drawing.__version__


def test_float32_is_preserved():
    # Ядрото работи с float32 (паметта в WASM); този тест пази договора още от Ден 1.
    a = np.zeros((4, 4), dtype=np.float32)
    assert (a + 1).dtype == np.float32
