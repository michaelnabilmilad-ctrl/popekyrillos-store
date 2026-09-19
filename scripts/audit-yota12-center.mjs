import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-12");
const reportDir = path.join(root, "artifacts", "yota-12-center-cross");
fs.mkdirSync(reportDir, { recursive: true });
const metadata = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const region = metadata.regions.find((item) => item.id === "region-26");
if (!region || region.geometryType !== "center-cross") throw new Error("Model 12 center cross must remain region-26");
const [base, mask, outline] = await Promise.all(["base.png", "regions.png", "outline.png"].map((file) =>
  sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
const { width, height } = base.info;
const color = region.maskColor;
const isRegion = (offset) => mask.data[offset] === color[0] && mask.data[offset + 1] === color[1] && mask.data[offset + 2] === color[2] && mask.data[offset + 3] > 0;
let regionPixels = 0, outlineInside = 0, transparentMaskInsideBounds = 0;
const solid = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  const offset = (y * width + x) * 4;
  if (isRegion(offset)) {
    regionPixels += 1;
    solid[offset] = 255; solid[offset + 3] = 255;
    if (outline.data[offset + 3] > 0) outlineInside += 1;
  }
  if (x >= region.bounds.x && x < region.bounds.x + region.bounds.width && y >= region.bounds.y && y < region.bounds.y + region.bounds.height && !mask.data[offset + 3]) transparentMaskInsideBounds += 1;
}
const crop = { left: region.bounds.x - 20, top: region.bounds.y - 20, width: region.bounds.width + 40, height: region.bounds.height + 40 };
const redLayer = await sharp(solid, { raw: { width, height, channels: 4 } }).extract(crop).png().toBuffer();
const baseCrop = await sharp(base.data, { raw: { width, height, channels: 4 } }).extract(crop).png().toBuffer();
const outlineCrop = await sharp(outline.data, { raw: { width, height, channels: 4 } }).extract(crop).png().toBuffer();
const compositeAfter = await sharp(baseCrop).composite([{ input: redLayer }, { input: outlineCrop }]).png().toBuffer();
await sharp({ create: { width: crop.width * 4, height: crop.height, channels: 4, background: "white" } }).composite([
  { input: baseCrop, left: 0, top: 0 }, { input: redLayer, left: crop.width, top: 0 },
  { input: outlineCrop, left: crop.width * 2, top: 0 }, { input: compositeAfter, left: crop.width * 3, top: 0 }
]).png().toFile(path.join(reportDir, "after.png"));
console.log(JSON.stringify({ regionId: region.id, regionPixels, outlineInside, transparentMaskInsideBounds, bounds: region.bounds }, null, 2));
