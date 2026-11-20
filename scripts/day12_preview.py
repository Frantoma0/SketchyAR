"""Visualize the definitive final F from NumPy NMS+hysteresis on local photos.

Pillow is used ONLY by this Windows preview script; it is NOT a Pyodide
runtime dependency. Personal inputs and outputs stay in gitignored outputs/.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day12_edges import edge_stages, ink_preview
from ar_drawing.day11_morphology import make_fixture
from ar_drawing.sketch_engine import xdog_preset
import numpy as np


def load_photos(paths: list[Path], demo: bool):
    from PIL import Image
    if demo:
        try:
            from skimage import data
        except ImportError as e:
            raise SystemExit('Demo fixtures need scikit-image on Windows; use --input instead.') from e
        yield 'astronaut_skimage_demo', Image.fromarray(data.astronaut())
        yield 'cat_skimage_demo', Image.fromarray(data.chelsea())
        yield 'coffee_skimage_demo', Image.fromarray(data.coffee())
    for path in paths:
        with Image.open(path) as img:
            yield path.stem, img.convert('RGB').copy()
    if not demo and not paths:
        src = make_fixture(512)
        yield 'synthetic_fixture', Image.fromarray((src * 255).astype(np.uint8), 'L')


def preview(name: str, image, root: Path, max_side: int):
    from PIL import Image, ImageOps, ImageDraw
    # EXIF orientation must be honored before resizing (important for iPhone photos).
    image = ImageOps.exif_transpose(image)
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    gray = np.asarray(image.convert('L'), dtype=np.float32) / np.float32(255)
    if min(gray.shape) < 3:
        raise ValueError('Preview needs at least 3 pixels on each axis')
    normal = edge_stages(gray, sigma=1.0, low=.04, high=.1)
    # Alternative is ONLY a research setting, not a production "photo" preset.
    alternate = edge_stages(gray, sigma=.85, low=.025, high=.065)
    def tile(g):
        return Image.fromarray(np.rint(np.clip(g, 0, 1) * 255).astype('uint8'), 'L').convert('RGB')
    tiles = [
        ('Original', image.convert('RGB')),
        ('XDoG balanced', tile(xdog_preset(gray, 'balanced'))),
        ('Sobel magnitude', tile(normal.magnitude / max(float(normal.magnitude.max()), .001))),
        ('NMS (not final F)', tile(1 - normal.suppressed / max(float(normal.suppressed.max()), .001))),
        ('F: default .04/.10', Image.fromarray(ink_preview(normal.final), 'L').convert('RGB')),
        ('F: alternative .025/.065', Image.fromarray(ink_preview(alternate.final), 'L').convert('RGB')),
    ]
    w, h = image.size
    pad, label_h = 12, 26
    board = Image.new('RGB', (3*w + 4*pad, 2*(h + label_h) + 3*pad), '#f1f0ed')
    d = ImageDraw.Draw(board)
    for k, (label, tile_img) in enumerate(tiles):
        x = pad + (k % 3) * (w + pad)
        y = pad + (k // 3) * (h + label_h + pad)
        board.paste(tile_img, (x, y+label_h))
        d.text((x+4, y+4), label, fill='#252525')
    root.mkdir(parents=True, exist_ok=True)
    path = root / f'{name}_comparison.png'
    board.save(path)
    print(f'{path} — default F={int(normal.final.sum())} pixels, '
          f'alternative F={int(alternate.final.sum())} pixels')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', type=Path, nargs='*', default=[], help='Your own local photographs')
    ap.add_argument('--demo-skimage', action='store_true', help='Optional sample images on CPython only; never bundled')
    ap.add_argument('--max-side', type=int, default=512)
    ap.add_argument('--output', type=Path, default=ROOT/'experiments/outputs/day12')
    args = ap.parse_args()
    if not 64 <= args.max_side <= 1024:
        ap.error('max-side must be 64..1024')
    for name, image in load_photos(args.input, args.demo_skimage):
        preview(name, image, args.output, args.max_side)


if __name__ == '__main__':
    main()
