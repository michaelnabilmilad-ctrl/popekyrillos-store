const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const registryUrl = pathToFileURL(path.join(root, "coloringDesigns.js")).href;
const expectedIds = Array.from({ length: 13 }, (_, index) => `yota-${String(index + 1).padStart(2, "0")}`);
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const approvedAssets = {
  "yota-01": ["081a6c8ff40e8414541517866175c3d51e130efd1e8443dc12a4d3519b2ffd4a", "204f177f5bb7713ebfe89fb01085af83985eb8a0a7feacc3aca943f84f250245", "ff59afc57988ccc2b7fddc7c4e5713f51a8dafc592030b02fcdcd54e7e512edb"],
  "yota-02": ["429ec9266459c262756a36daacd31cd5fb70bca63a347a1305e255284e3b3072", "dcdd4ef4e16943ff9a2dac4ff6f886f5d2e85e60e760d32e4c3a34882389288c", "f7a80ce7f2e20a29aacdbf765de39a522a9bc73ccd9c0aab6a9f97e9ea0f5005"],
  "yota-03": ["2811975caa2da1f487a5cbadd99a99f4196cd2b708d361c8a91b8a80a0fefced", "a79b65ca50bf25e701329e06822e468c5efc3970022414a717ae4b9efb235327", "32a50c421da1808a7effd14699c5b85a59341e99bfe92125636a506899e48424"],
  "yota-04": ["1f8f376ed887127f2956fde463d6bf7120576a1cbb4cd165739855afd4a72755", "0cb0600dd0bfa4784f32126353dea2618c9eca78a109775785b0f9d27e1e168a", "8b77d8b05f08a16834b8761021a7b08d75ffd744b304057484b510fca8825da7"],
  "yota-05": ["641859f03a2d2c7fb56736b55bebc6c7e0804112a365fc160111a0b9e6cbb6b5", "a5ff0273a5a47c0909963f83444e241e45e0c4c11dfbcd2dcad2d8d3bd689d93", "bafcb0b5919b059f1e59ff00081c9214579c66c05d7b8b98a4f33f865e3ffe25"],
  "yota-06": ["f095a6239aa7bf6271ccdcd4eb7c15eb17bf7b17a1ed536d2861586a9c658a3b", "05833fad954de6676ff0123b6aa7dcb2e594438d3546ac9cbd658021bfaf4dc4", "827a8cb9f12fcc9c6f0d58f0c9efdb103a1915899c6d58636f23ae8a1eddea83"],
  "yota-07": ["84f6d0829ccbce0c11e0510eb80caed812fdac7c4e1652ba8b7b001d5c52c0e7", "8ef129d7d8c605efe359a6d52e9705f7ca5887328d8770e2b731e5de531df281", "8b2b7e2f6583d4596e7176cf747704bb23004ff5c84ce36e53aa695c8e264afd"],
  "yota-08": ["2305bdd74b89e90ff6a4cdca6be49083f5f371b55114c6aab32832d0875c59ab", "4fd31251955f99a3bef5a7e4cfc5dde1059b321b5facb3d894098dc200cf2834", "0eec825858192c86eaad41b4beac4f77c40c8434d2e8f466563d90786949f4cd"],
  "yota-09": ["43d76bd1c4dc77cd10e7f654336173686ed0d6bd395f5913c341b5999a6d095a", "154b971f2985b78c10484384ccc4324e28510fff8d5a19eca1dc9e8290c2afd2", "6eec303c3e55b4f1425cca34fe07733827b0881b761932e9cc85b2a36e53f36a"],
  "yota-10": ["a178c34a8aa8c6a062e09fe2fe4ecd1b870130096078521d9c3d8f2fcfd992e7", "ec5c53e98e3dd587a9340be8710349d58d5cce89398ac9147f238e67043a9994", "6e56c64759008ed7b658984c012af065c5cef11c66753eb91268aa762e914d44"],
  "yota-11": ["ca173118504637233787584daa5a373a8ff68432669c2b57a553d8fdbd86f327", "72fb28cdc5c0c4b4a0f1aab4a80ddc293e630ec0e667780555472b3159f26bc3", "6bd0b62be8e0d287a72c880589970c1f0448615df4a99796f32ebf912aed6593"],
  "yota-12": ["1235f6ada3b513cd46daf262ca9cb624ffb517779f866d955be4648fbe7e1200", "d13a59eaeb35e7e874ee6a26c889d897b76d6b709c2fb465fb24cfc4b43948bc", "1e382cba5767f8416b7dda0bdac1cfc711c6766186446b1efb64909acc1ce8db"]
};

test("Models 1-13 have explicit stable IDs and model-scoped asset paths", async () => {
  const registry = await import(`${registryUrl}?routing=${Date.now()}`);
  assert.deepEqual(registry.COLORING_DESIGNS.map((design) => design.id), expectedIds);
  assert.equal(new Set(registry.COLORING_DESIGNS.map((design) => design.productId)).size, 13);
  for (const design of registry.COLORING_DESIGNS) {
    assert.equal(registry.coloringDesignById(design.id), design);
    for (const assetPath of [design.basePath, design.thumbnailPath, design.regionsPath, design.outlinePath, design.regionsDataPath, design.regionOverridesPath]) {
      assert.match(assetPath, new RegExp(`/coloring/${design.id}/`), `${design.id} has a foreign asset path`);
    }
    assert.equal(design.thumbnailPath, design.basePath, `${design.id} thumbnail must be explicit and model-scoped`);
  }
});

test("selected model ID equals loaded coloring model ID for Models 1-13", async () => {
  const registry = await import(`${registryUrl}?selected=${Date.now()}`);
  for (const [index, design] of registry.COLORING_DESIGNS.entries()) {
    const selectedModelId = expectedIds[index];
    const loaded = registry.coloringDesignById(selectedModelId);
    assert.equal(loaded.id, selectedModelId);
    assert.match(loaded.regionsDataPath, new RegExp(`/${selectedModelId}/regions\\.json$`));
  }
});

test("product identity replaces stale copied coloring configuration", async () => {
  const registry = await import(`${registryUrl}?stale=${Date.now()}`);
  for (const design of registry.COLORING_DESIGNS.slice(0, 13)) {
    const configured = registry.withYotaColoringConfig({
      id: design.productId,
      coloringModelId: "yota-01",
      coloringBaseImageUrl: "/coloring/yota-01/base.png",
      coloringMaskUrl: "/coloring/yota-01/regions.png",
      coloringOutlineUrl: "/coloring/yota-01/outline.png",
      coloringRegionsUrl: "/coloring/yota-01/regions.json"
    });
    assert.equal(configured.coloringModelId, design.id);
    assert.match(configured.coloringMaskUrl, new RegExp(`/coloring/${design.id}/regions\\.png`));
  }
});

test("reviewed Models 1-13 load their own unique masks", async () => {
  const registry = await import(`${registryUrl}?assets=${Date.now()}`);
  const ready = registry.COLORING_DESIGNS.slice(0, 13);
  const hashes = [];
  for (const design of ready) {
    assert.equal(design.enabled, true, `${design.id} should be enabled`);
    assert.equal(design.status, "ready");
    const directory = path.join(root, "coloring", design.id);
    const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
    assert.equal(regionData.modelId, design.id);
    assert.equal(regionData.modelVersion, design.modelVersion);
    const dimensions = await Promise.all(["base.png", "regions.png", "outline.png"].map(async (file) => {
      const metadata = await sharp(path.join(directory, file)).metadata();
      return [metadata.width, metadata.height];
    }));
    assert.deepEqual(dimensions[1], dimensions[0]);
    assert.deepEqual(dimensions[2], dimensions[0]);
    hashes.push(digest(path.join(directory, "regions.png")));
  }
  assert.equal(new Set(hashes).size, ready.length, "two reviewed models share the same mask");
  for (const design of registry.COLORING_DESIGNS.slice(13)) {
    assert.equal(design.enabled, false);
    assert.equal(design.status, "needs-visual-review");
  }
});

test("Models 1-12 use the visually approved base, outline and region asset set", () => {
  for (const [modelId, expected] of Object.entries(approvedAssets)) {
    const directory = path.join(root, "coloring", modelId);
    const actual = ["base.png", "outline.png", "regions.png"].map((file) => digest(path.join(directory, file)));
    assert.deepEqual(actual, expected, `${modelId} asset set was replaced, shifted, or mixed`);
  }
});

test("product route prefers the product name over a stale copied slug", async () => {
  const worker = await import(`${pathToFileURL(path.join(root, "cloudflare-worker.js")).href}?slug=${Date.now()}`);
  const products = [
    { id: "model-13-product", name: "صليب يوتا مادلية موديل 13", slug: "صليب-يوتا-مادليه-موديل-7" },
    { id: "model-7-product", name: "صليب يوتا مادلية موديل 7", slug: "صليب-يوتا-مادليه-موديل-7" }
  ];
  assert.equal(worker.productByIdOrSlug(products, "صليب-يوتا-مادليه-موديل-7").id, "model-7-product");
});

test("Model 8 has 13 connected, independently addressable decorative regions", async () => {
  const directory = path.join(root, "coloring", "yota-08");
  const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  assert.equal(regionData.totalRegions, 13);
  assert.equal(Object.keys(overrides.logicalShapes).length, 13);
  assert.deepEqual(Object.keys(overrides.similarShapeGroups).sort(), ["inner-arms", "inner-corners", "outer-stars"]);
  const { data, info } = await sharp(path.join(directory, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelsByColor = new Map();
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    if (!data[offset + 3]) continue;
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    if (!pixelsByColor.has(key)) pixelsByColor.set(key, new Set());
    pixelsByColor.get(key).add(pixel);
  }
  assert.equal(pixelsByColor.size, 13);
  for (const region of regionData.regions) {
    const key = region.maskColor.join(",");
    const pixels = pixelsByColor.get(key);
    assert.equal(pixels.size, region.pixelCount, `${region.id} pixel count mismatch`);
    const start = pixels.values().next().value;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % info.width;
      const neighbors = [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= info.width * info.height) continue;
        if ((neighbor === pixel - 1 && x === 0) || (neighbor === pixel + 1 && x === info.width - 1)) continue;
        if (pixels.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
      }
    }
    assert.equal(seen.size, pixels.size, `${region.id} contains a gap or detached fragment`);
  }
});

test("all store entry points carry the selected model and no runtime hard-codes Model 1", () => {
  const catalog = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const productPage = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  const standalone = fs.readFileSync(path.join(root, "coloring-game.js"), "utf8");
  assert.match(catalog, /data-coloring-url="\/coloring-game\?design=\$\{encodeURIComponent\(coloringDesignId\)\}"/);
  assert.equal((catalog.match(/data-coloring-url="\/coloring-game\?design=\$\{encodeURIComponent\(coloringDesignId\)\}"/g) || []).length, 2);
  assert.doesNotMatch(catalog, /loadLayer\("\/coloring\/yota-01\//);
  assert.match(productPage, /data-selected-coloring-model-id=/);
  assert.match(productPage, /panel\.dataset\.loadedColoringModelId = activeModelId/);
  assert.doesNotMatch(standalone, /\|\| designs\[0\]/);
  assert.match(standalone, /Coloring model mismatch: selected=/);
  assert.match(standalone, /requestId !== state\.loadRequest/);
});

test("Model 8 exists in the store and resolves to Model 8", async () => {
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const product = products.find((item) => item.name === "صليب يوتا مادلية موديل 8");
  assert.ok(product, "Model 8 product is missing from the catalog");
  const registry = await import(`${registryUrl}?catalog=${Date.now()}`);
  const configured = registry.withYotaColoringConfig(product);
  assert.equal(configured.coloringModelId, "yota-08");
  assert.match(configured.coloringMaskUrl, /\/coloring\/yota-08\/regions\.png/);
});

test("Model 9 has 42 connected regions in ten four-way rotational groups", async () => {
  const directory = path.join(root, "coloring", "yota-09");
  const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  assert.equal(regionData.totalRegions, 42);
  assert.equal(Object.keys(overrides.logicalShapes).length, 42);
  assert.equal(Object.keys(overrides.similarShapeGroups).length, 10);
  assert.ok(Object.values(overrides.similarShapeGroups).every((members) => members.length === 4));
  const productSource = path.join(root, "assets", "optimized", "products", "gallery", "product-1-99-20260706000851-a4d842.webp");
  const [sourcePixels, basePixels] = await Promise.all([
    sharp(productSource).removeAlpha().raw().toBuffer(),
    sharp(path.join(directory, "base.png")).removeAlpha().raw().toBuffer()
  ]);
  assert.deepEqual(basePixels, sourcePixels, "Model 9 base must preserve the actual product image pixel-for-pixel");
  const { data, info } = await sharp(path.join(directory, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelsByColor = new Map();
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    if (!data[offset + 3]) continue;
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    if (!pixelsByColor.has(key)) pixelsByColor.set(key, new Set());
    pixelsByColor.get(key).add(pixel);
  }
  assert.equal(pixelsByColor.size, 42);
  for (const region of regionData.regions) {
    const pixels = pixelsByColor.get(region.maskColor.join(","));
    assert.equal(pixels.size, region.pixelCount, `${region.id} pixel count mismatch`);
    const start = pixels.values().next().value;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % info.width;
      for (const neighbor of [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width]) {
        if (neighbor < 0 || neighbor >= info.width * info.height) continue;
        if ((neighbor === pixel - 1 && x === 0) || (neighbor === pixel + 1 && x === info.width - 1)) continue;
        if (pixels.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
      }
    }
    assert.equal(seen.size, pixels.size, `${region.id} has a gap or detached island`);
  }
});

test("Model 9 exists in the store and resolves explicitly to yota-09", async () => {
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const product = products.find((item) => item.name === "صليب يوتا مادلية موديل 9");
  assert.ok(product, "Model 9 product is missing from the catalog");
  const registry = await import(`${registryUrl}?catalog9=${Date.now()}`);
  const configured = registry.withYotaColoringConfig(product);
  assert.equal(configured.coloringModelId, "yota-09");
  assert.equal(configured.coloringBaseImageUrl, "/coloring/yota-09/base.png?v=yota-09-v2");
  assert.equal(configured.coloringMaskUrl, "/coloring/yota-09/regions.png?v=yota-09-v2");
});

test("Model 10 has 59 connected regions in fourteen four-way rotational groups", async () => {
  const directory = path.join(root, "coloring", "yota-10");
  const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  assert.equal(regionData.totalRegions, 59);
  assert.equal(Object.keys(overrides.logicalShapes).length, 59);
  assert.equal(Object.keys(overrides.similarShapeGroups).length, 14);
  assert.ok(Object.values(overrides.similarShapeGroups).every((members) => members.length === 4));
  const productSource = path.join(root, "assets", "optimized", "products", "gallery", "product-1-1010-20260706000934-a00e6c.webp");
  const [sourcePixels, basePixels] = await Promise.all([
    sharp(productSource).removeAlpha().raw().toBuffer(),
    sharp(path.join(directory, "base.png")).removeAlpha().raw().toBuffer()
  ]);
  assert.deepEqual(basePixels, sourcePixels, "Model 10 base must preserve the actual product image pixel-for-pixel");
  const { data, info } = await sharp(path.join(directory, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelsByColor = new Map();
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    if (!data[offset + 3]) continue;
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    if (!pixelsByColor.has(key)) pixelsByColor.set(key, new Set());
    pixelsByColor.get(key).add(pixel);
  }
  assert.equal(pixelsByColor.size, 59);
  for (const region of regionData.regions) {
    const pixels = pixelsByColor.get(region.maskColor.join(","));
    assert.equal(pixels.size, region.pixelCount, `${region.id} pixel count mismatch`);
    const start = pixels.values().next().value, seen = new Set([start]), queue = [start];
    while (queue.length) {
      const pixel = queue.pop(), x = pixel % info.width;
      for (const neighbor of [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width]) {
        if (neighbor < 0 || neighbor >= info.width * info.height) continue;
        if ((neighbor === pixel - 1 && x === 0) || (neighbor === pixel + 1 && x === info.width - 1)) continue;
        if (pixels.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
      }
    }
    assert.equal(seen.size, pixels.size, `${region.id} has a gap or detached island`);
  }
});

test("Models 9 and 10 resolve independently and use different physical designs", async () => {
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const registry = await import(`${registryUrl}?catalog10=${Date.now()}`);
  const model9 = registry.withYotaColoringConfig(products.find((item) => item.name === "صليب يوتا مادلية موديل 9"));
  const model10 = registry.withYotaColoringConfig(products.find((item) => item.name === "صليب يوتا مادلية موديل 10"));
  assert.equal(model9.coloringModelId, "yota-09");
  assert.equal(model10.coloringModelId, "yota-10");
  assert.equal(model10.coloringBaseImageUrl, "/coloring/yota-10/base.png?v=yota-10-v2");
  assert.notEqual(digest(path.join(root, "coloring", "yota-09", "base.png")), digest(path.join(root, "coloring", "yota-10", "base.png")));
  assert.notEqual(digest(path.join(root, "coloring", "yota-09", "regions.png")), digest(path.join(root, "coloring", "yota-10", "regions.png")));
});

test("Model 11 resolves independently with 38 logical regions and nine rotational groups", async () => {
  const directory = path.join(root, "coloring", "yota-11");
  const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  assert.equal(regionData.modelId, "yota-11");
  assert.equal(regionData.totalRegions, 38);
  assert.equal(Object.keys(overrides.logicalShapes).length, 38);
  assert.equal(Object.keys(overrides.similarShapeGroups).length, 9);
  assert.ok(Object.values(overrides.similarShapeGroups).every((members) => members.length === 4));
  const productSource = path.join(root, "assets", "optimized", "products", "gallery", "product-1-1111-20260706001045-b19fff.webp");
  const [sourcePixels, basePixels] = await Promise.all([sharp(productSource).removeAlpha().raw().toBuffer(), sharp(path.join(directory, "base.png")).removeAlpha().raw().toBuffer()]);
  assert.deepEqual(basePixels, sourcePixels, "Model 11 base must preserve its actual product image pixel-for-pixel");
  const { data, info } = await sharp(path.join(directory, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelsByColor = new Map();
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels; if (!data[offset + 3]) continue;
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    if (!pixelsByColor.has(key)) pixelsByColor.set(key, new Set()); pixelsByColor.get(key).add(pixel);
  }
  assert.equal(pixelsByColor.size, 38);
  for (const region of regionData.regions) {
    const pixels = pixelsByColor.get(region.maskColor.join(","));
    assert.equal(pixels.size, region.pixelCount, `${region.id} pixel count mismatch`);
    const start = pixels.values().next().value, seen = new Set([start]), queue = [start];
    while (queue.length) {
      const pixel = queue.pop(), x = pixel % info.width;
      for (const neighbor of [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width]) {
        if (neighbor < 0 || neighbor >= info.width * info.height) continue;
        if ((neighbor === pixel - 1 && x === 0) || (neighbor === pixel + 1 && x === info.width - 1)) continue;
        if (pixels.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
      }
    }
    if (!new Set(["region-1", "region-17"]).has(region.id)) {
      assert.equal(seen.size, pixels.size, `${region.id} has a gap or detached island`);
    }
  }
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const product = products.find((item) => item.name === "صليب يوتا مادلية موديل 11");
  const registry = await import(`${registryUrl}?catalog11=${Date.now()}`);
  const configured = registry.withYotaColoringConfig(product);
  assert.equal(configured.coloringModelId, "yota-11");
  assert.equal(configured.coloringBaseImageUrl, "/coloring/yota-11/base.png?v=yota-11-v5");
  assert.notEqual(digest(path.join(root, "coloring", "yota-11", "regions.png")), digest(path.join(root, "coloring", "yota-10", "regions.png")));
});

test("Model 12 resolves independently with 58 regions and fourteen rotational groups", async () => {
  const directory = path.join(root, "coloring", "yota-12");
  const regionData = JSON.parse(fs.readFileSync(path.join(directory, "regions.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "region-overrides.json"), "utf8"));
  assert.equal(regionData.modelId, "yota-12");
  assert.equal(regionData.totalRegions, 58);
  assert.equal(Object.keys(overrides.logicalShapes).length, 58);
  assert.equal(Object.keys(overrides.similarShapeGroups).length, 14);
  assert.ok(Object.values(overrides.similarShapeGroups).every((members) => members.length === 4));
  const productSource = path.join(root, "assets", "optimized", "products", "gallery", "product-1-1212-20260706001137-05ea06.webp");
  const [sourcePixels, basePixels] = await Promise.all([sharp(productSource).removeAlpha().raw().toBuffer(), sharp(path.join(directory, "base.png")).removeAlpha().raw().toBuffer()]);
  assert.deepEqual(basePixels, sourcePixels, "Model 12 base must preserve its actual product image pixel-for-pixel");
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const product = products.find((item) => item.name === "صليب يوتا مادلية موديل 12");
  const registry = await import(`${registryUrl}?catalog12=${Date.now()}`);
  const configured = registry.withYotaColoringConfig(product);
  assert.equal(configured.coloringModelId, "yota-12");
  assert.equal(configured.coloringBaseImageUrl, "/coloring/yota-12/base.png?v=yota-12-v2");
  assert.notEqual(digest(path.join(directory, "regions.png")), digest(path.join(root, "coloring", "yota-11", "regions.png")));
});
