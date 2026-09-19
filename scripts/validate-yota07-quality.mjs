import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const artifacts = path.join(root, "artifacts", "yota-07-color-quality");
const baseImage = await sharp(path.join(dir, "base.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

async function render(maskPath, outlinePath, opacity, output) {
  const mask = (await sharp(maskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const paint = Buffer.alloc(mask.length);
  for (let p = 0; p < mask.length / 4; p++) if (mask[p * 4 + 3]) {
    const o = p * 4; paint[o] = 128; paint[o + 1] = 0; paint[o + 2] = 32; paint[o + 3] = Math.round(255 * opacity);
  }
  await sharp(baseImage.data, { raw: baseImage.info }).composite([
    { input: paint, raw: baseImage.info, blend: "multiply" },
    { input: outlinePath }
  ]).png().toFile(output);
}

const before = path.join(artifacts, "full-before.png"), after = path.join(artifacts, "full-after.png");
await render(path.join(artifacts, "regions-before.png"), path.join(artifacts, "outline-before.png"), .72, before);
await render(path.join(dir,"regions.png"),path.join(dir,"outline.png"),.9,after);
for (const [name, crop] of Object.entries({
  "outer-cross": { left: 530, top: 595, width: 176, height: 176 },
  "central-ornament": { left: 510, top: 765, width: 216, height: 205 }
})) {
  await sharp(before).extract(crop).resize({ width: crop.width * 3, kernel: "nearest" }).png().toFile(path.join(artifacts, `${name}-before.png`));
  await sharp(after).extract(crop).resize({ width: crop.width * 3, kernel: "nearest" }).png().toFile(path.join(artifacts, `${name}-after.png`));
}
console.log(artifacts);
