"""Create a synthetic black-ink/paper morphology comparison; requires Pillow on PC only."""
from pathlib import Path
import argparse
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python_engine'))
from ar_drawing.day11_morphology import make_fixture, otsu_threshold, binary_morphology, ink_preview


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--size', type=int, default=512)
    args = parser.parse_args()
    src = make_fixture(args.size)
    threshold, ink = otsu_threshold(src)
    originals = (
        ('Original synthetic', np.rint(src * 255).astype(np.uint8)),
        (f'Otsu threshold {threshold}', ink_preview(ink)),
        ('Opening 3x3', ink_preview(binary_morphology(ink, 'open'))),
        ('Closing 3x3', ink_preview(binary_morphology(ink, 'close'))),
        ('Opening + closing', ink_preview(binary_morphology(binary_morphology(ink, 'open'), 'close'))),
    )
    width = 370
    side = 320
    height = 398
    sheet = Image.new('RGB', (3 * width + 24, 2 * height + 24), '#f8f6f2')
    draw = ImageDraw.Draw(sheet)
    for i, (title, arr) in enumerate(originals):
        img = Image.fromarray(arr, 'L').resize((side, side), Image.Resampling.NEAREST)
        x = 12 + (i % 3) * width
        y = 12 + (i // 3) * height
        sheet.paste(img.convert('RGB'), (x + 12, y + 38))
        draw.text((x + 12, y + 10), title, fill='#333333')
    target = ROOT / 'experiments/outputs/day11/comparison.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    print(str(target))


if __name__ == '__main__':
    main()
