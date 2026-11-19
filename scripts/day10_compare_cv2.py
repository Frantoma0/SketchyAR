#!/usr/bin/env python3
"""OPTIONAL Windows reference check: NumPy-first Sobel vs OpenCV Sobel.

Not required for Pyodide; imported only when this script runs. Border=REFLECT_101,
scale=1/8, ksize=3, float32 to match our explicit Sobel kernel.
"""
from __future__ import annotations
import json
from pathlib import Path
import sys

import numpy as np
import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'python_engine'))
from ar_drawing.sketch_engine import sobel  # noqa: E402


def main() -> None:
    src = np.random.default_rng(173).random((123,171),dtype=np.float32)
    gx,gy,mag,_=sobel(src)
    refx=cv2.Sobel(src,cv2.CV_32F,1,0,ksize=3,scale=1/8,borderType=cv2.BORDER_REFLECT_101)
    refy=cv2.Sobel(src,cv2.CV_32F,0,1,ksize=3,scale=1/8,borderType=cv2.BORDER_REFLECT_101)
    refmag=np.hypot(refx,refy)
    errors={'gxMaxAbs':float(np.max(np.abs(gx-refx))),
            'gyMaxAbs':float(np.max(np.abs(gy-refy))),
            'magnitudeMaxAbs':float(np.max(np.abs(mag-refmag)))}
    status='PASS' if max(errors.values())<=1e-6 else 'FAIL'
    report={'status':status,'shape':list(src.shape),'dtype':'float32',
            'opencv':cv2.__version__,'reference':'cv2.Sobel ksize3 scale=1/8 BORDER_REFLECT_101',
            'maxAllowedAbs':1e-6,'errors':errors}
    print(json.dumps(report,indent=2))
    if status != 'PASS':raise SystemExit(1)

if __name__=='__main__':main()
