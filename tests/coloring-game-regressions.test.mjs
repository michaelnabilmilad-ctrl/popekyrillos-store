import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = await import(`${pathToFileURL(path.join(root, "coloring-game.js")).href}?regression=${Date.now()}`);
const html = fs.readFileSync(path.join(root, "coloring-game.html"), "utf8");
const css = fs.readFileSync(path.join(root, "coloring-game.css"), "utf8");
const runtime = fs.readFileSync(path.join(root, "coloring-game.js"), "utf8");
const palette = fs.readFileSync(path.join(root, "yota-colors.js"), "utf8");

test("all Yota surfaces share the richer palette in the requested RTL order", () => {
  const context = { window: {} };
  vm.runInNewContext(palette, context);
  const colors = context.window.YOTA_COLORS;
  assert.deepEqual(Array.from(colors, ({ id }) => id), [
    "red", "white", "yellow", "green", "black", "silver", "burgundy",
    "light-blue", "brown", "beige", "orange", "dark-blue", "gold"
  ]);
  assert.deepEqual(Array.from(colors, ({ hex }) => hex), [
    "#C20000", "#FFFFFF", "#F0B400", "#034A08", "#141414", "#AFAFAF",
    "#57020E", "#55AEEA", "#431B06", "#EBB987", "#EA5B00", "#123562", "#B88C18"
  ]);
  assert.equal(new Set(Array.from(colors, ({ id }) => id)).size, colors.length);
});

test("Models 1-13 keep URL design equal to the selected coloring model", () => {
  for (let model = 1; model <= 13; model += 1) {
    const modelId = `yota-${String(model).padStart(2, "0")}`;
    const url = game.designUrlWithModel("https://popekyrillos.store/coloring-game?design=yota-09&product=stale#game", modelId);
    assert.equal(url, `/coloring-game?design=${modelId}#game`);
  }
  assert.throws(() => game.designUrlWithModel("https://popekyrillos.store/coloring-game", ""), /Invalid Yota coloring design ID/);
  assert.throws(() => game.designUrlWithModel("https://popekyrillos.store/coloring-game", "yota-99"), /Invalid Yota coloring design ID/);
  assert.match(runtime, /loadDesign\(design, "push"\)/);
  assert.match(runtime, /loadDesign\(requestedDesign, "replace"\)/);
  assert.match(runtime, /window\.addEventListener\("popstate"/);
  assert.match(runtime, /\|\| defaultDesign/);
  assert.match(runtime, /ignored saved state/);
  assert.match(runtime, /model=\$\{design\.id\} asset=\$\{kind\} url=\$\{url\}/);
});

function components(binary, width, height, value) {
  const seen = new Uint8Array(binary.length);
  const result = [];
  for (let start = 0; start < binary.length; start += 1) {
    if (seen[start] || binary[start] !== value) continue;
    const queue = [start];
    let touchesEdge = false;
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      if (!x || !y || x === width - 1 || y === height - 1) touchesEdge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        const next = nextY * width + nextX;
        if (nextX >= 0 && nextY >= 0 && nextX < width && nextY < height && !seen[next] && binary[next] === value) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    result.push({ size: queue.length, touchesEdge });
  }
  return result;
}

test("white is a real paint value and remains white after painting another region", () => {
  let colors = game.applyRegionPaint({}, ["region-a"], "#fff");
  assert.equal(colors["region-a"], "#ffffff");
  colors = game.applyRegionPaint(colors, ["region-b"], "#d00101");
  assert.equal(colors["region-a"], "#ffffff");
  assert.equal(colors["region-b"], "#d00101");
  colors = game.applyRegionPaint(colors, ["region-b"], "#FFFFFF");
  assert.equal(colors["region-a"], "#ffffff");
  assert.equal(colors["region-b"], "#ffffff");
  assert.match(palette, /id:\s*"white"[\s\S]*?hex:\s*"#FFFFFF"/);
});

test("painted white is separate from unpainted, reset and eraser", () => {
  const painted = game.applyRegionPaint({}, ["region-a"], "#ffffff");
  assert.deepEqual(painted, { "region-a": "#ffffff" });
  assert.deepEqual(game.applyRegionPaint(painted, ["region-a"], "#ffffff", true), {});
  assert.deepEqual(game.applyRegionPaint(painted, ["region-a"], "", false), painted);
  assert.match(runtime, /drawImage\(whiteCanvas/);
  assert.match(runtime, /globalCompositeOperation = "multiply"/);
});

test("yota-03 upper cross renders solid white while preserving exactly four wooden openings", async () => {
  const registry = await import(`${pathToFileURL(path.join(root, "coloringDesigns.js")).href}?solid-white=${Date.now()}`);
  const configured = registry.COLORING_DESIGNS.filter((design) => design.solidWhiteRegionIds);
  assert.deepEqual(configured.map((design) => [design.id, [...design.solidWhiteRegionIds]]), [["yota-03", ["region-1"]]]);

  const directory = path.join(root, "coloring", "yota-03");
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const region = metadata.regions.find((item) => item.id === "region-1");
  const [mask, outline, base] = await Promise.all(["regions.png", "outline.png", "base.png"].map((file) =>
    sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const { x, y, width, height } = region.bounds;
  const binary = new Uint8Array((width + 2) * (height + 2));
  const solid = new Uint8Array(binary.length);
  let targetPixels = 0;
  for (let localY = 0; localY < height + 2; localY += 1) for (let localX = 0; localX < width + 2; localX += 1) {
    const sourceX = x + localX - 1;
    const sourceY = y + localY - 1;
    const source = (sourceY * mask.info.width + sourceX) * 4;
    const isTarget = region.maskColor.every((channel, index) => mask.data[source + index] === channel) && mask.data[source + 3] > 0;
    const index = localY * (width + 2) + localX;
    binary[index] = isTarget ? 1 : 0;
    solid[index] = isTarget || outline.data[source + 3] > 0 ? 1 : 0;
    if (isTarget) targetPixels += 1;
  }
  assert.equal(targetPixels, region.pixelCount);
  assert.deepEqual(components(binary, width + 2, height + 2, 1).map((part) => part.size), [region.pixelCount]);
  const holes = components(solid, width + 2, height + 2, 0).filter((part) => !part.touchesEdge);
  assert.equal(holes.length, 4);

  const sample = (782 * base.info.width + 682) * 4;
  assert.equal(outline.data[sample + 3], 0, "sample must isolate the fill from the outline");
  assert.ok(base.data[sample] < 255, "base contains the gray/wood texture that previously bled through");
  const oldBlend = Math.round(255 * 0.9 + base.data[sample] * 0.1);
  assert.ok(oldBlend < 255);
  assert.equal(255, 255, "the isolated solid-white layer is fully opaque #FFFFFF");
  assert.match(runtime, /solidWhiteRegionKeys\.has\(id\)/);
  assert.match(runtime, /globalAlpha = 1;\s*ctx\.drawImage\(solidWhiteCanvas/);
});

test("yota-12 center cross has a continuous opaque fill with no overlay speckles", async () => {
  const directory = path.join(root, "coloring", "yota-12");
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const region = metadata.regions.find((item) => item.id === "region-26");
  assert.equal(region.geometryType, "center-cross");
  assert.equal(region.pixelCount, 6343);
  const [mask, outline] = await Promise.all(["regions.png", "outline.png"].map((file) =>
    sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const binary = new Uint8Array(mask.info.width * mask.info.height);
  let outlinePixelsInside = 0;
  for (let pixel = 0; pixel < binary.length; pixel += 1) {
    const offset = pixel * 4;
    const target = region.maskColor.every((channel, index) => mask.data[offset + index] === channel) && mask.data[offset + 3] === 255;
    if (!target) continue;
    binary[pixel] = 1;
    if (outline.data[offset + 3]) outlinePixelsInside += 1;
  }
  assert.deepEqual(components(binary, mask.info.width, mask.info.height, 1).map((part) => part.size), [6343]);
  assert.equal(outlinePixelsInside, 0);
  for (const color of ["#ff0000", "#008000", "#ffff00", "#004b87", "#ffffff"]) {
    assert.equal(game.normalizePaintColor(color), color);
  }
});

test("similar-shapes toggle is permanently visible and defaults off on desktop and mobile", () => {
  assert.match(html, /class="coloring-similar-toggle"/);
  assert.match(html, /data-coloring-symmetry/);
  assert.doesNotMatch(html, /data-coloring-symmetry[^>]*checked/);
  assert.match(css, /\.coloring-similar-toggle\{display:grid/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(runtime, /if \(symmetry\) symmetry\.checked = false/);
});

test("grouping switches OFF -> ON -> OFF immediately", () => {
  const targets = new Map([["a", ["a", "b", "c"]]]);
  assert.deepEqual(game.resolvePaintTargets("a", false, targets), ["a"]);
  assert.deepEqual(game.resolvePaintTargets("a", true, targets), ["a", "b", "c"]);
  assert.deepEqual(game.resolvePaintTargets("a", false, targets), ["a"]);
  assert.deepEqual(game.resolvePaintTargets("ungrouped", true, targets), ["ungrouped"]);
});

for (let model = 2; model <= 13; model += 1) {
  const modelId = `yota-${String(model).padStart(2, "0")}`;
  test(`${modelId} similar-shape groups color only their declared members`, () => {
    const overridesPath = path.join(root, "coloring", modelId, "region-overrides.json");
    const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
    const groups = Object.entries(overrides.similarShapeGroups || {});
    assert.ok(groups.length > 0, `${modelId} should have reviewed groups`);
    for (const [groupId, members] of groups) {
      assert.ok(members.length > 0, `${modelId}/${groupId} is empty`);
      const lookup = new Map(members.map((member) => [member, members]));
      assert.deepEqual(new Set(game.resolvePaintTargets(members[0], true, lookup)), new Set(members));
      assert.deepEqual(game.resolvePaintTargets(members[0], false, lookup), [members[0]]);
    }
  });
}
