import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "coloring", "yota-11");
const plainPath = path.join(root, "assets", "optimized", "products", "gallery", "product-1-1111-20260706001045-b19fff.webp");
const coloredPath = path.join(root, "assets", "optimized", "products", "gallery", "product-1-111-20260706001040-551702.webp");
fs.mkdirSync(outputDir, { recursive: true });

const [{ data: plain, info }, { data: colored }] = await Promise.all([
  sharp(plainPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(coloredPath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
]);
const { width, height, channels } = info, total = width * height;
const at = (x, y) => y * width + x;
const line = new Uint8Array(total);
const brown = new Uint8Array(total);
const dark = new Uint8Array(total);
for (let y = 560; y < 1260; y += 1) for (let x = 360; x < 1040; x += 1) {
  const p = at(x, y), o = p * channels;
  const r = plain[o], g = plain[o + 1], b = plain[o + 2];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance < 137 && r - b > 8 && r - g > 2) brown[p] = 1;
  if (luminance < 80) dark[p] = 1;
}
for (let y = 561; y < 1259; y += 1) for (let x = 361; x < 1039; x += 1) {
  const p = at(x, y);
  let nearBrown = false;
  for (let dy = -1; dy <= 1 && !nearBrown; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (brown[p + dy * width + dx]) { nearBrown = true; break; }
  if (brown[p]) line[p] = 1;
}
const barrier = line.slice();
for (let y = 562; y < 1258; y += 1) for (let x = 362; x < 1038; x += 1) {
  const p = at(x, y); if (!line[p]) continue;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) barrier[p + dy * width + dx] = 1;
}
const seen = new Uint8Array(total), queue = new Int32Array(total), components = [];
for (let y = 570; y < 1250; y += 1) for (let x = 370; x < 1030; x += 1) {
  const seed = at(x, y); if (seen[seed] || barrier[seed]) continue;
  let head = 0, tail = 0, touchesEdge = false; queue[tail++] = seed; seen[seed] = 1;
  while (head < tail) {
    const p = queue[head++], px = p % width, py = Math.floor(p / width);
    if (px <= 371 || px >= 1028 || py <= 571 || py >= 1248) touchesEdge = true;
    for (const n of [p - 1, p + 1, p - width, p + width]) {
      const nx = n % width, ny = Math.floor(n / width);
      if (n < 0 || n >= total || nx < 370 || nx >= 1030 || ny < 570 || ny >= 1250 || Math.abs(nx - px) > 1 || seen[n] || barrier[n]) continue;
      seen[n] = 1; queue[tail++] = n;
    }
  }
  if (!touchesEdge && tail >= 160 && tail <= 100000) components.push(Array.from(queue.subarray(0, tail)));
}
const describe = (pixels) => {
  let sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  for (const p of pixels) { const x = p % width, y = Math.floor(p / width); sx += x; sy += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { pixels, centerX: sx / pixels.length, centerY: sy / pixels.length, minX, minY, maxX, maxY };
};
const detected = components.map(describe).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
if (detected.length !== 40) throw new Error(`Expected 40 enclosed components including the hanging hole, found ${detected.length}`);
// The diagonal watermark crosses the top decoration and splits one engraved
// region into three flood-fill fragments. Rejoin those fragments using their
// shared topology; every contour still comes from the current plain base.
const mergedTopComponent = describe([...detected[0].pixels, ...detected[1].pixels, ...detected[2].pixels]);
const mergedLeftComponent = describe([...detected[17].pixels, ...detected[18].pixels]);
const centralSymmetry = { twiceX: 1393, twiceY: 1917 };
const mirroredSquareComponent = describe(detected[25].pixels.map((p) => {
  const x = p % width, y = Math.floor(p / width);
  return at(centralSymmetry.twiceX - x, centralSymmetry.twiceY - y);
}));
const centerCrossComponent = detected[19];
let ordered = detected.filter((_, index) => ![0, 1, 2, 17, 18].includes(index));
ordered.push(mergedTopComponent, mergedLeftComponent, mirroredSquareComponent);
ordered.sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
if (ordered.length !== 38) throw new Error(`Expected 38 colorable regions, found ${ordered.length}`);
const centerCrossIndex = ordered.indexOf(centerCrossComponent);

const owner = new Int16Array(total).fill(-1);
ordered.forEach((component, index) => component.pixels.forEach((p) => { owner[p] = index; }));
const mirroredSquareIndex = ordered.indexOf(mirroredSquareComponent);
mirroredSquareComponent.pixels.forEach((p) => { owner[p] = mirroredSquareIndex; });
for (let pass = 0; pass < 3; pass += 1) {
  const additions = [];
  for (let y = 695; y < 1210; y += 1) for (let x = 440; x < 960; x += 1) {
    const p = at(x, y); if (owner[p] >= 0 || line[p]) continue;
    const claims = new Set();
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = owner[p + dy * width + dx]; if (candidate >= 0) claims.add(candidate);
    }
    if (claims.size === 1) additions.push([p, [...claims][0]]);
  }
  additions.forEach(([p, index]) => { owner[p] = index; });
}

const islandAllowed = new Set([ordered.indexOf(mergedTopComponent), ordered.indexOf(mergedLeftComponent)]);
for (let index = 0; index < ordered.length; index += 1) {
  if (islandAllowed.has(index)) continue;
  const visited = new Set(), islands = [];
  for (let p = 0; p < total; p += 1) {
    if (owner[p] !== index || visited.has(p)) continue;
    let head = 0, tail = 0; queue[tail++] = p; visited.add(p);
    while (head < tail) {
      const current = queue[head++], x = current % width;
      for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
        if (neighbor < 0 || neighbor >= total || (neighbor === current - 1 && x === 0) || (neighbor === current + 1 && x === width - 1)) continue;
        if (owner[neighbor] === index && !visited.has(neighbor)) { visited.add(neighbor); queue[tail++] = neighbor; }
      }
    }
    islands.push(Array.from(queue.subarray(0, tail)));
  }
  islands.sort((a, b) => b.length - a.length).slice(1).flat().forEach((p) => { owner[p] = -1; });
}

ordered.forEach((component, index) => {
  component.pixels = [];
  for (let p = 0; p < total; p += 1) if (owner[p] === index) component.pixels.push(p);
  Object.assign(component, describe(component.pixels));
});

const singletonIds = new Set(ordered.map((component, index) => component.pixels.length > 20000 ? index + 1 : null).filter(Boolean));
if (singletonIds.size !== 2) throw new Error(`Expected central cross and outer band as two singletons, found ${singletonIds.size}`);
const rotationalGroups = [
  [1, 19, 38, 21], [2, 20, 37, 17], [3, 14, 36, 23],
  [4, 26, 35, 13], [5, 12, 34, 27], [6, 28, 33, 11],
  [7, 10, 32, 29], [8, 30, 31, 9], [15, 16, 25, 24]
];
if (rotationalGroups.length !== 9 || rotationalGroups.some((group) => group.length !== 4)) throw new Error("Invalid Model 11 rotational grouping");

const regionId = (number) => `region-${number}`;
const groups = Object.fromEntries(rotationalGroups.map((numbers, index) => [`rotational-shape-${String(index + 1).padStart(2, "0")}`, numbers.map(regionId)]));
const groupByRegion = new Map(Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => [id, group])));
const maskColor = (index) => [index + 1, Math.floor((index + 1) / 256), ((index + 1) * 73) % 255 || 1];
const mask = Buffer.alloc(total * 4), outline = Buffer.alloc(total * 4);
ordered.forEach((component, index) => component.pixels.forEach((p) => {
  const o = p * 4, color = maskColor(index); mask[o] = color[0]; mask[o + 1] = color[1]; mask[o + 2] = color[2]; mask[o + 3] = 255;
}));
for (let y = 695; y < 1210; y += 1) for (let x = 440; x < 960; x += 1) {
  const p = at(x, y);
  if (!line[p]) continue;
  const source = p * channels, target = p * 4;
  outline[target] = plain[source]; outline[target + 1] = plain[source + 1]; outline[target + 2] = plain[source + 2]; outline[target + 3] = 255;
}
const centerCrossId = centerCrossIndex + 1;
const outerBandId = [...singletonIds].find((id) => id !== centerCrossId);
const regions = ordered.map((component, index) => {
  const number = index + 1, id = regionId(number);
  const geometryType = number === outerBandId ? "outer-stepped-band" : number === centerCrossId ? "center-cross" : groupByRegion.get(id);
  return { id, regionId: id, maskColor: maskColor(index), pixelCount: component.pixels.length,
    centerX: Math.round(component.centerX), centerY: Math.round(component.centerY),
    bounds: { x: component.minX, y: component.minY, width: component.maxX - component.minX + 1, height: component.maxY - component.minY + 1 },
    sampleX: Math.round(component.centerX), sampleY: Math.round(component.centerY), regionKind: "decorative",
    logicalRegionId: id, shapeGroup: groupByRegion.get(id) || null, geometryType, enabled: true, label: geometryType };
});
const logicalShapes = Object.fromEntries(regions.map((region) => [region.id, [region.id]]));
const overrides = { modelId: "yota-11", modelVersion: "yota-11-v5",
  regions: Object.fromEntries(regions.map((region) => [region.id, { logicalRegionId: region.id, similarShapeGroup: region.shapeGroup, geometryType: region.geometryType, regionKind: "decorative" }])),
  logicalShapes, similarShapeGroups: groups, groups };
const regionsDocument = { modelId: "yota-11", modelName: "ميدالية يوتا 11", modelVersion: "yota-11-v5", paintMode: "replace-source-color",
  totalRegions: regions.length, regions, shapeGroups: Object.entries(groups).map(([id, ids]) => ({ id, regions: ids })) };

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
const labels = ordered.map((c, i) => `<text x="${c.centerX.toFixed(0)}" y="${c.centerY.toFixed(0)}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${i + 1}</text>`).join("");
await sharp(plainPath).composite([{ input: overlay, raw: { width, height, channels: 4 } }, { input: outline, raw: { width, height, channels: 4 } }, { input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`) }]).png().toFile(path.join(outputDir, "regions-debug.png"));
fs.copyFileSync(plainPath, path.join(outputDir, "plain-gallery-source.webp"));
fs.copyFileSync(coloredPath, path.join(outputDir, "colored-gallery-reference.webp"));
const auditPath = path.join(outputDir, "component-audit.png"); if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);
console.log(JSON.stringify({ totalRegions: regions.length, centerCrossId, outerBandId, similarShapeGroups: groups }, null, 2));
