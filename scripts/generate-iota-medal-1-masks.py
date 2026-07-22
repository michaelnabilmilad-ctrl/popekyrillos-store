from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "coloring" / "iota-medal-1"
BASE = OUT / "base.webp"

base = Image.open(BASE).convert("RGBA")
width, height = base.size
if (width != 1400 or height != 1400):
    raise SystemExit(f"Expected a 1400x1400 base image, got {width}x{height}")

mask = Image.new("RGB", base.size, (0, 0, 0))
draw = ImageDraw.Draw(mask)

Y_OFFSET = 220

def region(region_id, rectangles):
    color = (region_id, 0, 0)
    for left, top, right, bottom in rectangles:
        draw.rectangle((left, top + Y_OFFSET, right, bottom + Y_OFFSET), fill=color)

# Four small Jerusalem crosses. Rectangles are deliberately inset from the
# laser strokes; the transparent outline layer covers their edges at runtime.
region(2, [(584, 625, 638, 753), (548, 664, 674, 716)])
region(3, [(762, 625, 816, 753), (726, 664, 852, 716)])
region(4, [(584, 788, 638, 916), (548, 827, 674, 879)])
region(5, [(762, 788, 816, 916), (726, 827, 852, 879)])

# Main cross: one region made from its vertical stem and three crossbars.
region(1, [
    (662, 558, 738, 982),
    (620, 617, 780, 686),
    (478, 728, 872, 794),
    (620, 908, 780, 969),
])

# Enclosed background squares around the crosses.
region(6, [(552, 724, 580, 758)])
region(7, [(820, 724, 848, 758)])
region(8, [(552, 801, 580, 835)])
region(9, [(820, 801, 848, 835)])
region(10, [(642, 692, 658, 724)])
region(11, [(742, 692, 758, 724)])
region(12, [(642, 798, 658, 826)])
region(13, [(742, 798, 758, 826)])

mask.save(OUT / "region-mask.png", optimize=True)

# Keep only brown laser/detail pixels inside the wooden medal. Neutral grey
# watermark pixels are excluded by the warm-color checks below.
source = base.load()
outline = Image.new("RGBA", base.size, (0, 0, 0, 0))
target = outline.load()
cx, cy, radius = 700, 1010, 345
for y in range(max(0, cy - radius), min(height, cy + radius + 1)):
    for x in range(max(0, cx - radius), min(width, cx + radius + 1)):
        if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
            continue
        r, g, b, _ = source[x, y]
        warm_dark = r > g * 1.05 and g > b * 1.08 and (r + g + b) < 430
        very_dark = (r + g + b) < 165
        if warm_dark or very_dark:
            target[x, y] = (r, g, b, 255)

outline.save(OUT / "outline.png", optimize=True)
print(f"Generated mask and outline in {OUT}")
