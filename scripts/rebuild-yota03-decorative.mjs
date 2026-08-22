import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "coloring", "yota-03");
const basePath = path.join(directory, "base.png");
const oldMaskPath = path.join(directory, "regions.png");
const oldRegionsPath = path.join(directory, "regions.json");
const outlinePath = path.join(directory, "outline.png");

const oldRegions = JSON.parse(fs.readFileSync(oldRegionsPath, "utf8"));
const [{ data: base, info }, { data: oldMask }, { data: outline }] = await Promise.all([
  sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(oldMaskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(outlinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
]);
const { width, height } = info;
const totalPixels = width * height;
const indexOf = (x, y) => y * width + x;

// These are the twelve real, already-detected decorative fills. Regions 2,
// 13, 15 and 16 were tiny watermark fragments; 17-24 were wooden body zones.
const retainedIds = new Set([
  "region-1", "region-3", "region-4", "region-5", "region-6", "region-7",
  "region-8", "region-9", "region-10", "region-11", "region-12", "region-14"
]);
const oldRegionByColor = new Map(oldRegions.regions.map((region) => [region.maskColor.join(","), region]));
const components = [];
for (const region of oldRegions.regions) {
  if (!retainedIds.has(region.regionId)) continue;
  const pixels = [];
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const offset = pixel * 4;
    if (oldMask[offset + 3] && oldRegionByColor.get(`${oldMask[offset]},${oldMask[offset + 1]},${oldMask[offset + 2]}`)?.regionId === region.regionId) {
      pixels.push(pixel);
    }
  }
  components.push({ pixels, sourceFamily: region.geometryType?.split("-")[0] || "decorative" });
}

// Extract the central yellow cross from the CURRENT artwork color itself.
// The bounds only reject unrelated photograph/watermark pixels; every output
// pixel must still satisfy the real yellow-fill color test.
const yellowCandidate = new Uint8Array(totalPixels);
for (let y = 890; y <= 1140; y += 1) {
  for (let x = 570; x <= 805; x += 1) {
    const pixel = indexOf(x, y);
    const offset = pixel * 4;
    const r = base[offset];
    const g = base[offset + 1];
    const b = base[offset + 2];
    if (r > 135 && g > 70 && b < 45 && r - g > 45 && g - b > 50) yellowCandidate[pixel] = 1;
  }
}
const visited = new Uint8Array(totalPixels);
const queue = new Int32Array(totalPixels);
let largestYellow = [];
for (let seed = 0; seed < totalPixels; seed += 1) {
  if (!yellowCandidate[seed] || visited[seed]) continue;
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  visited[seed] = 1;
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    for (const neighbor of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
      if (neighbor < 0 || neighbor >= totalPixels || visited[neighbor] || !yellowCandidate[neighbor]) continue;
      if (Math.abs((neighbor % width) - x) > 1) continue;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }
  if (tail > largestYellow.length) largestYellow = Array.from(queue.subarray(0, tail));
}
if (largestYellow.length < 8000) throw new Error(`Central yellow cross extraction is incomplete: ${largestYellow.length} pixels`);
components.push({ pixels: largestYellow, sourceFamily: "yellow" });

const describe = (component) => {
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (const pixel of component.pixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { ...component, centerX: sumX / component.pixels.length, centerY: sumY / component.pixels.length, minX, minY, maxX, maxY };
};
const ordered = components.map(describe).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
const mask = Buffer.alloc(totalPixels * 4);
const regions = ordered.map((component, index) => {
  const numericId = index + 1;
  const regionId = `region-${numericId}`;
  const maskColor = [numericId & 255, (numericId >> 8) & 255, (numericId * 73) % 255 || 1];
  for (const pixel of component.pixels) {
    const offset = pixel * 4;
    mask[offset] = maskColor[0];
    mask[offset + 1] = maskColor[1];
    mask[offset + 2] = maskColor[2];
    mask[offset + 3] = 255;
  }
  const centerX = Math.round(component.centerX);
  const centerY = Math.round(component.centerY);
  return {
    id: regionId, regionId, maskColor, pixelCount: component.pixels.length,
    centerX, centerY,
    bounds: { x: component.minX, y: component.minY, width: component.maxX - component.minX + 1, height: component.maxY - component.minY + 1 },
    sampleX: centerX, sampleY: centerY,
    regionKind: "decorative", logicalRegionId: regionId, shapeGroup: null,
    geometryType: component.sourceFamily, enabled: true, label: `منطقة زخرفية ${numericId}`
  };
});

const byFamily = (family) => regions.filter((region) => region.geometryType === family).map((region) => region.regionId);
const red = byFamily("red");
const cyan = byFamily("cyan");
const white = byFamily("white");
const yellow = byFamily("yellow");
if (red.length !== 4 || cyan.length !== 4 || white.length !== 4 || yellow.length !== 1) {
  throw new Error(`Unexpected decorative families: red=${red.length}, cyan=${cyan.length}, white=${white.length}, yellow=${yellow.length}`);
}
const groups = { "outer-crosses": red, "small-cyan-crosses": cyan, "center-white-details": white };
const logicalShapes = Object.fromEntries(regions.map((region) => [region.regionId, [region.regionId]]));
const overrides = {
  modelId: "yota-03", modelVersion: "yota-03-v3",
  regions: Object.fromEntries(regions.map((region) => [region.regionId, {
    logicalRegionId: region.regionId,
    similarShapeGroup: Object.entries(groups).find(([, ids]) => ids.includes(region.regionId))?.[0] || null,
    geometryType: region.geometryType,
    regionKind: "decorative"
  }])),
  logicalShapes,
  similarShapeGroups: groups,
  groups
};
regions.forEach((region) => {
  region.shapeGroup = overrides.regions[region.regionId].similarShapeGroup;
});
const regionsDocument = {
  modelId: "yota-03", modelName: "ميدالية يوتا 3", modelVersion: "yota-03-v3",
  paintMode: "replace-source-color", totalRegions: regions.length, regions,
  shapeGroups: Object.entries(groups).map(([id, ids]) => ({ id, regions: ids }))
};

const debugOverlay = Buffer.alloc(totalPixels * 4);
regions.forEach((region, index) => {
  const hue = (index * 137.508) * Math.PI / 180;
  const color = [
    Math.round(128 + 127 * Math.sin(hue)),
    Math.round(128 + 127 * Math.sin(hue + 2 * Math.PI / 3)),
    Math.round(128 + 127 * Math.sin(hue + 4 * Math.PI / 3))
  ];
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const offset = pixel * 4;
    if (!mask[offset + 3] || mask[offset] !== region.maskColor[0] || mask[offset + 1] !== region.maskColor[1] || mask[offset + 2] !== region.maskColor[2]) continue;
    debugOverlay[offset] = color[0]; debugOverlay[offset + 1] = color[1]; debugOverlay[offset + 2] = color[2]; debugOverlay[offset + 3] = 190;
  }
});
const labels = regions.map((region) => `<text x="${region.centerX}" y="${region.centerY}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${region.regionId.replace("region-", "")}</text>`).join("");
const legend = `<g font-family="Arial" font-size="16" font-weight="700"><rect x="24" y="24" width="355" height="80" rx="10" fill="white" fill-opacity=".94" stroke="#222"/><text x="40" y="52">Model 3 decorative regions only</text><text x="40" y="79" font-size="14">Wood, metal and outside: non-colorable</text></g>`;
const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${legend}${labels}</svg>`);

await Promise.all([
  sharp(mask, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(directory, "regions.png")),
  sharp(basePath).composite([
    { input: debugOverlay, raw: { width, height, channels: 4 } },
    { input: outline, raw: { width, height, channels: 4 } },
    { input: svg }
  ]).png({ compressionLevel: 9 }).toFile(path.join(directory, "regions-debug.png"))
]);
fs.writeFileSync(oldRegionsPath, `${JSON.stringify(regionsDocument, null, 2)}\n`);
fs.writeFileSync(path.join(directory, "region-overrides.json"), `${JSON.stringify(overrides, null, 2)}\n`);

console.log(JSON.stringify({ modelVersion: regionsDocument.modelVersion, totalRawRegions: regions.length, logicalShapes, similarShapeGroups: groups }, null, 2));
