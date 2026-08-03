import test from "node:test";
import assert from "node:assert/strict";
import {
  createAirtableOrderDetails,
  createOrderResponse,
  escapeAirtableFormulaString,
  normalizeOrderItems,
  resolveAirtableProducts
} from "../cloudflare-worker.js";

const env = { AIRTABLE_BASE_ID: "appTest", AIRTABLE_TOKEN: "secret" };

test("normalizes one item and keeps quantity as one detail row", () => {
  const result = normalizeOrderItems(JSON.stringify([
    { sku: "SKU-1", quantity: 3, price: 25, lineTotal: 75 }
  ]));
  assert.deepEqual(result, {
    items: [{
      sku: "SKU-1",
      websiteProductId: "",
      variantId: "",
      productName: "منتج بدون اسم",
      image: "",
      option: "",
      notes: "",
      quantity: 3,
      unitPrice: 25
    }],
    errors: []
  });
});

test("accepts a permanent product id when SKU is missing", () => {
  const valid = normalizeOrderItems([{ productId: "SITE-1", name: "No SKU", quantity: 1, price: 10 }]);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.items[0].sku, "");
  assert.equal(valid.items[0].productName, "No SKU");

  const invalid = normalizeOrderItems([{ sku: "", quantity: 0, price: 10 }]);
  assert.deepEqual(invalid.errors, ["products[0].productId", "products[0].quantity"]);
});

test("escapes Airtable formula string characters", () => {
  assert.equal(escapeAirtableFormulaString("A'B\\C"), "A\\'B\\\\C");
});

test("resolves exact SKUs and keeps missing or unknown SKUs as unresolved items", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const formula = new URL(url).searchParams.get("filterByFormula");
    const records = formula.includes("SKU-1") ? [{ id: "recProduct1" }] : [];
    return new Response(JSON.stringify({ records }), { status: 200 });
  };
  try {
    const resolved = await resolveAirtableProducts(env, [
      { sku: "SKU-1", productName: "Linked", option: "", notes: "", quantity: 1, unitPrice: 10 },
      { sku: "", productName: "Missing", option: "أحمر", notes: "", quantity: 2, unitPrice: 20 },
      { sku: "MISSING", productName: "Unknown", option: "", notes: "", quantity: 1, unitPrice: 30 }
    ], { requestId: "req-1" });
    assert.equal(resolved.length, 3);
    assert.equal(resolved[0].productId, "recProduct1");
    assert.equal(resolved[0].unresolved, false);
    assert.equal(resolved[1].productId, "");
    assert.match(resolved[1].detailNote, /Missing \| الاختيار: أحمر \| SKU: غير مضاف \| يحتاج ربط يدوي بالمنتج/);
    assert.equal(resolved[2].productId, "");
    assert.match(resolved[2].detailNote, /Unknown \| SKU: MISSING \| يحتاج ربط يدوي بالمنتج/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates and links a catalog product by permanent website id when SKU is absent", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (init.method === "POST") return new Response(JSON.stringify({ records: [{ id: "recPermanent" }] }));
    return new Response(JSON.stringify({ records: [] }));
  };
  try {
    const [resolved] = await resolveAirtableProducts(env, [{
      sku: "",
      websiteProductId: "site-product-42",
      productName: "Permanent product",
      image: "",
      option: "",
      notes: "",
      quantity: 1,
      unitPrice: 55
    }], { requestId: "req-permanent" });
    assert.equal(resolved.productId, "recPermanent");
    assert.equal(resolved.unresolved, false);
    const createBody = JSON.parse(requests.find((request) => request.init.method === "POST").init.body);
    assert.equal(createBody.records[0].fields["كود المنتج SKU"], "site-product-42");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates linked detail rows in batches of ten with unit prices", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    return new Response(JSON.stringify({
      records: body.records.map((_, index) => ({ id: `recDetail${requests.length}-${index}` }))
    }), { status: 200 });
  };
  try {
    const items = Array.from({ length: 12 }, (_, index) => ({
      sku: `SKU-${index}`,
      productId: `recProduct${index}`,
      productName: `Product ${index}`,
      quantity: index === 0 ? 3 : 1,
      unitPrice: 20 + index
    }));
    const ids = await createAirtableOrderDetails(env, "recOrder1", items, { requestId: "req-3" });
    assert.deepEqual(requests.map((request) => request.records.length), [10, 2]);
    assert.equal(ids.length, 12);
    assert.deepEqual(requests[0].records[0].fields, {
      "رقم الأوردر": ["recOrder1"],
      "المنتج": ["recProduct0"],
      "الكمية": 3,
      "سعر القطعة": 20
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refuses to create a detail row without a product name", async () => {
  const originalFetch = globalThis.fetch;
  let submitted;
  globalThis.fetch = async (_url, init) => {
    submitted = JSON.parse(init.body);
    return new Response(JSON.stringify({ records: [{ id: "recDetailUnresolved" }] }), { status: 200 });
  };
  try {
    await assert.rejects(createAirtableOrderDetails(env, "recOrder1", [{
      productId: "",
      quantity: 1,
      unitPrice: 65,
      detailNote: "منتج غير مربوط: نوت بوك | SKU: غير مضاف | يحتاج ربط يدوي بالمنتج"
    }], { requestId: "req-unresolved" }), { code: "airtable_product_name_missing" });
    assert.equal(submitted, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mixed SKU and permanent-id checkout links every row and retries safely", async () => {
  const state = new Map();
  const database = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          const row = state.get(this.values[0]);
          return row ? { ...row } : null;
        },
        async run() {
          if (sql.includes("CREATE TABLE")) return { meta: { changes: 0 } };
          if (sql.includes("INSERT OR IGNORE")) {
            const requestId = this.values[0];
            if (state.has(requestId)) return { meta: { changes: 0 } };
            state.set(requestId, { status: "processing", airtable_order_id: "", detail_count: 0 });
            return { meta: { changes: 1 } };
          }
          const requestId = this.values.at(-1);
          const row = state.get(requestId);
          if (sql.includes("status = 'order_created', airtable_order_id")) {
            Object.assign(row, { status: "order_created", airtable_order_id: this.values[0] });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("status = 'details_processing'")) {
            if (row.status !== "order_created") return { meta: { changes: 0 } };
            row.status = "details_processing";
            return { meta: { changes: 1 } };
          }
          if (sql.includes("status = 'completed'")) {
            Object.assign(row, { status: "completed", detail_count: this.values[0] });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  let orderCreates = 0;
  let detailCreates = 0;
  let orderRequest;
  let detailRequest;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (!init.method && path.includes(encodeURIComponent("المنتجات"))) {
      return new Response(JSON.stringify({ records: [{ id: "recProduct1" }] }));
    }
    if (path.includes(encodeURIComponent("تفاصيل الطلبات"))) {
      detailCreates += 1;
      detailRequest = JSON.parse(init.body);
      return new Response(JSON.stringify({
        records: detailRequest.records.map((_, index) => ({ id: `recDetail${index + 1}` }))
      }));
    }
    orderCreates += 1;
    orderRequest = JSON.parse(init.body);
    return new Response(JSON.stringify({ records: [{ id: "recOrder1" }] }));
  };
  const payload = {
    requestId: "retry-1",
    customerName: "Test Customer",
    phone: "01000000000",
    address: "Cairo",
    paymentMethod: "InstaPay",
    deliveryType: "Shipping",
    products: JSON.stringify([
      { sku: "SKU-1", name: "Linked Item", quantity: 1, price: 10 },
      { productId: "SITE-2", name: "Permanent ID Item", option: "وسط", quantity: 2, price: 20 }
    ]),
    total: 50
  };
  const makeContext = () => ({
    request: new Request("https://popekyrillos.store/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": "retry-1" },
      body: JSON.stringify(payload)
    }),
    env: { ...env, AIRTABLE_TABLE_NAME: "Orders", ANALYTICS_DB: database }
  });
  try {
    const first = await createOrderResponse(makeContext());
    const retry = await createOrderResponse(makeContext());
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).duplicate, true);
    assert.equal(orderCreates, 1);
    assert.equal(detailCreates, 1);
    assert.equal(detailRequest.records.length, 2);
    assert.deepEqual(detailRequest.records[0].fields["المنتج"], ["recProduct1"]);
    assert.deepEqual(detailRequest.records[1].fields["المنتج"], ["recProduct1"]);
    assert.deepEqual(detailRequest.records[0].fields["رقم الأوردر"], ["recOrder1"]);
    assert.equal(orderRequest.records[0].fields["Missing Info"], "لا يوجد");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("detail creation failure never returns checkout success", async () => {
  const state = new Map();
  const database = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          const row = state.get(this.values[0]);
          return row ? { ...row } : null;
        },
        async run() {
          if (sql.includes("CREATE TABLE")) return { meta: { changes: 0 } };
          if (sql.includes("INSERT OR IGNORE")) {
            state.set(this.values[0], { status: "processing", airtable_order_id: "", detail_count: 0 });
            return { meta: { changes: 1 } };
          }
          const requestId = this.values.at(-1);
          const row = state.get(requestId);
          if (sql.includes("status = 'order_created', airtable_order_id")) {
            Object.assign(row, { status: "order_created", airtable_order_id: this.values[0] });
          } else if (sql.includes("status = 'details_processing'")) {
            row.status = "details_processing";
          } else if (sql.includes("SET status = 'order_created'")) {
            row.status = "order_created";
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    if (!init.method && pathname.includes(encodeURIComponent("المنتجات"))) {
      return new Response(JSON.stringify({ records: [{ id: "recProduct1" }] }));
    }
    if (pathname.includes(encodeURIComponent("تفاصيل الطلبات"))) {
      return new Response(JSON.stringify({ error: { type: "DETAILS_FAILED" } }), { status: 500 });
    }
    return new Response(JSON.stringify({ records: [{ id: "recOrder1" }] }));
  };
  const requestId = "details-fail-1";
  const context = {
    request: new Request("https://popekyrillos.store/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        requestId,
        customerName: "Test Customer",
        phone: "01000000000",
        address: "Cairo",
        paymentMethod: "InstaPay",
        deliveryType: "Shipping",
        products: JSON.stringify([{ sku: "SKU-1", name: "Linked Item", quantity: 1, price: 10 }]),
        total: 10
      })
    }),
    env: { ...env, AIRTABLE_TABLE_NAME: "Orders", ANALYTICS_DB: database }
  };
  try {
    const response = await createOrderResponse(context);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, undefined);
    assert.equal(state.get(requestId).status, "order_created");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
