const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const models = ["yota-01", "yota-02"];

for (const modelId of models) {
  test(`${modelId} assets and region map are valid`, async () => {
    const directory = path.join(root, "coloring", modelId);
    const data = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
    const files = ["base.png", "outline.png", "regions.png"];
    const metadata = await Promise.all(files.map((file) => sharp(path.join(directory, file)).metadata()));
    assert.equal(new Set(metadata.map((item) => `${item.width}x${item.height}`)).size, 1);
    assert.equal(data.modelId, modelId);
    assert.equal(data.totalRegions, data.regions.length);

    const { data: pixels, info } = await sharp(path.join(directory, "regions.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const declared = new Map(data.regions.map((region) => [region.maskColor.join(","), region]));
    const seen = new Set();
    for (let offset = 0; offset < pixels.length; offset += info.channels) {
      if (!pixels[offset + 3]) continue;
      const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
      assert.ok(declared.has(key), `${modelId} has undeclared mask color ${key}`);
      seen.add(key);
    }
    data.regions.forEach((region) => assert.ok(seen.has(region.maskColor.join(",")), `${region.regionId} is absent`));

    const width = info.width;
    const height = info.height;
    const visited = new Uint8Array(width * height);
    const componentCount = new Map();
    const queue = new Int32Array(width * height);
    const colorAt = (pixel) => {
      const offset = pixel * info.channels;
      return pixels[offset + 3]
        ? `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`
        : "";
    };
    for (let seed = 0; seed < width * height; seed += 1) {
      const key = colorAt(seed);
      if (!key || visited[seed]) continue;
      componentCount.set(key, (componentCount.get(key) || 0) + 1);
      let head = 0;
      let tail = 0;
      queue[tail++] = seed;
      visited[seed] = 1;
      while (head < tail) {
        const pixel = queue[head++];
        const x = pixel % width;
        for (const neighbor of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
          if (neighbor < 0 || neighbor >= width * height || visited[neighbor]) continue;
          if ((neighbor === pixel - 1 && x === 0) || (neighbor === pixel + 1 && x === width - 1)) continue;
          if (colorAt(neighbor) !== key) continue;
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    data.regions.forEach((region) => {
      assert.equal(componentCount.get(region.maskColor.join(",")), 1, `${region.regionId} must have one connected component`);
    });

    const geometryByGroup = new Map();
    data.regions.filter((region) => region.shapeGroup).forEach((region) => {
      if (!geometryByGroup.has(region.shapeGroup)) geometryByGroup.set(region.shapeGroup, new Set());
      geometryByGroup.get(region.shapeGroup).add(region.geometryType);
    });
    geometryByGroup.forEach((types, group) => {
      assert.equal(types.size, 1, `${modelId} shapeGroup ${group} mixes geometry types`);
    });
  });
}

test("one shared runtime selects model assets and model-scoped storage", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.match(source, /product\.coloringBaseImageUrl/);
  assert.match(source, /product\.coloringMaskUrl/);
  assert.match(source, /product\.coloringOutlineUrl/);
  assert.match(source, /yota-coloring-design-\$\{activeModelId\}/);
  assert.match(source, /String\(parsed\.modelVersion \|\| ""\) !== coloringStorageVersion/);
  assert.match(source, /key\.startsWith\(modelStoragePrefix\) && key !== coloringStorageKey/);
  assert.match(source, /modelVersion: coloringStorageVersion/);
  assert.match(source, /renderColoringArtwork/);
  assert.doesNotMatch(source, /function\s+initializeYota02Coloring/);
});

test("yota-02 metadata defines raw regions, logical shapes, and similar-shape groups", () => {
  const directory = path.join(root, "coloring", "yota-02");
  const data = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  const validIds = new Set(data.regions.map((region) => region.regionId || region.id));
  assert.equal(overrides.modelId, "yota-02");
  assert.equal(overrides.modelVersion, "yota-02-v14");
  Object.entries(overrides.groups).forEach(([group, ids]) => {
    assert.equal(ids.length, new Set(ids).size, `${group} contains duplicate IDs`);
    ids.forEach((id) => {
      assert.ok(validIds.has(id), `${id} does not exist`);
    });
  });
  Object.entries(overrides.regions).forEach(([id, metadata]) => {
    assert.ok(validIds.has(id), `${id} override does not exist`);
    assert.equal(typeof metadata, "object");
  });
  assert.equal(data.modelVersion, "yota-02-v14");
  assert.equal(data.totalRegions, 50);
  assert.deepEqual(data.shapeGroups, []);
  assert.ok(data.regions.every((region) => region.shapeGroup === null));
  const logicalEntries = Object.entries(overrides.logicalShapes);
  const logicalRawIds = logicalEntries.flatMap(([, ids]) => ids);
  assert.equal(logicalRawIds.length, 50);
  assert.equal(new Set(logicalRawIds).size, 50);
  assert.deepEqual(new Set(logicalRawIds), validIds);
  assert.deepEqual(overrides.logicalShapes["lower-left-star"], ["region-33", "region-38"]);
  assert.deepEqual(overrides.logicalShapes["lower-right-star"], ["region-34", "region-35"]);
  assert.ok(["region-33", "region-38"].every((id) => data.regions.find((region) => region.id === id).logicalRegionId === "lower-left-star"));
  assert.ok(["region-34", "region-35"].every((id) => data.regions.find((region) => region.id === id).logicalRegionId === "lower-right-star"));
  const logicalNames = new Set(logicalEntries.map(([name]) => name));
  Object.values(overrides.similarShapeGroups).flat().forEach((logicalName) => {
    assert.ok(logicalNames.has(logicalName), `${logicalName} is not a logical shape`);
  });
  Object.entries(overrides.groups).forEach(([groupName, ids]) => {
    const expanded = overrides.similarShapeGroups[groupName]
      .flatMap((logicalName) => overrides.logicalShapes[logicalName]);
    assert.deepEqual(new Set(ids), new Set(expanded), `${groupName} raw expansion is stale`);
  });

  const logicalByRaw = new Map(logicalEntries.flatMap(([logicalName, ids]) =>
    ids.map((id) => [id, logicalName])
  ));
  const similarByLogical = new Map(Object.entries(overrides.similarShapeGroups).flatMap(([groupName, names]) =>
    names.map((name) => [name, groupName])
  ));
  const resolve = (rawId, symmetry) => {
    const logicalName = logicalByRaw.get(rawId);
    if (!symmetry || !similarByLogical.has(logicalName)) return overrides.logicalShapes[logicalName];
    return overrides.similarShapeGroups[similarByLogical.get(logicalName)]
      .flatMap((name) => overrides.logicalShapes[name]);
  };

  logicalEntries.forEach(([, rawIds]) => rawIds.forEach((rawId) => {
    assert.deepEqual(new Set(resolve(rawId, false)), new Set(rawIds), `${rawId} does not resolve to its complete logical shape`);
  }));
  Object.entries(overrides.similarShapeGroups).forEach(([groupName, logicalNamesInGroup]) => {
    const expected = logicalNamesInGroup.flatMap((name) => overrides.logicalShapes[name]);
    expected.forEach((rawId) => {
      assert.deepEqual(new Set(resolve(rawId, true)), new Set(expected), `${rawId} does not resolve the complete ${groupName} group`);
    });
  });

  const applyAction = (colors, rawId, symmetry, color) => {
    const before = JSON.stringify(colors);
    resolve(rawId, symmetry).forEach((id) => color ? colors[id] = color : delete colors[id]);
    return before;
  };
  const colors = {};
  const logicalBefore = applyAction(colors, "region-33", false, "#FEC105");
  assert.deepEqual(colors, { "region-33": "#FEC105", "region-38": "#FEC105" });
  const logicalAfter = JSON.stringify(colors);
  Object.keys(colors).forEach((id) => delete colors[id]);
  Object.assign(colors, JSON.parse(logicalBefore));
  assert.deepEqual(colors, {});
  Object.assign(colors, JSON.parse(logicalAfter));
  assert.deepEqual(colors, { "region-33": "#FEC105", "region-38": "#FEC105" });
  applyAction(colors, "region-38", false, null);
  assert.deepEqual(colors, {});

  const groupedBefore = applyAction(colors, "region-34", true, "#C80018");
  const cornerStarRawIds = overrides.groups["corner-stars"];
  assert.ok(cornerStarRawIds.every((id) => colors[id] === "#C80018"));
  const groupedAfter = JSON.stringify(colors);
  Object.keys(colors).forEach((id) => delete colors[id]);
  Object.assign(colors, JSON.parse(groupedBefore));
  assert.deepEqual(colors, {});
  Object.assign(colors, JSON.parse(groupedAfter));
  assert.ok(cornerStarRawIds.every((id) => colors[id] === "#C80018"));
  applyAction(colors, "region-9", true, null);
  assert.ok(cornerStarRawIds.every((id) => !colors[id]));
});

test("product coloring runtime resolves logical shapes before optional similarity groups", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.match(source, /const logicalShapeByRegion = new Map/);
  assert.match(source, /const similarGroupByLogicalShape = new Map/);
  assert.match(source, /const logicalMembers = coloringRegions/);
  assert.match(source, /if \(!panel\.querySelector\("\[data-coloring-symmetry\]"\)\?\.checked\) return/);
  assert.match(source, /filter\(\(region\) => \(region\.similarShapeGroup \|\| region\.shapeGroup\) === similarShapeGroup\)/);
});

test("runtime merges region-overrides and editor is localhost-only", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.match(source, /coloringRegionOverridesUrl/);
  assert.match(source, /overrideGroupByRegion/);
  assert.match(source, /coloringGroupEditor/);
  assert.match(source, /\["localhost", "127\.0\.0\.1", "::1"\]/);
  assert.match(source, /region-overrides\.json/);
});

test("coloring controls keep grouping visible and provide zoom", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "product-page.css"), "utf8");
  assert.match(source, /product-coloring-grouping-option/);
  assert.match(source, /data-coloring-zoom-in/);
  assert.match(source, /data-coloring-zoom-out/);
  assert.match(source, /setColoringZoom/);
  assert.match(styles, /--coloring-zoom/);
  assert.match(styles, /touch-action:pan-x pan-y/);
});

test("group editor is full screen with save, ungrouped review, and mobile drawer", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "product-page.css"), "utf8");
  assert.match(source, /data-editor-save/);
  assert.match(source, /data-editor-show-ungrouped/);
  assert.match(source, /data-editor-disable/);
  assert.match(source, /coloring-group-editor-drawer-toggle/);
  assert.match(styles, /position:fixed;z-index:1000;inset:0/);
  assert.match(styles, /grid-template-columns:minmax\(0,7fr\) minmax\(340px,3fr\)/);
  assert.match(styles, /min-width:650px/);
  assert.match(styles, /editor-drawer-open/);
});

test("all website Yota medallions are represented without sharing masks", async () => {
  const productsData = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const products = (Array.isArray(productsData) ? productsData : productsData.products || productsData.items || [])
    .filter((product) => /يوتا.*مادلية|مادلية.*يوتا/i.test(String(product.name || "")));
  const registry = await import(`${pathToFileURL(path.join(root, "coloringDesigns.js")).href}?audit=${Date.now()}`);
  assert.equal(products.length, 7);
  assert.equal(registry.COLORING_DESIGNS.length, products.length);
  assert.deepEqual(
    new Set(registry.COLORING_DESIGNS.map((design) => design.productId)),
    new Set(products.map((product) => product.id))
  );

  const ready = registry.COLORING_DESIGNS.filter((design) => design.enabled !== false);
  const pending = registry.COLORING_DESIGNS.filter((design) => design.enabled === false);
  assert.deepEqual(ready.map((design) => design.id), ["yota-01", "yota-02", "yota-03"]);
  assert.deepEqual(pending.map((design) => design.id), ["yota-04", "yota-05", "yota-06", "yota-07"]);
  assert.equal(new Set(ready.map((design) => design.regionsPath)).size, ready.length);
  pending.forEach((design) => {
    assert.equal(design.status, "missing-region-assets");
    assert.ok(design.missingAssets.includes("regions.png"));
    assert.equal(registry.coloringDesignForProduct({ id: design.productId }), null);
  });
});

test("current product ID overrides stale copied coloring configuration", async () => {
  const registry = await import(`${pathToFileURL(path.join(root, "coloringDesigns.js")).href}?routing=${Date.now()}`);
  const staleModelOneFields = {
    coloringModelId: "yota-01",
    coloringBaseImageUrl: "/coloring/yota-01/base.png",
    coloringMaskUrl: "/coloring/yota-01/regions.png",
    coloringOutlineUrl: "/coloring/yota-01/outline.png",
    coloringRegionsUrl: "/coloring/yota-01/regions.json",
    coloringRegions: [{ id: "wrong-region" }]
  };
  const modelTwo = registry.withYotaColoringConfig({
    id: "custom-1782980654479-copy-1782982056347",
    slug: "صليب-يوتا-مادليه-موديل-2",
    ...staleModelOneFields
  });
  assert.equal(modelTwo.coloringModelId, "yota-02");
  assert.match(modelTwo.coloringBaseImageUrl, /^\/coloring\/yota-02\/base\.png\?v=yota-02-v14$/);
  assert.match(modelTwo.coloringMaskUrl, /^\/coloring\/yota-02\/regions\.png\?v=yota-02-v14$/);
  assert.equal(modelTwo.coloringRegions, undefined);

  const modelThree = registry.withYotaColoringConfig({
    id: "custom-1782980654479-copy-1782982056347-copy-1782986984554",
    ...staleModelOneFields
  });
  assert.equal(modelThree.coloringModelId, "yota-03");
  assert.match(modelThree.coloringBaseImageUrl, /^\/coloring\/yota-03\/base\.png\?v=yota-03-v5$/);
  assert.match(modelThree.coloringMaskUrl, /^\/coloring\/yota-03\/regions\.png\?v=yota-03-v5$/);
});

test("model 3 colors decorative fills only", () => {
  const directory = path.join(root, "coloring", "yota-03");
  const data = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.equal(data.modelVersion, "yota-03-v5");
  assert.equal(data.paintMode, "replace-source-color");
  assert.equal(data.totalRegions, 13);
  assert.ok(data.regions.every((region) => region.regionKind === "decorative"));
  assert.equal(Object.keys(overrides.logicalShapes).length, 13);
  assert.equal(overrides.backgroundGroups, undefined);
  assert.doesNotMatch(source, /data-coloring-whole-background/);
  assert.match(source, /replace-source-color/);
});
