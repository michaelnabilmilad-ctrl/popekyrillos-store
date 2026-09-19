import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const artifacts = path.join(root, "artifacts", "yota-07-color-quality");
fs.mkdirSync(artifacts, { recursive: true });

for (const name of ["regions.png", "outline.png", "regions.json"]) {
  const source = path.join(dir, name);
  const backup = path.join(artifacts, name.replace(".", "-before."));
  if (!fs.existsSync(backup)) fs.copyFileSync(source, backup);
}

const metadataPath = path.join(dir, "regions.json");
const metadata = JSON.parse(fs.readFileSync(path.join(artifacts, "regions-before.json"), "utf8"));
const maskImage = await sharp(path.join(artifacts, "regions-before.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const outlineImage = await sharp(path.join(artifacts, "outline-before.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.from(maskImage.data), outline = Buffer.from(outlineImage.data);
const imageWidth = maskImage.info.width;
let repaired = 0, removedOverlay = 0;

for (const region of metadata.regions) {
  const { x, y, width, height } = region.bounds;
  const target = (px, py) => {
    const o = (py * imageWidth + px) * 4;
    return mask[o] === region.maskColor[0] && mask[o + 1] === region.maskColor[1] && mask[o + 2] === region.maskColor[2] && mask[o + 3] !== 0;
  };
  const seen = new Uint8Array(width * height);
  for (let ly = 0; ly < height; ly++) for (let lx = 0; lx < width; lx++) {
    const start = ly * width + lx;
    if (seen[start] || target(x + lx, y + ly)) continue;
    const queue = [start]; seen[start] = 1; const pixels = []; let edge = false; let darkOutline = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi], cx = p % width, cy = Math.floor(p / width); pixels.push(p);
      if (!cx || !cy || cx === width - 1 || cy === height - 1) edge = true;
      const o = ((y + cy) * imageWidth + x + cx) * 4;
      const luma = .2126 * outline[o] + .7152 * outline[o + 1] + .0722 * outline[o + 2];
      if (outline[o + 3] && luma < 120) darkOutline++;
      for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (!seen[np] && !target(x + nx, y + ny)) { seen[np] = 1; queue.push(np); }
      }
    }
    // A real engraved opening has a substantial dark outline. The defects are
    // tiny enclosed light texture fragments with no meaningful engraved edge.
    if (edge || pixels.length > 100 || darkOutline >= 3) continue;
    for (const p of pixels) {
      const px = x + p % width, py = y + Math.floor(p / width), o = (py * imageWidth + px) * 4;
      mask[o] = region.maskColor[0]; mask[o + 1] = region.maskColor[1]; mask[o + 2] = region.maskColor[2]; mask[o + 3] = 255;
      if (outline[o + 3]) { outline[o + 3] = 0; removedOverlay++; }
      repaired++;
    }
  }
}

assert.equal(repaired, 619, "Only the reviewed enclosed light fragments may be repaired");
assert.equal(removedOverlay, 619, "Each repaired fragment must lose its light overlay pixel");
for (const region of metadata.regions) {
  let count = 0;
  for (let p = 0; p < mask.length / 4; p++) {
    const o = p * 4;
    if (mask[o] === region.maskColor[0] && mask[o + 1] === region.maskColor[1] && mask[o + 2] === region.maskColor[2] && mask[o + 3]) count++;
  }
  region.pixelCount = count;
}
metadata.modelVersion = "yota-07-v3";
await sharp(mask, { raw: maskImage.info }).png({ compressionLevel: 9 }).toFile(path.join(dir, "regions.png"));
await sharp(outline, { raw: outlineImage.info }).png({ compressionLevel: 9 }).toFile(path.join(dir, "outline.png"));
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ modelId: metadata.modelId, repairedMaskPixels: repaired, removedLightOverlayPixels: removedOverlay }));
