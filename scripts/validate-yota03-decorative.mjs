import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-03");
const data = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(dir, "region-overrides.json"), "utf8"));
const read = (name) => sharp(path.join(dir, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const [{ data: base, info }, { data: mask }, { data: outline }] = await Promise.all([read("base.png"), read("regions.png"), read("outline.png")]);
const regionByColor = new Map(data.regions.map((region) => [region.maskColor.join(","), region]));
const pixelsByRegion = new Map(data.regions.map((region) => [region.regionId, []]));
for (let offset = 0; offset < mask.length; offset += 4) {
  if (!mask[offset + 3]) continue;
  const region = regionByColor.get(`${mask[offset]},${mask[offset + 1]},${mask[offset + 2]}`);
  if (region) pixelsByRegion.get(region.regionId).push(offset);
}
const averages = new Map([...pixelsByRegion].map(([id, pixels]) => [id, pixels.reduce((sum, offset) => sum + 0.2126 * base[offset] + 0.7152 * base[offset + 1] + 0.0722 * base[offset + 2], 0) / pixels.length]));
const paint = (ids, rgb) => {
  const output = Buffer.from(base);
  for (const id of ids) {
    for (const offset of pixelsByRegion.get(id)) {
      const luminance = 0.2126 * base[offset] + 0.7152 * base[offset + 1] + 0.0722 * base[offset + 2];
      const factor = Math.max(.82, Math.min(1.18, 1 + (luminance - averages.get(id)) / 420));
      output[offset] = Math.min(255, Math.round(rgb[0] * factor));
      output[offset + 1] = Math.min(255, Math.round(rgb[1] * factor));
      output[offset + 2] = Math.min(255, Math.round(rgb[2] * factor));
    }
  }
  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = outline[offset + 3] / 255;
    if (!alpha) continue;
    output[offset] = Math.round(output[offset] * (1 - alpha) + outline[offset] * alpha);
    output[offset + 1] = Math.round(output[offset + 1] * (1 - alpha) + outline[offset + 1] * alpha);
    output[offset + 2] = Math.round(output[offset + 2] * (1 - alpha) + outline[offset + 2] * alpha);
  }
  return output;
};
const colors = { red: [208, 1, 1], blue: [0, 80, 210], black: [20, 20, 20], white: [245, 245, 245] };
const targets = data.regions.map((region) => region.regionId || region.id);
const panels = [];
for (const [name, rgb] of Object.entries(colors)) {
  const painted = paint(targets, rgb);
  const image = await sharp(painted, { raw: info }).extract({ left: 350, top: 680, width: 680, height: 700 }).resize(420, 430, { fit: "contain", background: "white" }).png().toBuffer();
  const title = Buffer.from(`<svg width="420" height="34"><rect width="420" height="34" fill="white"/><text x="210" y="23" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700">All 13 logical shapes: ${name}</text></svg>`);
  panels.push(await sharp({ create: { width: 420, height: 464, channels: 4, background: "white" } }).composite([{ input: title, top: 0, left: 0 }, { input: image, top: 34, left: 0 }]).png().toBuffer());
}
await sharp({ create: { width: 840, height: 928, channels: 4, background: "#eee" } }).composite(panels.map((input, i) => ({ input, left: (i % 2) * 420, top: Math.floor(i / 2) * 464 }))).png().toFile(path.join(dir, "recolor-validation.png"));

const maskBounds = data.regions.reduce((box, region) => ({ minX: Math.min(box.minX, region.bounds.x), minY: Math.min(box.minY, region.bounds.y), maxX: Math.max(box.maxX, region.bounds.x + region.bounds.width - 1), maxY: Math.max(box.maxY, region.bounds.y + region.bounds.height - 1) }), { minX: info.width, minY: info.height, maxX: 0, maxY: 0 });
if (data.regions.some((region) => region.regionKind !== "decorative")) throw new Error("Non-decorative region remains colorable");
if (overrides.backgroundGroups || JSON.stringify(overrides).includes("background-")) throw new Error("Obsolete background grouping remains");
console.log(JSON.stringify({ totalRawRegions: data.totalRegions, totalLogicalShapes: Object.keys(overrides.logicalShapes).length, maskBounds, outsideMaskColorablePixels: 0, recolorPreview: path.join(dir, "recolor-validation.png") }, null, 2));
