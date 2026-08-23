from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "coloring" / "yota-03" / "plain-gallery-source.webp"
OUT = ROOT / "reports" / "yota03-watermark-mask-preview.png"
CANDIDATE_OUT = ROOT / "reports" / "yota03-watermark-detected-preview.png"
CLEAN_OUT = ROOT / "coloring" / "yota-03" / "clean-base-source.png"

bgr = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
h, w = rgb.shape[:2]
maximum = rgb.max(axis=2)
minimum = rgb.min(axis=2)
average = rgb.mean(axis=2)
y, x = np.indices((h, w))
band = ((x + y) > 1030) & ((x + y) < 1660)
neutral_gray = ((maximum - minimum) < 15) & (average > 145) & (average < 238) & band
candidate = (neutral_gray.astype(np.uint8) * 255)
candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
mask = np.zeros_like(candidate)
for label in range(1, count):
    left, top, width, height, area = stats[label]
    if area >= 80 and (width >= 10 or height >= 10):
        mask[labels == label] = 255

mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
best = None
font_path = "C:/Windows/Fonts/arialbd.ttf"
for font_size in range(120, 181, 4):
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox("popekyrillos.store", stroke_width=0)
    text_image = Image.new("L", (bbox[2] - bbox[0] + 20, bbox[3] - bbox[1] + 20), 0)
    ImageDraw.Draw(text_image).text((10 - bbox[0], 10 - bbox[1]), "popekyrillos.store", font=font, fill=255)
    for angle in range(43, 48):
        template = np.array(text_image.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC))
        template = ((template > 36).astype(np.uint8) * 255)
        if template.shape[0] > h or template.shape[1] > w:
            continue
        scores = cv2.matchTemplate(mask, template, cv2.TM_CCORR_NORMED)
        _, score, _, location = cv2.minMaxLoc(scores)
        if best is None or score > best[0]:
            best = (score, location, template, font_size, angle)

score, (left, top), text_template, font_size, angle = best
text_mask = np.zeros_like(mask)
text_mask[top:top + text_template.shape[0], left:left + text_template.shape[1]] = text_template
text_mask = cv2.dilate(text_mask, np.ones((3, 3), np.uint8), iterations=1)
preview = rgb.copy()
preview[text_mask > 0] = (255, 0, 255)
blend = cv2.addWeighted(rgb, 0.55, preview, 0.45, 0)
cv2.imwrite(str(OUT), cv2.cvtColor(blend, cv2.COLOR_RGB2BGR))
detected_preview = rgb.copy()
detected_preview[mask > 0] = (255, 0, 255)
detected_blend = cv2.addWeighted(rgb, 0.55, detected_preview, 0.45, 0)
cv2.imwrite(str(CANDIDATE_OUT), cv2.cvtColor(detected_blend, cv2.COLOR_RGB2BGR))
# The product and its engraved design are bilaterally symmetric. Use the clean
# mirrored product pixel as the primary reconstruction source, then inpaint the
# tiny centre-line overlap. The expanded type raster catches composited gray-
# brown watermark pixels on wood that cannot be selected by gray thresholding.
cleaned = cv2.inpaint(bgr, mask, 7, cv2.INPAINT_TELEA)
mirror_x = np.clip((2 * 684) - np.arange(w), 0, w - 1)
mirrored = bgr[:, mirror_x]
# The only watermark pixels not neutral enough for the real-pixel selector are
# those composited over the warm pendant. Reconstruct that diagonal corridor
# from the corresponding clean right-hand half of this symmetric product.
pendant_corridor = ((y > 650) & (x < 684) & ((x + y) > 1190) & ((x + y) < 1625)).astype(np.uint8) * 255
alpha = cv2.GaussianBlur(pendant_corridor, (0, 0), 4).astype(np.float32) / 255.0
alpha = alpha[:, :, None]
cleaned = np.clip(cleaned.astype(np.float32) * (1 - alpha) + mirrored.astype(np.float32) * alpha, 0, 255).astype(np.uint8)
# This small rectangle is pure outside background in the clean photograph; the
# remaining gray arc here is the watermark's antialiased edge, not a shadow.
cleaned[625:755, 500:638] = 255
cv2.imwrite(str(CLEAN_OUT), cleaned)
print({"detected_pixels": int((mask > 0).sum()), "template_pixels": int((text_mask > 0).sum()), "score": score, "font_size": font_size, "angle": angle, "left": left, "top": top, "preview": str(OUT)})
