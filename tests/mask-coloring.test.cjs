const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
const product = products.find((item) => item.id === "custom-1782980654479");

test("coloring product declares aligned base, mask, outline, regions and symmetry", async () => {
  assert.ok(product?.coloringBaseImageUrl);
  assert.ok(product?.coloringMaskUrl);
  assert.ok(product?.coloringOutlineUrl);
  assert.ok(Array.isArray(product.coloringRegions) && product.coloringRegions.length > 0);
  assert.ok(Array.isArray(product.symmetryGroups) && product.symmetryGroups.length > 0);

  const file = (url) => path.join(root, url.split("?")[0]);
  const [base, mask, outline] = await Promise.all([
    sharp(file(product.coloringBaseImageUrl)).metadata(),
    sharp(file(product.coloringMaskUrl)).metadata(),
    sharp(file(product.coloringOutlineUrl)).metadata()
  ]);
  assert.deepEqual([mask.width, mask.height], [base.width, base.height]);
  assert.deepEqual([outline.width, outline.height], [base.width, base.height]);
});

test("mask contains only exact declared RGB values with no anti-alias colors", async () => {
  const maskPath = path.join(root, product.coloringMaskUrl.split("?")[0]);
  const { data, info } = await sharp(maskPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const allowed = new Set(["0,0,0", ...product.coloringRegions.map((region) => region.maskColor.join(","))]);
  const found = new Set();
  for (let index = 0; index < data.length; index += 3) {
    const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    assert.ok(allowed.has(key), `Unexpected mask color ${key}`);
    found.add(key);
  }
  product.coloringRegions.forEach((region) => assert.ok(found.has(region.maskColor.join(",")), `${region.id} is missing from mask`));
});

test("runtime coloring code does not use flood fill, tolerance, or edge detection", () => {
  const source = fs.readFileSync(path.join(root, "product-page.js"), "utf8");
  assert.doesNotMatch(source, /flood\s*fill|floodFill|tolerance|edge\s*detection/i);
  assert.match(source, /regionByMaskKey/);
  assert.match(source, /globalCompositeOperation = "multiply"/);
});

test("product quick view uses the storefront search normalizer", () => {
  const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const start = source.indexOf("function isIotaMedalProduct");
  const end = source.indexOf("function coloringGameHtml", start);
  const detector = source.slice(start, end);
  assert.match(detector, /normalizeSearchText\(/);
  assert.doesNotMatch(detector, /normalizedSearch\(/);
});
