import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "coloring", "yota-12");
const plainPath = path.join(root, "assets/optimized/products/gallery/product-1-1212-20260706001137-05ea06.webp");
const coloredPath = path.join(root, "assets/optimized/products/gallery/product-1-12-20260706001132-8e3c59.webp");
fs.mkdirSync(outputDir, { recursive: true });
const [{ data: plain, info }, { data: colored }] = await Promise.all([
  sharp(plainPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(coloredPath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
]);
const { width, height, channels } = info, total = width * height;
const at = (x, y) => y * width + x;
const line = new Uint8Array(total);
for (let y = 560; y < 1260; y += 1) for (let x = 360; x < 1040; x += 1) {
  const p = at(x, y), o = p * channels, r = colored[o], g = colored[o + 1], b = colored[o + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 145 && max - min < 100) line[p] = 1;
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
  if (!touchesEdge && tail >= 120 && tail <= 120000) components.push(Array.from(queue.subarray(0, tail)));
}
const describe = (pixels) => {
  let sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  for (const p of pixels) { const x = p % width, y = Math.floor(p / width); sx += x; sy += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { pixels, centerX: sx / pixels.length, centerY: sy / pixels.length, minX, minY, maxX, maxY };
};
const detected = components.map(describe).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
if (detected.length !== 59) throw new Error(`Expected 59 enclosed components, found ${detected.length}`);

// Component 34 is exposed wood connected across the catalog watermark. It is
// the only detected component spanning the whole medallion and is intentionally
// non-colorable. The hanging hole is outside the decorated design scan.
let ordered = detected.filter((_, index) => index !== 33);
if (ordered.length !== 58) throw new Error(`Expected 58 colorable regions, found ${ordered.length}`);

const owner = new Int16Array(total).fill(-1);
ordered.forEach((component, index) => component.pixels.forEach((p) => { owner[p] = index; }));
// Recover antialiasing and pixels hidden by the catalog watermark. Expansion
// is bounded by the engraved-line barrier and only accepts an unambiguous owner.
for (let pass = 0; pass < 3; pass += 1) {
  const additions = [];
  for (let y = 665; y < 1218; y += 1) for (let x = 410; x < 992; x += 1) {
    const p = at(x, y); if (owner[p] >= 0 || barrier[p]) continue;
    const claims = new Set();
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { const claim = owner[p + dy * width + dx]; if (claim >= 0) claims.add(claim); }
    if (claims.size === 1) additions.push([p, [...claims][0]]);
  }
  additions.forEach(([p, index]) => { owner[p] = index; });
}
ordered.forEach((component, index) => {
  component.pixels = [];
  for (let p = 0; p < total; p += 1) if (owner[p] === index) component.pixels.push(p);
  Object.assign(component, describe(component.pixels));
});
// Every Model 12 motif is a solid shape (none has an intentional internal
// hole). Fill only complement components fully enclosed by the shape's own
// bounding box; exterior concavities remain untouched.
ordered.forEach((component, index) => {
  const minX = Math.max(0, component.minX - 1), minY = Math.max(0, component.minY - 1), maxX = Math.min(width - 1, component.maxX + 1), maxY = Math.min(height - 1, component.maxY + 1);
  const outside = new Uint8Array((maxX - minX + 1) * (maxY - minY + 1)), work = [];
  const local = (x, y) => (y - minY) * (maxX - minX + 1) + x - minX;
  const seedOutside = (x, y) => { const p = at(x, y), q = local(x, y); if (owner[p] !== index && !outside[q]) { outside[q] = 1; work.push(p); } };
  for (let x = minX; x <= maxX; x += 1) { seedOutside(x, minY); seedOutside(x, maxY); }
  for (let y = minY; y <= maxY; y += 1) { seedOutside(minX, y); seedOutside(maxX, y); }
  for (let head = 0; head < work.length; head += 1) {
    const p = work[head], x = p % width, y = Math.floor(p / width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const n = at(nx, ny), q = local(nx, ny); if (owner[n] === index || outside[q]) continue;
      outside[q] = 1; work.push(n);
    }
  }
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const p = at(x, y); if (owner[p] < 0 && !outside[local(x, y)]) owner[p] = index;
  }
});
ordered.forEach((component, index) => {
  component.pixels = [];
  for (let p = 0; p < total; p += 1) if (owner[p] === index) component.pixels.push(p);
  Object.assign(component, describe(component.pixels));
});

const singletonIds = new Set(ordered.map((component, index) => component.pixels.length > 3500 ? index + 1 : null).filter(Boolean));
if (singletonIds.size !== 2) throw new Error(`Expected center cross and inner frame as two singletons, found ${singletonIds.size}`);
const singletonGeometry = [...singletonIds].sort((a, b) => ordered[b - 1].pixels.length - ordered[a - 1].pixels.length);
const outerFrameId = singletonGeometry[0], centerCrossId = singletonGeometry[1];

// The diagonal catalog watermark removes interior pixels from the center-cross
// source and lets the enclosing frame claim them. Reconstruct this four-way
// symmetric cross from the union of its own 90-degree rotations. This changes
// only pixels inside the original cross bounds and preserves its real outline.
const centerIndex = centerCrossId - 1, centerCross = ordered[centerIndex];
const crossCenterX = Math.round((centerCross.minX + centerCross.maxX) / 2);
const crossCenterY = Math.round((centerCross.minY + centerCross.maxY) / 2);
const symmetricCrossPixels = new Set(centerCross.pixels);
for (const p of centerCross.pixels) {
  let x = p % width, y = Math.floor(p / width);
  for (let turn = 0; turn < 3; turn += 1) {
    const nextX = crossCenterX - (y - crossCenterY), nextY = crossCenterY + (x - crossCenterX);
    x = nextX; y = nextY;
    if (x >= centerCross.minX && x <= centerCross.maxX && y >= centerCross.minY && y <= centerCross.maxY) symmetricCrossPixels.add(at(x, y));
  }
}
for (let y = 886; y <= 994; y += 1) for (let x = 683; x <= 715; x += 1) symmetricCrossPixels.add(at(x, y));
for (let y = 925; y <= 954; y += 1) for (let x = 643; x <= 755; x += 1) symmetricCrossPixels.add(at(x, y));
for (const p of symmetricCrossPixels) owner[p] = centerIndex;
ordered.forEach((component, index) => {
  component.pixels = [];
  for (let p = 0; p < total; p += 1) if (owner[p] === index) component.pixels.push(p);
  Object.assign(component, describe(component.pixels));
});
const center = { x: 700, y: 941 };
const unused = new Set(ordered.map((_, index) => index + 1).filter((id) => !singletonIds.has(id)));
const rotationalGroups = [];
while (unused.size) {
  const seed = [...unused][0], group = [seed]; unused.delete(seed);
  const origin = ordered[seed - 1];
  for (let turn = 1; turn <= 3; turn += 1) {
    const angle = turn * Math.PI / 2, dx = origin.centerX - center.x, dy = origin.centerY - center.y;
    const targetX = center.x + dx * Math.cos(angle) - dy * Math.sin(angle), targetY = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
    const candidates = [...unused].map((id) => { const c = ordered[id - 1]; return { id, distance: Math.hypot(c.centerX - targetX, c.centerY - targetY), ratio: Math.max(c.pixels.length, origin.pixels.length) / Math.min(c.pixels.length, origin.pixels.length) }; }).filter((c) => c.ratio < 3).sort((a, b) => a.distance - b.distance);
    if (!candidates.length || candidates[0].distance > 50) throw new Error(`No rotational match for ${group.join(",")}`);
    group.push(candidates[0].id); unused.delete(candidates[0].id);
  }
  rotationalGroups.push(group);
}
if (rotationalGroups.length !== 14 || rotationalGroups.some((group) => group.length !== 4)) throw new Error("Invalid Model 12 rotational grouping");

const regionId = (n) => `region-${n}`;
const groups = Object.fromEntries(rotationalGroups.map((numbers, index) => [`rotational-shape-${String(index + 1).padStart(2, "0")}`, numbers.map(regionId)]));
const groupByRegion = new Map(Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => [id, group])));
const maskColor = (index) => [index + 1, Math.floor((index + 1) / 256), ((index + 1) * 73) % 255 || 1];
const mask = Buffer.alloc(total * 4), outline = Buffer.alloc(total * 4);
ordered.forEach((component, index) => component.pixels.forEach((p) => { const o = p * 4, c = maskColor(index); mask[o] = c[0]; mask[o + 1] = c[1]; mask[o + 2] = c[2]; mask[o + 3] = 255; }));
for (let y = 665; y < 1218; y += 1) for (let x = 410; x < 992; x += 1) { const p = at(x, y); if (!line[p] || owner[p] === centerIndex) continue; const s = p * channels, t = p * 4; outline[t] = colored[s]; outline[t + 1] = colored[s + 1]; outline[t + 2] = colored[s + 2]; outline[t + 3] = 255; }
const regions = ordered.map((component, index) => {
  const number = index + 1, id = regionId(number), geometryType = number === outerFrameId ? "outer-stepped-frame" : number === centerCrossId ? "center-cross" : groupByRegion.get(id);
  return { id, regionId: id, maskColor: maskColor(index), pixelCount: component.pixels.length, centerX: Math.round(component.centerX), centerY: Math.round(component.centerY), bounds: { x: component.minX, y: component.minY, width: component.maxX - component.minX + 1, height: component.maxY - component.minY + 1 }, sampleX: Math.round(component.centerX), sampleY: Math.round(component.centerY), regionKind: "decorative", logicalRegionId: id, shapeGroup: groupByRegion.get(id) || null, geometryType, enabled: true, label: geometryType };
});
const logicalShapes = Object.fromEntries(regions.map((region) => [region.id, [region.id]]));
const overrides = { modelId: "yota-12", modelVersion: "yota-12-v2", regions: Object.fromEntries(regions.map((region) => [region.id, { logicalRegionId: region.id, similarShapeGroup: region.shapeGroup, geometryType: region.geometryType, regionKind: "decorative" }])), logicalShapes, similarShapeGroups: groups, groups };
const document = { modelId: "yota-12", modelName: "ميدالية يوتا 12", modelVersion: "yota-12-v2", paintMode: "replace-source-color", totalRegions: regions.length, regions, shapeGroups: Object.entries(groups).map(([id, ids]) => ({ id, regions: ids })) };
await Promise.all([sharp(plainPath).png().toFile(path.join(outputDir, "base.png")), sharp(mask, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outputDir, "regions.png")), sharp(outline, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outputDir, "outline.png"))]);
fs.writeFileSync(path.join(outputDir, "regions.json"), `${JSON.stringify(document, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "region-overrides.json"), `${JSON.stringify(overrides, null, 2)}\n`);
const overlay = Buffer.alloc(total * 4);
ordered.forEach((component, index) => component.pixels.forEach((p) => { const o = p * 4; overlay[o] = (index * 83 + 40) % 255; overlay[o + 1] = (index * 137 + 70) % 255; overlay[o + 2] = (index * 59 + 110) % 255; overlay[o + 3] = 185; }));
const labels = ordered.map((c, i) => `<text x="${c.centerX.toFixed(0)}" y="${c.centerY.toFixed(0)}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${i + 1}</text>`).join("");
await sharp(plainPath).composite([{ input: overlay, raw: { width, height, channels: 4 } }, { input: outline, raw: { width, height, channels: 4 } }, { input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`) }]).png().toFile(path.join(outputDir, "regions-debug.png"));
fs.copyFileSync(plainPath, path.join(outputDir, "plain-gallery-source.webp"));
fs.copyFileSync(coloredPath, path.join(outputDir, "colored-gallery-reference.webp"));
console.log(JSON.stringify({ totalRegions: regions.length, centerCrossId, outerFrameId, similarShapeGroups: groups }, null, 2));
