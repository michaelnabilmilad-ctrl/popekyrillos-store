import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const expectedPrices = {
  "صغير 13*19 سم": 70,
  "متوسط 15*22 سم": 90,
  "كبير بيد 20*30 سم": 140,
};

for (const productsFile of ["products.json", "firebase-functions/products.json", "dist/products.json"]) {
  test(`${productsFile}: every Bible-cover size and color has the correct price`, () => {
    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const product = products.find(({ id }) => id === "old-10121173303603");

    assert.ok(product, "Bible-cover product must exist");
    assert.equal(product.price, 70);
    assert.equal(product.priceNote, "يبدأ من ٧٠ ج.م حتى ١٤٠ ج.م");
    assert.equal(product.variants.length, 24);

    for (const [size, expectedPrice] of Object.entries(expectedPrices)) {
      const variants = product.variants.filter((variant) => variant.options?.["المقاس"] === size);
      assert.equal(variants.length, 8, `${size} must have all 8 colors`);
      for (const variant of variants) {
        assert.equal(variant.price, expectedPrice, `${variant.title} has the wrong price`);
      }
    }
  });
}
