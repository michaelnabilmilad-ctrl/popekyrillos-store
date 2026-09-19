import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { COLORING_DESIGNS } from "../coloringDesigns.js";
import { applyRegionPaint, resolvePaintTargets } from "../coloring-game.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const design = COLORING_DESIGNS.find(d => d.id === "yota-01");
const regionData = JSON.parse(read("../coloring/yota-01/regions.json"));
const overrides = JSON.parse(read("../coloring/yota-01/region-overrides.json"));
const expected = {
  "border-outer-loops": [1,4,5,8,9,12,13,16,17,20,21,24,27,32,33,40,41,44,49,52,55,60,61,64,65,68,69,72,73,76,77,80,81],
  "border-inner-circles": [2,3,6,7,10,11,14,15,18,19,22,23,28,31,34,39,42,43,50,51,56,57,62,63,66,67,70,71,74,75,78,79,82],
  "center-small-squares": [25,26,35,36,37,38,45,46,47,48,58,59],
  "center-corner-l": [29,30,53,54]
};
const key = id => regionData.regions.find(r => r.id === id).maskColor.join(",");
// Execute the actual loader's group-to-mask-key compilation, not a test-only lookup.
const runtime = read("../coloring-game.js");
const start = runtime.indexOf("      const colorKeyByRawId =");
const end = runtime.indexOf("      restoreLocal();", start);
assert.ok(start >= 0 && end > start);
const state = { paintTargets: new Map() };
vm.runInNewContext(runtime.slice(start, end), { regionData, overrides, design, state });

test("yota-01 registers its own explicit groups without merging logical regions", () => {
  assert.equal(design.regionOverridesPath, "/coloring/yota-01/region-overrides.json");
  assert.equal(overrides.modelId, design.id);
  assert.deepEqual(overrides.logicalShapes, {});
  assert.deepEqual(Object.keys(overrides.similarShapeGroups), Object.keys(expected));
  const members = Object.values(overrides.similarShapeGroups).flat();
  assert.equal(new Set(members).size, 82);
  for (const [group, ids] of Object.entries(expected)) {
    assert.deepEqual(overrides.similarShapeGroups[group], ids.map(n => `region-${n}`));
  }
});

for (const [group, ids] of Object.entries(expected)) test(`yota-01 ${group}: OFF -> ON -> OFF changes exactly the intended masks`, () => {
  const keys = ids.map(n => key(`region-${n}`));
  for (const clicked of keys) {
    let colors = applyRegionPaint({}, resolvePaintTargets(clicked, false, state.paintTargets), "#ff0000");
    assert.deepEqual(Object.keys(colors), [clicked]);
    colors = applyRegionPaint(colors, resolvePaintTargets(clicked, true, state.paintTargets), "#008000");
    assert.deepEqual(Object.keys(colors).sort(), [...keys].sort());
    assert.ok(Object.values(colors).every(c => c === "#008000"));
    const before = { ...colors };
    colors = applyRegionPaint(colors, resolvePaintTargets(clicked, false, state.paintTargets), "#ffffff");
    assert.deepEqual(Object.keys(colors).filter(k => before[k] !== colors[k]), [clicked]);
    assert.equal(colors[clicked], "#ffffff");
  }
});

test("yota-01 central cross remains individual with grouping enabled", () => {
  const clicked = key("region-83");
  const colors = applyRegionPaint({}, resolvePaintTargets(clicked, true, state.paintTargets), "#ffffff");
  assert.deepEqual(colors, { [clicked]: "#ffffff" });
});
