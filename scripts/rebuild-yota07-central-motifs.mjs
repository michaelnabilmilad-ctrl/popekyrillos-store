import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const artifacts = path.join(root, "artifacts", "yota-07-central-motifs");
fs.mkdirSync(artifacts, { recursive: true });
const metadata = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const maskImage = await sharp(path.join(dir, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const outlineImage = await sharp(path.join(dir, "outline.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const baseImage = await sharp(path.join(dir, "base.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (const name of ["regions.png", "outline.png", "regions.json"]) {
  const source = path.join(dir, name), backup = path.join(artifacts, name.replace(".", "-before."));
  if (!fs.existsSync(backup)) fs.copyFileSync(source, backup);
}
const mask = Buffer.from(maskImage.data), { width: W, height: H } = maskImage.info;
const targets = new Set(["region-5", "region-6", "region-8", "region-9"]);

// The barrier is derived only from the engraved dark overlay. A one-pixel
// expansion closes antialiased pinholes without using any previous mask edge.
const dark = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const o = p * 4, luma = .2126 * outlineImage.data[o] + .7152 * outlineImage.data[o + 1] + .0722 * outlineImage.data[o + 2];
  if (outlineImage.data[o + 3] && luma < 155) dark[p] = 1;
}
const barrier = new Uint8Array(dark);
for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
  const p = y * W + x;
  if (!dark[p]) continue;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) barrier[(y + dy) * W + x + dx] = 1;
}

// Clear only the four requested motifs, leaving outer crosses and center core byte-identical.
for (let p = 0; p < W * H; p++) {
  const o = p * 4;
  for (const region of metadata.regions) if (targets.has(region.id) &&
      mask[o] === region.maskColor[0] && mask[o + 1] === region.maskColor[1] && mask[o + 2] === region.maskColor[2] && mask[o + 3]) {
    mask[o] = mask[o + 1] = mask[o + 2] = mask[o + 3] = 0;
    break;
  }
}

for (const region of metadata.regions.filter((item) => targets.has(item.id))) {
  const bounds = region.bounds, pad = 4;
  const minX = bounds.x - pad, maxX = bounds.x + bounds.width - 1 + pad;
  const minY = bounds.y - pad, maxY = bounds.y + bounds.height - 1 + pad;
  let seed = -1;
  for (let radius = 0; radius <= 12 && seed < 0; radius++) for (let dy = -radius; dy <= radius && seed < 0; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x = region.sampleX + dx, y = region.sampleY + dy, p = y * W + x, o = p * 4;
    const wasRegion = maskImage.data[o] === region.maskColor[0] && maskImage.data[o + 1] === region.maskColor[1] && maskImage.data[o + 2] === region.maskColor[2] && maskImage.data[o + 3];
    if (wasRegion && !barrier[p]) { seed = p; break; }
  }
  if (seed < 0) throw new Error(`${region.id} has no interior seed away from the engraved border`);
  const seen = new Uint8Array(W * H), queue = [seed]; seen[seed] = 1;
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index], x = p % W, y = Math.floor(p / W);
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const np = ny * W + nx;
      if (seen[np] || barrier[np]) continue;
      seen[np] = 1; queue.push(np);
    }
  }
  const expanded = new Set(queue);
  for (let pass = 0; pass < 2; pass++) for (const p of [...expanded]) {
    const x = p % W, y = Math.floor(p / W);
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const np = ny * W + nx;
      expanded.add(np);
    }
  }
  for (const p of expanded) {
    const o = p * 4;
    mask[o] = region.maskColor[0]; mask[o + 1] = region.maskColor[1]; mask[o + 2] = region.maskColor[2]; mask[o + 3] = 255;
  }
  region.pixelCount = expanded.size;
  console.log(region.id, expanded.size);
}
await sharp(mask, { raw: maskImage.info }).png({ compressionLevel: 9 }).toFile(path.join(artifacts, "regions-candidate.png"));
