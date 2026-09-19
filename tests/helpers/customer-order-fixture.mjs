import { DatabaseSync } from "node:sqlite";

export function d1Database() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; }
      };
    }
  };
}

// Models the live Airtable script automation. Cancellation movements carry a
// deterministic marker so a retry can repair the flag without restoring twice.
export function airtableFixture() {
  const env = { AIRTABLE_TOKEN: "test-secret", AIRTABLE_BASE_ID: "appTest", AIRTABLE_TABLE_NAME: "Orders", ANALYTICS_DB: d1Database() };
  const orders = new Map();
  const details = [];
  const movements = [];
  const writes = [];
  let next = 0;
  const record = (status = "قيد التجهيز", fields = {}) => {
    const id = `rec${String(++next).padStart(14, "0")}`;
    const order = { id, createdTime: "2026-08-01T12:00:00Z", fields: { "Order ID": next, "Customer Name": "عميل الاختبار", Phone: "01012345678", "Order Status": status, "Payment Status": "غير مدفوع", "Delivery Type": "شحن", Products: "كتاب أصلي | SKU: BOOK-1 | الكمية: 1 | السعر النهائي: 120 ج.م | الإجمالي: 120 ج.م", Total: 120, Notes: "العنوان: القاهرة | ملاحظة محفوظة", ...fields } };
    orders.set(id, order);
    return order;
  };
  const addDetail = (order, deducted = true, restored = false) => {
    const row = { id: `recDetail${details.length}`, fields: { "رقم البند": details.length + 1, "رقم الأوردر": [order.id], "المنتج": ["recProduct00000001"], "الكمية": 1, "سعر القطعة": 120, "الإجمالي": 120, "تم خصم المخزون؟": deducted, "تم إرجاع المخزون؟": restored } };
    details.push(row); return row;
  };
  const fixture = { env, orders, details, movements, writes, record, addDetail, stock: 9, beforeRead: null, failPatchAfterCommit: false, failReturnFlagOnce: false, failNextReceipt: false, creates: 0,
    runReturnAutomation(row, { failFlagUpdate = false } = {}) {
      const f = row.fields;
      if (f["تم إرجاع المخزون؟"]) return "already-returned";
      if (!f["تم خصم المخزون؟"] || !f["المنتج"]?.length || !(f["الكمية"] > 0)) return "not-eligible";
      const key = `cancel-return:${row.id}`;
      let movement = movements.find(item => item.key === key);
      if (!movement) {
        movement = { order: f["رقم الأوردر"][0], product: f["المنتج"][0], quantity: f["الكمية"], type: "مرتجع عميل", key, notes: "إرجاع تلقائي للمخزون بسبب إلغاء الأوردر" };
        movements.push(movement);
        fixture.stock += f["الكمية"];
      }
      if (failFlagUpdate) return "movement-created-flag-failed";
      f["تم إرجاع المخزون؟"] = true;
      return movement ? "completed" : "repaired-returned-flag";
    },
    async fetch(input, init = {}) {
      const url = new URL(input);
      if (url.hostname !== "api.airtable.com") throw new Error("Unexpected external request");
      const [, , , table, id] = decodeURIComponent(url.pathname).split("/");
      const method = init.method || "GET";
      if (method !== "GET") writes.push({ table, method, body: init.body });
      if (table === "Orders") {
        if (method === "GET") {
          if (fixture.beforeRead) await fixture.beforeRead(id);
          if (id) return Response.json(orders.get(id) || {}, { status: orders.has(id) ? 200 : 404 });
          const number = Number(url.searchParams.get("filterByFormula")?.split("=")[1]);
          return Response.json({ records: [...orders.values()].filter(row => row.fields["Order ID"] === number) });
        }
        if (method === "POST") {
          fixture.creates++;
          const created = record("جديد", JSON.parse(init.body).records[0].fields);
          return Response.json({ records: [created] });
        }
        if (method === "PATCH") {
          const order = orders.get(id);
          const oldStatus = order.fields["Order Status"];
          Object.assign(order.fields, JSON.parse(init.body).fields);
          if (oldStatus !== "ملغي" && order.fields["Order Status"] === "ملغي") {
            for (const row of details.filter(row => row.fields["رقم الأوردر"].includes(id))) {
              fixture.runReturnAutomation(row, { failFlagUpdate: fixture.failReturnFlagOnce });
              fixture.failReturnFlagOnce = false;
            }
          }
          if (fixture.failPatchAfterCommit) throw new Error("Lost response with secret recPrivate123456789");
          return Response.json(order);
        }
      }
      if (table === "تفاصيل الطلبات") {
        if (method === "GET") return Response.json({ records: details }); // Also tests exact link filtering.
        if (method === "POST") {
          const rows = JSON.parse(init.body).records.map(row => ({ id: `recDetail${details.length}`, ...row }));
          details.push(...rows); return Response.json({ records: rows });
        }
      }
      if (table === "المنتجات" && method === "GET") return Response.json({ records: [{ id: "recProduct00000001", fields: { "اسم المنتج": "اسم جديد", "سعر البيع": 150 } }] });
      throw new Error(`Unexpected ${method} ${table}`);
    }
  };
  return fixture;
}
