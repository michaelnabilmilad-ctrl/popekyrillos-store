const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
const rawProduct = products.find((item) => item.id === "custom-1782980654479");

async function configuredProduct() {
  const registry = await import(`${pathToFileURL(path.join(root, "coloringDesigns.js")).href}?mask-audit=${Date.now()}`);
  return registry.withYotaColoringConfig(rawProduct);
}

test("coloring product declares aligned base, mask, outline, regions and symmetry", async () => {
  const product = await configuredProduct();
  assert.ok(product?.coloringBaseImageUrl);
  assert.ok(product?.coloringMaskUrl);
  assert.ok(product?.coloringOutlineUrl);
  assert.ok(product?.coloringRegionsUrl);

  const file = (url) => path.join(root, url.split("?")[0].replace(/^\//, ""));
  const [base, mask, outline] = await Promise.all([
    sharp(file(product.coloringBaseImageUrl)).metadata(),
    sharp(file(product.coloringMaskUrl)).metadata(),
    sharp(file(product.coloringOutlineUrl)).metadata()
  ]);
  assert.deepEqual([mask.width, mask.height], [base.width, base.height]);
  assert.deepEqual([outline.width, outline.height], [base.width, base.height]);
});

test("mask contains only exact declared RGB values with no anti-alias colors", async () => {
  const product = await configuredProduct();
  const regionData = JSON.parse(fs.readFileSync(path.join(root, product.coloringRegionsUrl.split("?")[0].replace(/^\//, "")), "utf8"));
  const maskPath = path.join(root, product.coloringMaskUrl.split("?")[0].replace(/^\//, ""));
  const { data, info } = await sharp(maskPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const allowed = new Set(["0,0,0", ...regionData.regions.map((region) => region.maskColor.join(","))]);
  const found = new Set();
  for (let index = 0; index < data.length; index += 3) {
    const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    assert.ok(allowed.has(key), `Unexpected mask color ${key}`);
    found.add(key);
  }
  regionData.regions.forEach((region) => assert.ok(found.has(region.maskColor.join(",")), `${region.id} is missing from mask`));
});

test("runtime coloring code does not use flood fill, tolerance, or edge detection", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.doesNotMatch(source, /flood\s*fill|floodFill|tolerance|edge\s*detection/i);
  assert.match(source, /regionByMaskKey/);
  assert.doesNotMatch(source, /globalCompositeOperation = "multiply"/);
  assert.match(source, /renderColoringArtwork/);
});

test("product quick view uses the storefront search normalizer", () => {
  const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const start = source.indexOf("function isIotaMedalProduct");
  const end = source.indexOf("function coloringGameHtml", start);
  const detector = source.slice(start, end);
  assert.match(detector, /normalizeSearchText\(/);
  assert.doesNotMatch(detector, /normalizedSearch\(/);
});
