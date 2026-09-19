const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "coloring", "yota-11");

test("yota-11 centre mask is solid, binary and clear of outline artifacts", async () => {
  const regionsDocument = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const centre = regionsDocument.regions.find((region) => region.geometryType === "center-cross");
  assert.ok(centre, "centre cross metadata is missing");

  const [{ data: mask, info }, { data: outline, info: outlineInfo }, { data: base }] = await Promise.all([
    sharp(path.join(directory, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(path.join(directory, "outline.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(path.join(directory, "base.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  assert.deepEqual([info.width, info.height], [1400, 1400]);
  assert.deepEqual([outlineInfo.width, outlineInfo.height], [1400, 1400]);

  const [red, green, blue] = centre.maskColor;
  let centrePixels = 0;
  let outlineOverlap = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    assert.ok(mask[offset + 3] === 0 || mask[offset + 3] === 255, `partial mask alpha at pixel ${pixel}`);
    if (mask[offset] !== red || mask[offset + 1] !== green || mask[offset + 2] !== blue || mask[offset + 3] !== 255) continue;
    centrePixels += 1;
    if (outline[offset + 3] !== 0) outlineOverlap += 1;
  }
  assert.equal(centrePixels, centre.pixelCount);
  assert.equal(outlineOverlap, 0, "outline pixels overlap the centre paint");

  const isCentre = (x, y) => {
    const offset = (y * info.width + x) * 4;
    return mask[offset] === red && mask[offset + 1] === green && mask[offset + 2] === blue && mask[offset + 3] === 255;
  };
  for (const [x, y] of [[652, 911], [746, 911], [652, 1003], [746, 1003]]) {
    assert.equal(isCentre(x, y), false, `square opening at ${x},${y} was painted`);
  }
  for (const [x, y] of [[700, 805], [540, 950], [700, 1108], [855, 950]]) {
    assert.equal(isCentre(x, y), true, `centre geometry is missing at ${x},${y}`);
  }

  const lowerColors = new Set(regionsDocument.regions
    .filter((region) => region.id === "region-25" || region.bounds.y >= 980)
    .map((region) => region.maskColor.join(",")));
  let lowerEdgePixels = 0;
  for (let y = 970; y < 1210; y += 1) for (let x = 440; x < 960; x += 1) {
    const pixel = y * info.width + x;
    const offset = pixel * 4;
    const key = `${mask[offset]},${mask[offset + 1]},${mask[offset + 2]}`;
    if (!mask[offset + 3] || !lowerColors.has(key)) continue;
    const isEdge = [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width].some((neighbor) => {
      const neighborOffset = neighbor * 4;
      return !mask[neighborOffset + 3] || `${mask[neighborOffset]},${mask[neighborOffset + 1]},${mask[neighborOffset + 2]}` !== key;
    });
    if (!isEdge) continue;
    lowerEdgePixels += 1;
    let engravedPixelNearby = false;
    for (let dy = -4; dy <= 4 && !engravedPixelNearby; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const baseOffset = ((y + dy) * info.width + x + dx) * 3;
      const luminance = 0.2126 * base[baseOffset] + 0.7152 * base[baseOffset + 1] + 0.0722 * base[baseOffset + 2];
      if (luminance < 145) { engravedPixelNearby = true; break; }
    }
    assert.equal(engravedPixelNearby, true, `lower edge at ${x},${y} is detached from the engraving`);
  }
  assert.ok(lowerEdgePixels > 3000, "lower edge audit did not cover the corrected geometry");
});
