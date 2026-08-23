import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "coloring", "yota-03");
const source = path.join(outputDir, "plain-gallery-source.webp");
const { data: rgb, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const gray = await sharp(source).greyscale().raw().toBuffer();
const localMean = await sharp(source).greyscale().blur(4).raw().toBuffer();
const { width, height, channels } = info;
const totalPixels = width * height;
const indexOf = (x, y) => y * width + x;
const engraving = new Uint8Array(totalPixels);

// Only the warm brown laser engraving is a boundary. The neutral gray
// diagonal watermark is deliberately excluded, so it cannot split a shape.
for (let y = 430; y < 1370; y += 1) {
  for (let x = 300; x < 1060; x += 1) {
    const pixel = indexOf(x, y);
    const offset = pixel * channels;
    const r = rgb[offset];
    const g = rgb[offset + 1];
    const b = rgb[offset + 2];
    const luminance = gray[pixel];
    const narrowDarkLine = localMean[pixel] - luminance > 13 && luminance < 190;
    if (narrowDarkLine) engraving[pixel] = 1;
  }
}
const boundary = engraving.slice();
for (let y = 432; y < 1368; y += 1) {
  for (let x = 302; x < 1058; x += 1) {
    const pixel = indexOf(x, y);
    if (!engraving[pixel]) continue;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      boundary[pixel + dy * width + dx] = 1;
    }
  }
}

const seeds = [
  { name: "outer-top", x: 684, y: 790, family: "outer-crosses" },
  { name: "small-upper-left", x: 578, y: 890, family: "small-cyan-crosses" },
  { name: "small-upper-right", x: 795, y: 890, family: "small-cyan-crosses" },
  { name: "outer-left", x: 481, y: 1000, family: "outer-crosses" },
  { name: "center-upper-left", x: 631, y: 959, family: "center-white-details" },
  { name: "center-upper-right", x: 738, y: 959, family: "center-white-details" },
  { name: "center-cross", x: 684, y: 1015, family: null },
  { name: "outer-right", x: 884, y: 1000, family: "outer-crosses" },
  { name: "center-lower-left", x: 645, y: 1041, family: "center-white-details" },
  { name: "center-lower-right", x: 724, y: 1041, family: "center-white-details" },
  { name: "small-lower-left", x: 578, y: 1110, family: "small-cyan-crosses" },
  { name: "small-lower-right", x: 795, y: 1110, family: "small-cyan-crosses" },
  { name: "outer-bottom", x: 684, y: 1195, family: "outer-crosses" }
];
const queue = new Int32Array(totalPixels);
const trace = ({ x: seedX, y: seedY }) => {
  const visited = new Uint8Array(totalPixels);
  let seed = indexOf(seedX, seedY);
  if (boundary[seed]) {
    outer: for (let radius = 1; radius <= 12; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        const candidate = indexOf(seedX + dx, seedY + dy);
        if (!boundary[candidate]) { seed = candidate; break outer; }
      }
    }
  }
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  visited[seed] = 1;
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (const neighbor of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
      const nx = neighbor % width;
      const ny = Math.floor(neighbor / width);
      if (neighbor < 0 || neighbor >= totalPixels || nx < 300 || nx > 1060 || ny < 430 || ny > 1370 || Math.abs(nx - x) > 1) continue;
      if (visited[neighbor] || boundary[neighbor]) continue;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }
  return Array.from(queue.subarray(0, tail));
};

const components = seeds.map((seed) => ({ ...seed, pixels: trace(seed) }));
// The flood boundary is deliberately wider than the photographed engraving so
// watermark edges cannot leak between regions. Reclaim two pixels from that
// safety boundary when only one physical shape can own them. This closes wood
// grain/watermark pinholes while leaving the large intentional square openings.
const owner = new Int16Array(totalPixels).fill(-1);
components.forEach((component, componentIndex) => component.pixels.forEach((pixel) => { owner[pixel] = componentIndex; }));
for (let pass = 0; pass < 5; pass += 1) {
  const additions = [];
  for (let y = 700; y < 1300; y += 1) for (let x = 400; x < 980; x += 1) {
    const pixel = indexOf(x, y);
    if (owner[pixel] !== -1) continue;
    const claims = new Set();
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const candidateOwner = owner[pixel + dy * width + dx];
      if (candidateOwner >= 0) claims.add(candidateOwner);
    }
    if (claims.size === 1) additions.push([pixel, [...claims][0]]);
  }
  additions.forEach(([pixel, componentIndex]) => { owner[pixel] = componentIndex; });
}
components.forEach((component, componentIndex) => {
  component.pixels = [];
  for (let pixel = 0; pixel < totalPixels; pixel += 1) if (owner[pixel] === componentIndex) component.pixels.push(pixel);
});
const unique = new Set(components.flatMap((component) => component.pixels));
console.log("expanded component sizes", components.map((component) => [component.name, component.pixels.length]));
if (unique.size !== components.reduce((sum, component) => sum + component.pixels.length, 0)) throw new Error("Region overlap detected");
if (components.some((component) => component.pixels.length < 600 || component.pixels.length > 16000)) throw new Error("Unexpected region area");
fs.mkdirSync(outputDir, { recursive: true });
await sharp(source).png().toFile(path.join(outputDir, "base.png"));

const mask = Buffer.alloc(totalPixels * 4);
const outline = Buffer.alloc(totalPixels * 4);
const maskColor = (index) => [index + 1, 0, ((index + 1) * 73) % 255];
components.forEach((component, index) => component.pixels.forEach((pixel) => {
  const offset = pixel * 4;
  const color = maskColor(index);
  mask[offset] = color[0]; mask[offset + 1] = color[1]; mask[offset + 2] = color[2]; mask[offset + 3] = 255;
}));
const warmLine = new Uint8Array(totalPixels);
for (let pixel = 0; pixel < totalPixels; pixel += 1) {
  const sourceOffset = pixel * channels;
  const r = rgb[sourceOffset]; const g = rgb[sourceOffset + 1]; const b = rgb[sourceOffset + 2];
  const luminance = .2126 * r + .7152 * g + .0722 * b;
  if (luminance < 170 && r - g > 10 && g - b > 6) warmLine[pixel] = 1;
}
const filteredLine = new Uint8Array(totalPixels);
const lineVisited = new Uint8Array(totalPixels);
for (let y = 700; y < 1300; y += 1) for (let x = 400; x < 980; x += 1) {
  const start = indexOf(x, y);
  if (!warmLine[start] || lineVisited[start]) continue;
  let head = 0; let tail = 0;
  queue[tail++] = start; lineVisited[start] = 1;
  while (head < tail) {
    const pixel = queue[head++];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const neighbor = pixel + dy * width + dx;
      if (!warmLine[neighbor] || lineVisited[neighbor]) continue;
      lineVisited[neighbor] = 1; queue[tail++] = neighbor;
    }
  }
  if (tail >= 24) for (let i = 0; i < tail; i += 1) filteredLine[queue[i]] = 1;
}
for (let pixel = 0; pixel < totalPixels; pixel += 1) {
  if (!filteredLine[pixel]) continue;
  const nearbyOwners = new Set();
  for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
    nearbyOwners.add(owner[pixel + dy * width + dx]);
  }
  if (nearbyOwners.size < 2) continue;
  const sourceOffset = pixel * channels;
  const outputOffset = pixel * 4;
  outline[outputOffset] = rgb[sourceOffset]; outline[outputOffset + 1] = rgb[sourceOffset + 1]; outline[outputOffset + 2] = rgb[sourceOffset + 2]; outline[outputOffset + 3] = 210;
}
await Promise.all([
  sharp(mask, { raw: { width, height, channels: 4 } }).png().toFile(path.join(outputDir, "regions.png")),
  sharp(outline, { raw: { width, height, channels: 4 } }).png().toFile(path.join(outputDir, "outline.png"))
]);

const boundsOf = (pixels) => {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (const pixel of pixels) { const x = pixel % width; const y = Math.floor(pixel / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};
const regionIds = Object.fromEntries(components.map((component, index) => [component.name, `region-${index + 1}`]));
const groups = {
  "outer-crosses": ["outer-top", "outer-left", "outer-right", "outer-bottom"].map((name) => regionIds[name]),
  "small-cyan-crosses": ["small-upper-left", "small-upper-right", "small-lower-left", "small-lower-right"].map((name) => regionIds[name]),
  "center-white-details": ["center-upper-left", "center-upper-right", "center-lower-left", "center-lower-right"].map((name) => regionIds[name])
};
const regions = components.map((component, index) => ({
  id: `region-${index + 1}`, regionId: `region-${index + 1}`, maskColor: maskColor(index), pixelCount: component.pixels.length,
  centerX: component.x, centerY: component.y, bounds: boundsOf(component.pixels), sampleX: component.x, sampleY: component.y,
  regionKind: "decorative", logicalRegionId: `region-${index + 1}`, shapeGroup: component.family, geometryType: component.family || "center-cross",
  enabled: true, label: component.name
}));
const regionsJson = { modelId: "yota-03", modelName: "ميدالية يوتا 3", modelVersion: "yota-03-v6", paintMode: "replace-source-color", ignoreNeutralWatermark: true, totalRegions: regions.length, regions, shapeGroups: Object.entries(groups).map(([id, regions]) => ({ id, regions })) };
const overrideRegions = Object.fromEntries(components.map((component, index) => [`region-${index + 1}`, { logicalRegionId: `region-${index + 1}`, similarShapeGroup: component.family, geometryType: component.family || "center-cross", regionKind: "decorative" }]));
const logicalShapes = Object.fromEntries(components.map((component, index) => [`region-${index + 1}`, [`region-${index + 1}`]]));
const overrides = { modelId: "yota-03", modelVersion: "yota-03-v6", regions: overrideRegions, logicalShapes, similarShapeGroups: groups, groups };
fs.writeFileSync(path.join(outputDir, "regions.json"), `${JSON.stringify(regionsJson, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "region-overrides.json"), `${JSON.stringify(overrides, null, 2)}\n`);

const debug = Buffer.alloc(totalPixels * 4);
components.forEach((component, index) => {
  const color = [50 + index * 83 % 205, 45 + index * 137 % 210, 55 + index * 59 % 200];
  component.pixels.forEach((pixel) => {
    const offset = pixel * 4;
    debug[offset] = color[0]; debug[offset + 1] = color[1]; debug[offset + 2] = color[2]; debug[offset + 3] = 180;
  });
});
const labels = components.map((component, index) => `<text x="${component.x}" y="${component.y}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${index + 1}</text>`).join("");
const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`);
await sharp(source).composite([{ input: debug, raw: { width, height, channels: 4 } }, { input: outline, raw: { width, height, channels: 4 } }, { input: svg }]).png().toFile(path.join(outputDir, "regions-debug.png"));
console.log(components.map((component, index) => ({ id: index + 1, name: component.name, pixels: component.pixels.length })));
console.log({ uniquePixels: unique.size, source, outputDir, modelVersion: "yota-03-v6" });
