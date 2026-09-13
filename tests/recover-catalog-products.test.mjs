import test from "node:test";
import assert from "node:assert/strict";
import { recoverMissingProducts } from "../scripts/recover-catalog-products.mjs";

test("catalog recovery never overwrites any field on an existing product", () => {
  const current = [{
    id: "existing",
    name: "Newest name",
    price: 50,
    stock: "متاح",
    images: ["new.webp"],
    variants: [{ id: "v1", price: 50, quantity: 9 }],
    collections: ["greek-vessels"]
  }];
  const historical = [
    {
      id: "existing",
      name: "Old name",
      price: 70,
      stock: "غير متاح حاليا",
      images: ["old.webp"],
      variants: [{ id: "v1", price: 70, quantity: 1 }],
      collections: []
    },
    { id: "missing", name: "Recovered product", price: 100 }
  ];

  const snapshot = structuredClone(current[0]);
  const { merged, recovered } = recoverMissingProducts(current, historical);

  assert.deepEqual(merged[0], snapshot);
  assert.strictEqual(merged[0], current[0]);
  assert.deepEqual(recovered.map((product) => product.id), ["missing"]);
  assert.deepEqual(merged.map((product) => product.id), ["existing", "missing"]);
});
