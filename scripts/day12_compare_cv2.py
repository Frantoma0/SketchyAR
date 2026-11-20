"""Optional reference comparison: expected approximate, not pixelwise parity.

No OpenCV dependency on the phone; execute on Windows only when cv2 exists.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'python_engine'))
from ar_drawing.day11_morphology import make_fixture
from ar_drawing.day12_edges import canny_like


def main():
    try:
        import cv2
    except ImportError:
        print('SKIP: pip install opencv-python for optional reference comparison.')
        return
    img = make_fixture(512)
    ours = canny_like(img, sigma=1., low=.04, high=.1)
    src = np.rint(img*255).astype(np.uint8)
    # approximate derivative thresholds 8*255*ours (Sobel is /8)
    ref = cv2.Canny(cv2.GaussianBlur(src, (0, 0), 1), 82, 204, L2gradient=True) > 0
    kernel = np.ones((3, 3), np.uint8)
    expanded_ref = cv2.dilate(ref.astype(np.uint8), kernel) > 0
    expanded_ours = cv2.dilate(ours.astype(np.uint8), kernel) > 0
    precision = np.count_nonzero(ours & expanded_ref) / max(np.count_nonzero(ours), 1)
    recall = np.count_nonzero(ref & expanded_ours) / max(np.count_nonzero(ref), 1)
    score = 2*precision*recall / max(precision+recall, 1e-9)
    print(f'cv2={cv2.__version__}, ours={int(ours.sum())}, OpenCV={int(ref.sum())}, '
          f'precision@1px={precision:.3f}, recall@1px={recall:.3f}, F1@1px={score:.3f}')
    print('NOTE: this is a reference comparison only. Different border/NMS/tie rules mean no exact parity.')


if __name__ == '__main__':
    main()
