import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "coloring", "yota-10");
const plainPath = path.join(root, "assets", "optimized", "products", "gallery", "product-1-1010-20260706000934-a00e6c.webp");
const coloredPath = path.join(root, "assets", "optimized", "products", "gallery", "product-1-10-20260706000929-216758.webp");
fs.mkdirSync(outputDir, { recursive: true });

const [{ data: plain, info }, { data: colored }] = await Promise.all([
  sharp(plainPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(coloredPath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
]);
const { width, height, channels } = info;
const total = width * height;
const at = (x, y) => y * width + x;
const line = new Uint8Array(total);
const brown = new Uint8Array(total);
const dark = new Uint8Array(total);
for (let y = 500; y < 1320; y += 1) for (let x = 340; x < 1060; x += 1) {
  const p = at(x, y), o = p * channels;
  const r = plain[o], g = plain[o + 1], b = plain[o + 2];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance < 125 && r - b > 8 && r - g > 2) brown[p] = 1;
  if (luminance < 80) dark[p] = 1;
}
for (let y = 501; y < 1319; y += 1) for (let x = 341; x < 1059; x += 1) {
  const p = at(x, y);
  let nearBrown = false;
  for (let dy = -1; dy <= 1 && !nearBrown; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (brown[p + dy * width + dx]) { nearBrown = true; break; }
  if (brown[p] || (dark[p] && nearBrown)) line[p] = 1;
}
const barrier = line.slice();
for (let y = 502; y < 1318; y += 1) for (let x = 342; x < 1058; x += 1) {
  const p = at(x, y); if (!line[p]) continue;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) barrier[p + dy * width + dx] = 1;
}

const seen = new Uint8Array(total);
const queue = new Int32Array(total);
const components = [];
for (let y = 520; y < 1300; y += 1) for (let x = 360; x < 1040; x += 1) {
  const seed = at(x, y); if (seen[seed] || barrier[seed]) continue;
  let head = 0, tail = 0, touchesEdge = false;
  queue[tail++] = seed; seen[seed] = 1;
  while (head < tail) {
    const p = queue[head++], px = p % width, py = Math.floor(p / width);
    if (px <= 361 || px >= 1038 || py <= 521 || py >= 1298) touchesEdge = true;
    for (const n of [p - 1, p + 1, p - width, p + width]) {
      const nx = n % width, ny = Math.floor(n / width);
      if (n < 0 || n >= total || nx < 360 || nx >= 1040 || ny < 520 || ny >= 1300 || Math.abs(nx - px) > 1 || seen[n] || barrier[n]) continue;
      seen[n] = 1; queue[tail++] = n;
    }
  }
  if (!touchesEdge && tail >= 180 && tail <= 90000) components.push(Array.from(queue.subarray(0, tail)));
}
const describe = (pixels) => {
  let sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  for (const p of pixels) { const x = p % width, y = Math.floor(p / width); sx += x; sy += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { pixels, centerX: sx / pixels.length, centerY: sy / pixels.length, minX, minY, maxX, maxY };
};
const ordered = components.map(describe).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
const singles = new Set([27, 31, 33]);
// Region order is stable under the new base-derived segmentation. Preserve the
// existing logical color groups instead of re-inferring them from a distorted
// photograph of the colored product.
const rotationalGroups = [
  [1, 28, 59, 32], [2, 29, 58, 30], [3, 24, 57, 36], [4, 34, 56, 26],
  [5, 35, 55, 25], [6, 23, 54, 37], [7, 40, 53, 20], [8, 19, 52, 41],
  [9, 42, 51, 18], [10, 17, 50, 43], [11, 46, 49, 14], [12, 13, 48, 47],
  [15, 38, 45, 22], [16, 21, 44, 39]
];
if (ordered.length !== 59 || rotationalGroups.length !== 14 || rotationalGroups.some((group) => group.length !== 4)) {
  throw new Error(`Invalid Model 10 segmentation: ${ordered.length} regions / ${rotationalGroups.length} groups`);
}

// Claim only unambiguous engraved-edge pixels so the fills meet the outline
// while remaining disjoint.
const owner = new Int16Array(total).fill(-1);
ordered.forEach((component, index) => component.pixels.forEach((p) => { owner[p] = index; }));
for (let pass = 0; pass < 2; pass += 1) {
  const additions = [];
  for (let y = 650; y < 1230; y += 1) for (let x = 410; x < 995; x += 1) {
    const p = at(x, y); if (owner[p] >= 0 || line[p]) continue;
    const claims = new Set();
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = owner[p + dy * width + dx]; if (candidate >= 0) claims.add(candidate);
    }
    if (claims.size === 1) additions.push([p, [...claims][0]]);
  }
  additions.forEach(([p, index]) => { owner[p] = index; });
}
ordered.forEach((component, index) => {
  component.pixels = [];
  for (let p = 0; p < total; p += 1) if (owner[p] === index) component.pixels.push(p);
  Object.assign(component, describe(component.pixels));
});

const regionId = (number) => `region-${number}`;
const groups = Object.fromEntries(rotationalGroups.map((numbers, index) => [
  `rotational-shape-${String(index + 1).padStart(2, "0")}`,
  numbers.map(regionId)
]));
const groupByRegion = new Map(Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => [id, group])));
const maskColor = (index) => [index + 1, Math.floor((index + 1) / 256), ((index + 1) * 73) % 255 || 1];
const mask = Buffer.alloc(total * 4);
const outline = Buffer.alloc(total * 4);
ordered.forEach((component, index) => component.pixels.forEach((p) => {
  const o = p * 4, color = maskColor(index);
  mask[o] = color[0]; mask[o + 1] = color[1]; mask[o + 2] = color[2]; mask[o + 3] = 255;
}));
for (let y = 645; y < 1230; y += 1) for (let x = 405; x < 995; x += 1) {
  const p = at(x, y); if (!line[p]) continue;
  const source = p * channels, target = p * 4;
  outline[target] = plain[source]; outline[target + 1] = plain[source + 1]; outline[target + 2] = plain[source + 2]; outline[target + 3] = 255;
}

const singletonGeometry = new Map([[27, "center-cross"], [31, "cross-surround"], [33, "outer-stepped-band"]]);
const regions = ordered.map((component, index) => {
  const number = index + 1, id = regionId(number), geometryType = singletonGeometry.get(number) || groupByRegion.get(id);
  return {
    id, regionId: id, maskColor: maskColor(index), pixelCount: component.pixels.length,
    centerX: Math.round(component.centerX), centerY: Math.round(component.centerY),
    bounds: { x: component.minX, y: component.minY, width: component.maxX - component.minX + 1, height: component.maxY - component.minY + 1 },
    sampleX: Math.round(component.centerX), sampleY: Math.round(component.centerY),
    regionKind: "decorative", logicalRegionId: id, shapeGroup: groupByRegion.get(id) || null,
    geometryType, enabled: true, label: geometryType
  };
});
const logicalShapes = Object.fromEntries(regions.map((region) => [region.id, [region.id]]));
const overrides = {
  modelId: "yota-10", modelVersion: "yota-10-v2",
  regions: Object.fromEntries(regions.map((region) => [region.id, {
    logicalRegionId: region.id, similarShapeGroup: region.shapeGroup,
    geometryType: region.geometryType, regionKind: "decorative"
  }])),
  logicalShapes, similarShapeGroups: groups, groups
};
const regionsDocument = {
  modelId: "yota-10", modelName: "ميدالية يوتا 10", modelVersion: "yota-10-v2",
  paintMode: "replace-source-color", totalRegions: regions.length, regions,
  shapeGroups: Object.entries(groups).map(([id, ids]) => ({ id, regions: ids }))
};

await Promise.all([
  sharp(plainPath).png().toFile(path.join(outputDir, "base.png")),
  sharp(mask, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outputDir, "regions.png")),
  sharp(outline, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outputDir, "outline.png"))
]);
fs.writeFileSync(path.join(outputDir, "regions.json"), `${JSON.stringify(regionsDocument, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "region-overrides.json"), `${JSON.stringify(overrides, null, 2)}\n`);

const overlay = Buffer.alloc(total * 4);
ordered.forEach((component, index) => {
  const color = [(index * 83 + 40) % 255, (index * 137 + 70) % 255, (index * 59 + 110) % 255];
  component.pixels.forEach((p) => { const o = p * 4; overlay[o] = color[0]; overlay[o + 1] = color[1]; overlay[o + 2] = color[2]; overlay[o + 3] = 185; });
});
const labels = ordered.map((c, i) => `<text x="${c.centerX.toFixed(0)}" y="${c.centerY.toFixed(0)}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${i + 1}</text>`).join("");
await sharp(plainPath).composite([
  { input: overlay, raw: { width, height, channels: 4 } },
  { input: outline, raw: { width, height, channels: 4 } },
  { input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`) }
]).png().toFile(path.join(outputDir, "regions-debug.png"));
fs.copyFileSync(plainPath, path.join(outputDir, "plain-gallery-source.webp"));
fs.copyFileSync(coloredPath, path.join(outputDir, "colored-gallery-reference.webp"));
const auditPath = path.join(outputDir, "component-audit.png");
if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);
console.log(JSON.stringify({ totalRegions: regions.length, similarShapeGroups: groups }, null, 2));
