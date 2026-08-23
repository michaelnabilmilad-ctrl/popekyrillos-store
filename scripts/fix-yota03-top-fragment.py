from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "coloring" / "yota-03"
REPORTS = ROOT / "reports"
BASE_PATHS = [MODEL / "clean-base-source.png", MODEL / "base.png"]
OUTLINE_PATH = MODEL / "outline.png"
REGIONS_PATH = MODEL / "regions.png"

# Exact residual watermark footprint below the top hole. It is deliberately
# confined below the hole/connector and above the rest of the medallion.
fragment = np.zeros((1400, 1400), np.uint8)
cv2.fillPoly(fragment, [np.array([
    [683, 690], [737, 740], [711, 771], [684, 746],
    [657, 771], [631, 741],
], np.int32)], 255)
fragment = cv2.dilate(fragment, np.ones((5, 5), np.uint8), iterations=1)

regions = cv2.imread(str(REGIONS_PATH), cv2.IMREAD_UNCHANGED)
region_one = (
    (regions[:, :, 0] == 73)
    & (regions[:, :, 1] == 0)
    & (regions[:, :, 2] == 1)
    & (regions[:, :, 3] > 0)
).astype(np.uint8) * 255
engraved_boundary = cv2.morphologyEx(region_one, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))

before = cv2.imread(str(MODEL / "base.png"), cv2.IMREAD_COLOR)
cleaned = before.copy()
# Never touch the black hole, metal, outside white, or shadow. The residual
# overlay on wood remains warm enough to be isolated from all of those.
b, g, r = cv2.split(before.astype(np.int16))
wood_surface = (r - g > 14) & (g - b > 14) & ((r + g + b) / 3 > 75)
luma = cv2.cvtColor(before, cv2.COLOR_BGR2GRAY)
# Select the darker gray-brown overlay itself while leaving the darker laser
# line and the lighter untouched wood intact.
watermark_pixels = (fragment > 0) & wood_surface & (luma > 105) & (luma < 190)
watermark_mask = watermark_pixels.astype(np.uint8) * 255
temporary = before.copy()
sample_zone = wood_surface[675:790, 615:755] & (luma[675:790, 615:755] >= 190)
wood_median = np.median(before[675:790, 615:755][sample_zone], axis=0).astype(np.uint8)
# Prevent the nearby black hole and laser line from bleeding into the fill.
local_nonwood = ~wood_surface[675:790, 615:755] | (luma[675:790, 615:755] < 190)
temporary[675:790, 615:755][local_nonwood] = wood_median
filled = cv2.inpaint(temporary, watermark_mask, 3, cv2.INPAINT_TELEA)
cleaned = before.copy()

# Transfer real multi-scale wood grain from the clean right repeated cross.
# Dark donor engraving is first removed, so only natural timber is transferred.
donor = np.roll(np.roll(before, -210, axis=0), -200, axis=1)
donor_luma = cv2.cvtColor(donor, cv2.COLOR_BGR2GRAY)
donor_bad = ((fragment > 0) & (donor_luma < 175)).astype(np.uint8) * 255
donor_wood = cv2.inpaint(donor, donor_bad, 3, cv2.INPAINT_TELEA).astype(np.float32)
valid_donor = watermark_pixels & (donor_luma >= 175)
donor_median = np.median(donor_wood[valid_donor], axis=0) if valid_donor.any() else wood_median
adjusted_donor = np.clip(donor_wood + (wood_median.astype(np.float32) - donor_median), 0, 255).astype(np.uint8)
mixed_wood = np.clip(adjusted_donor.astype(np.float32) * .62 + filled.astype(np.float32) * .38, 0, 255).astype(np.uint8)
cleaned[watermark_pixels] = mixed_wood[watermark_pixels]
for path in BASE_PATHS:
    cv2.imwrite(str(path), cleaned)

outline = np.array(Image.open(OUTLINE_PATH).convert("RGBA"))
outline_luma = outline[:, :, :3].mean(axis=2)
outline_fragment = (fragment > 0) & (outline[:, :, 3] > 0) & (outline_luma > 105)
outline[outline_fragment, 3] = 0
Image.fromarray(outline, "RGBA").save(OUTLINE_PATH)

REPORTS.mkdir(exist_ok=True)
crop = (605, 655, 765, 805)
before_crop = before[crop[1]:crop[3], crop[0]:crop[2]]
after_crop = cleaned[crop[1]:crop[3], crop[0]:crop[2]]
before_large = cv2.resize(before_crop, (640, 600), interpolation=cv2.INTER_NEAREST)
after_large = cv2.resize(after_crop, (640, 600), interpolation=cv2.INTER_NEAREST)
labels = np.full((55, 1280, 3), 255, np.uint8)
cv2.putText(labels, "BEFORE", (260, 38), cv2.FONT_HERSHEY_SIMPLEX, 1, (25, 25, 25), 2, cv2.LINE_AA)
cv2.putText(labels, "AFTER", (900, 38), cv2.FONT_HERSHEY_SIMPLEX, 1, (25, 25, 25), 2, cv2.LINE_AA)
preview = np.vstack([labels, np.hstack([before_large, after_large])])
preview_path = REPORTS / "yota03-top-fragment-before-after.png"
cv2.imwrite(str(preview_path), preview)
print({"changed_box": [637, 695, 732, 767], "preview": str(preview_path)})
