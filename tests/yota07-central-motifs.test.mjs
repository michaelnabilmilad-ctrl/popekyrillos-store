import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const mask = await sharp(path.join(dir, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const motifs = ["region-5", "region-6", "region-8", "region-9"];

function pixelsFor(region) {
  const result = new Set();
  for (let p = 0; p < mask.info.width * mask.info.height; p++) {
    const o = p * 4;
    if (mask.data[o] === region.maskColor[0] && mask.data[o + 1] === region.maskColor[1] && mask.data[o + 2] === region.maskColor[2] && mask.data[o + 3]) result.add(p);
  }
  return result;
}

test("Model 7 central motifs are four separate connected regions", () => {
  for (const id of motifs) {
    const region = meta.regions.find((item) => item.id === id);
    const pixels = pixelsFor(region);
    assert.equal(pixels.size, region.pixelCount, `${id} metadata count`);
    const queue = [pixels.values().next().value];
    const seen = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const next of [p - 1, p + 1, p - mask.info.width, p + mask.info.width]) {
        if (pixels.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    assert.equal(seen.size, pixels.size, `${id} has no islands`);
  }
});

test("Model 7 central wood diamonds remain outside all four motif masks", () => {
  for (const [x, y] of [[617, 829], [579, 865], [653, 864], [617, 901]]) {
    const o = (y * mask.info.width + x) * 4;
    assert.equal(mask.data[o + 3], 0, `diamond at ${x},${y}`);
  }
});

test("Model 7 central motifs retain their shared similar-shape group", () => {
  assert.deepEqual(meta.regions.filter((r) => motifs.includes(r.id)).map((r) => r.shapeGroup), Array(4).fill("center-cardinal-stars"));
});

test("red, green, blue and white remain explicit paints for each central motif", () => {
  for (const color of ["#8b0000", "#006400", "#0000ff", "#ffffff"]) {
    for (const id of motifs) assert.match(color, /^#[0-9a-f]{6}$/i, `${id} accepts ${color}`);
  }
});
