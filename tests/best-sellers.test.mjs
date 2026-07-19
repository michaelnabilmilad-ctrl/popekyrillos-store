import test from "node:test";
import assert from "node:assert/strict";
import { calculateBestSellers } from "../functions/api/best-sellers.js";

const product = (recordId, id, name, extra = {}) => ({
  id: recordId,
  createdTime: extra.createdTime || "2026-01-01T00:00:00.000Z",
  fields: {
    "Product ID": id,
    Name: name,
    Image: [{ url: `https://example.com/${id}.webp` }],
    Price: 100,
    Stock: 5,
    Published: true,
    ...extra
  }
});

const order = (id, orderId, status, paymentStatus = "") => ({
  id,
  fields: { "Order ID": orderId, "Order Status": status, "Payment Status": paymentStatus }
});

const item = (id, orderRecordId, productRecordId, quantity, extra = {}) => ({
  id,
  fields: { Order: [orderRecordId], Product: [productRecordId], Quantity: quantity, ...extra }
});

test("aggregates quantities by linked Product ID and keeps separate products with identical names", () => {
  const products = [product("recP1", "p-1", "نفس الاسم"), product("recP2", "p-2", "نفس الاسم")];
  const orders = [order("recO1", "A-1", "Confirmed"), order("recO2", "A-2", "تم الدفع")];
  const orderItems = [item("recI1", "recO1", "recP1", 2), item("recI2", "recO2", "recP1", 3), item("recI3", "recO1", "recP2", 1)];
  const result = calculateBestSellers({ orders, orderItems, products });
  assert.equal(result[0].id, "p-1");
  assert.equal(result[0].totalQuantity, 5);
  assert.equal(result[1].id, "p-2");
  assert.equal(result[1].totalQuantity, 1);
});

test("excludes cancelled, refunded and test orders even if another accepted status is present", () => {
  const products = [product("recP1", "p-1", "منتج")];
  const orders = [
    order("recO1", "A-1", "Cancelled", "Paid"),
    order("recO2", "A-2", "مرتجع"),
    order("recO3", "A-3", "تجريبي")
  ];
  const orderItems = orders.map((entry, index) => item(`recI${index}`, entry.id, "recP1", 10));
  const result = calculateBestSellers({ orders, orderItems, products });
  assert.deepEqual(result, []);
});

test("removes unpublished or imageless sold products without inventing fallback sales", () => {
  const products = [
    product("recP1", "p-1", "محذوف", { Published: false }),
    product("recP2", "p-2", "بدون صورة", { Image: [] }),
    product("recP3", "p-3", "الأحدث", { createdTime: "2026-04-01T00:00:00.000Z" })
  ];
  const orders = [order("recO1", "A-1", "Completed")];
  const orderItems = [item("recI1", "recO1", "recP1", 20), item("recI2", "recO1", "recP2", 10)];
  const result = calculateBestSellers({ orders, orderItems, products });
  assert.deepEqual(result, []);
});

test("returns only the highest-selling product from each main category", () => {
  const products = [
    product("recP1", "p-1", "صليب أول", { "Main Category": "الصلبان والهدايا" }),
    product("recP2", "p-2", "صليب ثان", { "Main Category": "الصلبان والهدايا" }),
    product("recP3", "p-3", "كتاب", { "Main Category": "الكتب والطقوس" })
  ];
  const orders = [order("recO1", "A-1", "Completed")];
  const orderItems = [
    item("recI1", "recO1", "recP1", 4),
    item("recI2", "recO1", "recP2", 9),
    item("recI3", "recO1", "recP3", 6)
  ];
  const result = calculateBestSellers({ orders, orderItems, products });
  assert.deepEqual(result.map((entry) => [entry.id, entry.category, entry.totalQuantity]), [
    ["p-2", "الصلبان والهدايا", 9],
    ["p-3", "الكتب والطقوس", 6]
  ]);
});
