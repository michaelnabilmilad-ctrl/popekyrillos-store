import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "..");
const products = JSON.parse(fs.readFileSync(path.join(rootDir, "products.json"), "utf8"));
const crossSets = products.filter((product) => product.id.startsWith("popek-corian-cross-set-"));

test("POPEK cross sets include all 22 models in numeric order", () => {
  assert.equal(crossSets.length, 22);
  assert.deepEqual(
    crossSets.map((product) => Number(product.id.split("-").at(-1))),
    Array.from({ length: 22 }, (_, index) => index + 1),
  );
});

test("every POPEK cross set has the requested price, description, taxonomy, and paired images", () => {
  for (const product of crossSets) {
    assert.equal(product.price, 770);
    assert.equal(product.variants[0].price, 770);
    assert.match(product.description, /الكوريان/);
    assert.match(product.description, /بديل الرخام/);
    assert.match(product.description, /21–22 سم/);
    assert.equal(product.mainCategory, "الصلبان");
    assert.equal(product.subcategory, "hand-crosses");
    assert.equal(product.images.length, 2);
    assert.match(product.images[0], /-boxed\.webp$/);
    assert.match(product.images[1], /-unboxed\.webp$/);
    for (const image of product.images) {
      assert.ok(fs.existsSync(path.join(rootDir, image)), `Missing ${image}`);
    }
  }
});
