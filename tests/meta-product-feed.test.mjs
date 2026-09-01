import assert from "node:assert/strict";
import test from "node:test";
import { metaProductFeedCsv } from "../cloudflare-worker.js";

test("Meta CSV feed is UTF-8, escaped, stable, and skips invalid products", () => {
  const products = [{
    id: "permanent-1", sku: "SKU-1", name: "منتج، \"مميز\"",
    description: "سطر أول\nسطر ثان", price: 84, stock: "متاح",
    image: "/assets/products/example.jpg", slug: "منتج-مميز", mainCategory: "هدايا"
  }, { id: "invalid", name: "بلا صورة", price: 20 }];
  const result = metaProductFeedCsv(products);
  assert.equal(result.includedCount, 1);
  assert.deepEqual(result.excluded, [{ id: "invalid", reasons: ["missing valid image"] }]);
  assert.ok(result.csv.startsWith("\uFEFFid,title,description,availability,condition,price,link,image_link,brand,product_type\r\n"));
  assert.match(result.csv, /^SKU-1,"منتج، ""مميز""","سطر أول\nسطر ثان",in stock,new,84\.00 EGP,/m);
  assert.match(result.csv, /https:\/\/popekyrillos\.store\/products\/%D9%85%D9%86%D8%AA%D8%AC-%D9%85%D9%85%D9%8A%D8%B2/);
  assert.match(result.csv, /https:\/\/popekyrillos\.store\/assets\/products\/example\.jpg/);
});
