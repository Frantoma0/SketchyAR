"""Optional academic reference (Windows only); cv2 is NOT shipped to iPhone."""
from pathlib import Path
import sys
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day11_morphology import otsu_threshold, binary_morphology, make_fixture

try:
    import cv2
except ImportError as exc:
    raise SystemExit('Install optional reference package: pip install opencv-python-headless') from exc

for size in (64, 512, 1024):
    image = make_fixture(size)
    uint8 = np.rint(image * np.float32(255)).astype(np.uint8)
    ref_t, ref_mask = cv2.threshold(uint8, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    own_t, own_mask = otsu_threshold(image)
    assert own_t == int(ref_t), (size, own_t, ref_t)
    assert np.array_equal(own_mask, ref_mask != 0), f'Otsu mask differs for {size}'
    kernel = np.ones((3, 3), np.uint8)
    for name, flag in (('erode', cv2.MORPH_ERODE), ('dilate', cv2.MORPH_DILATE), ('open', cv2.MORPH_OPEN), ('close', cv2.MORPH_CLOSE)):
        src = own_mask.astype(np.uint8)
        if name == 'erode':
            ref = cv2.erode(src, kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0)
        elif name == 'dilate':
            ref = cv2.dilate(src, kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0)
        else:
            ref = cv2.morphologyEx(src, flag, kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0)
        mine = binary_morphology(own_mask, name)
        assert np.array_equal(ref.astype(bool), mine), f'{name} differs for {size}'
print('PASS: Otsu and four morphology operations match OpenCV for 64/512/1024 with explicit border=0.')
