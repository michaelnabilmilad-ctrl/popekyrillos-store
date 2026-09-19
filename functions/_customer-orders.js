// Airtable remains the order/inventory authority. D1 holds private capabilities,
// immutable website snapshots, and a journal shared by website order writers.
const CANCELLED = "ملغي";
const EARLY = new Set(["جديد", "انتظار بيانات", "انتظار الدفع", "قيد التجهيز"]);
const INVALID = "الطلب غير موجود أو بيانات الطلب غير صحيحة.";
const BUSY = "يجري تحديث الطلب أو مراجعة آخر تحديث. حاول لاحقًا أو تواصل معنا.";
const clean = value => String(value ?? "").trim();
const scope = env => `${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_NAME}`;
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
const fail = (status, message) => Object.assign(new Error(message), { publicStatus: status });
const quote = value => clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
export const publicText = value => clean(value).replace(/\brec[a-zA-Z0-9]{14,}\b/g, "[محجوب]");
export function normalizeEgyptianPhone(value) {
  let phone = clean(value).replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 1776));
  if (!/^[+\d\s().-]+$/.test(phone)) return "";
  phone = phone.replace(/[\s().-]/g, "");
  if (phone.startsWith("0020")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("+20")) phone = "0" + phone.slice(3);
  else if (phone.startsWith("20")) phone = "0" + phone.slice(2);
  return /^01[0125]\d{8}$/.test(phone) ? phone : "";
}
export function canCustomerCancelOrder(order) {
  return EARLY.has(clean(order?.fields?.["Order Status"] ?? order?.orderStatus));
}
export async function initializeCustomerOrders(env) {
  if (!env.ANALYTICS_DB || !env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_NAME) throw fail(503, "متابعة الطلبات غير متاحة مؤقتًا.");
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS customer_order_access (scope TEXT NOT NULL, order_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, snapshot TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(scope, order_id))`,
    `CREATE TABLE IF NOT EXISTS customer_order_locks (scope TEXT NOT NULL, order_id TEXT NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(scope, order_id))`,
    `CREATE TABLE IF NOT EXISTS customer_order_history (id TEXT PRIMARY KEY, scope TEXT NOT NULL, order_id TEXT NOT NULL, old_status TEXT, new_status TEXT, changed_by TEXT NOT NULL, state TEXT NOT NULL, changed_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS customer_order_rate (key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL)`
  ]) await env.ANALYTICS_DB.prepare(sql).run();
}
function tableUrl(env, table, id = "") {
  return `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${id ? "/" + encodeURIComponent(id) : ""}`;
}
async function airtable(env, table, id = "", init = {}, query = {}) {
  const url = new URL(tableUrl(env, table, id));
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw fail(response.status === 404 ? 404 : 502, response.status === 404 ? INVALID : "تعذر تحديث بيانات الطلب حاليًا. حاول لاحقًا.");
  return response.json();
}
export const readCustomerOrderRecord = (env, id) => airtable(env, env.AIRTABLE_TABLE_NAME, id);
async function accessRow(env, id) {
  return env.ANALYTICS_DB.prepare("SELECT * FROM customer_order_access WHERE scope = ? AND order_id = ?").bind(scope(env), id).first();
}
export async function ensureOrderAccess(env, id, snapshot = null) {
  await initializeCustomerOrders(env);
  await env.ANALYTICS_DB.prepare("INSERT OR IGNORE INTO customer_order_access (scope, order_id, token, snapshot) VALUES (?, ?, ?, ?)").bind(scope(env), id, randomToken(), snapshot ? JSON.stringify(snapshot) : null).run();
  // A retry may fill a missing snapshot, but never rewrite an existing purchase.
  if (snapshot) await env.ANALYTICS_DB.prepare("UPDATE customer_order_access SET snapshot = ? WHERE scope = ? AND order_id = ? AND snapshot IS NULL").bind(JSON.stringify(snapshot), scope(env), id).run();
  if (snapshot) await env.ANALYTICS_DB.prepare("INSERT OR IGNORE INTO customer_order_history (id, scope, order_id, old_status, new_status, changed_by, state, changed_at) VALUES (?, ?, ?, '', ?, 'system', 'completed', ?)").bind(`created:${scope(env)}:${id}`, scope(env), id, snapshot.orderStatus || "جديد", new Date().toISOString()).run();
  return accessRow(env, id);
}
export function purchaseSnapshot(order, items) {
  return {
    version: 1, address: order.address, deliveryType: order.deliveryType, orderStatus: order.orderStatus,
    pickupBranch: order.deliveryType === "استلام من المكتبة" ? order.address : "",
    // Existing checkout Total excludes an as-yet unquoted shipping charge.
    shippingCost: order.deliveryType === "استلام من المكتبة" ? 0 : null,
    total: order.total,
    discount: items.reduce((sum, item) => sum + (Number(item.discountValue) || 0) * item.quantity, 0),
    items: items.map(item => ({ productName: item.productName, sku: item.sku || "", productImage: item.imageUrl || item.image || "", quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.unitPrice * item.quantity, option: item.option || "" }))
  };
}
export async function checkoutReceipt(env, id, submittedPhone) {
  const record = await readCustomerOrderRecord(env, id);
  const phone = normalizeEgyptianPhone(submittedPhone);
  const matches = phone ? phone === normalizeEgyptianPhone(record.fields?.Phone) : clean(submittedPhone) && clean(submittedPhone) === clean(record.fields?.Phone);
  if (!matches) throw fail(404, INVALID);
  const access = await ensureOrderAccess(env, id);
  return { orderId: publicText(record.fields?.["Order ID"]), publicOrderToken: access.token, trackingUrl: `/order/${access.token}` };
}
function storedNumber(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const num = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}
function safeImage(value) {
  if (!clean(value)) return "";
  try {
    const url = new URL(clean(value), "https://popekyrillos.store");
    return url.protocol === "https:" && !url.username && !url.password && !/\brec[a-zA-Z0-9]{14,}\b/.test(url.href) ? url.href : "";
  } catch { return ""; }
}
function itemView(item) {
  return { productName: publicText(item.productName) || "منتج — الاسم الأصلي غير متاح", sku: publicText(item.sku), productImage: safeImage(item.productImage), quantity: storedNumber(item.quantity), unitPrice: storedNumber(item.unitPrice), lineTotal: storedNumber(item.lineTotal), option: publicText(item.option) };
}
export function legacyProductLines(value) {
  let parsed;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch {}
  if (Array.isArray(parsed)) return parsed.map(item => {
    const quantity = storedNumber(item.quantity ?? item.qty);
    const unitPrice = storedNumber(item.unitPrice ?? item.price);
    return itemView({ productName: item.name ?? item.product_name, sku: item.sku, productImage: item.image, quantity, unitPrice, lineTotal: item.lineTotal ?? (unitPrice !== null && quantity !== null ? unitPrice * quantity : null), option: item.option });
  });
  return clean(value).split(/\r?\n/).filter(Boolean).map(line => {
    const part = label => line.match(new RegExp(`(?:^|\\|)\\s*(?:${label}):\\s*([^|]+)`))?.[1]?.trim() || "";
    const number = label => storedNumber(part(label).replace(/\s*ج\.م.*$/, ""));
    const quantity = number("الكمية");
    const unitPrice = number("السعر النهائي|السعر");
    return itemView({ productName: line.split("|")[0], sku: part("SKU"), quantity, unitPrice, lineTotal: number("الإجمالي") ?? (unitPrice !== null && quantity !== null ? quantity * unitPrice : null), option: part("الاختيار|المقاس|نوع الخشب"), productImage: part("الصورة") });
  });
}
async function orderDetails(env, record) {
  const records = [];
  let offset = "";
  do {
    const query = { pageSize: "100", filterByFormula: `FIND(',${quote(record.fields["Order ID"])},', ',' & ARRAYJOIN({رقم الأوردر}, ',') & ',') > 0`, ...(offset ? { offset } : {}) };
    const data = await airtable(env, env.AIRTABLE_ORDER_DETAILS_TABLE || "تفاصيل الطلبات", "", {}, query);
    // A link formula compares display values. Always verify the actual link IDs.
    records.push(...(data.records || []).filter(row => row.fields?.["رقم الأوردر"]?.includes(record.id)));
    offset = data.offset || "";
  } while (offset);
  return records.sort((a, b) => (a.fields["رقم البند"] || 0) - (b.fields["رقم البند"] || 0));
}
export function historicalItems(record, details) {
  const lines = legacyProductLines(record.fields?.Products);
  if (!details.length) return lines;
  // Only pair a whole legacy snapshot positionally when ALL stored amounts agree.
  const pairsAgree = lines.length === details.length && details.every((row, i) => lines[i].quantity === storedNumber(row.fields["الكمية"]) && lines[i].unitPrice === storedNumber(row.fields["سعر القطعة"]));
  if (lines.length && !pairsAgree) return lines; // Incomplete/duplicate legacy detail rows must not inflate an order.
  return details.map((row, i) => {
    const f = row.fields;
    const note = clean(f["ملاحظات"]);
    const quantity = storedNumber(f["الكمية"]);
    const unitPrice = storedNumber(f["سعر القطعة"]);
    return itemView({
      ...(pairsAgree ? lines[i] : {}),
      productName: (pairsAgree && lines[i].productName) || note.match(/(?:^|\|)\s*التصميم:\s*([^|]+?)(?:\s*\([^)]*\))?(?:\s*\||$)/)?.[1],
      productImage: f["صورة المنتج المختارة"]?.[0]?.url || note.match(/الصورة:\s*(https:\/\/[^\s|]+)/)?.[1] || (pairsAgree ? lines[i].productImage : ""),
      quantity, unitPrice, lineTotal: storedNumber(f["الإجمالي"]) ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null),
      option: note.match(/(?:^|\|)\s*الاختيار:\s*([^|]+)/)?.[1] || (pairsAgree ? lines[i].option : "")
    });
  });
}
async function publicOrder(env, record, access) {
  const fields = record.fields || {};
  let snapshot = null;
  try { snapshot = JSON.parse(access.snapshot); } catch {}
  const items = snapshot?.items?.length ? snapshot.items.map(itemView) : historicalItems(record, await orderDetails(env, record));
  const notes = publicText(fields.Notes);
  const address = publicText(snapshot?.address || notes.match(/(?:^|\|)\s*العنوان:\s*([^|]+)/)?.[1]);
  const history = await env.ANALYTICS_DB.prepare("SELECT old_status, new_status, changed_by, changed_at FROM customer_order_history WHERE scope = ? AND order_id = ? AND state = 'completed' ORDER BY changed_at").bind(scope(env), record.id).all();
  return {
    orderNumber: publicText(fields["Order ID"]), createdAt: record.createdTime || fields["تاريخ الأوردر"] || "",
    customerName: publicText(fields["Customer Name"]), phone: publicText(fields.Phone), deliveryType: publicText(fields["Delivery Type"]),
    pickupBranch: publicText(snapshot?.pickupBranch || (fields["Delivery Type"] === "استلام من المكتبة" ? address : "")),
    address, notes: notes.replace(/(?:^|\|)\s*العنوان:\s*[^|]+/, "").replace(/^\s*\|\s*/, ""),
    orderStatus: publicText(fields["Order Status"]), paymentStatus: publicText(fields["Payment Status"]),
    items, shippingCost: snapshot?.shippingCost ?? (fields["Delivery Type"] === "استلام من المكتبة" ? 0 : null),
    discount: snapshot?.discount ?? null, total: storedNumber(snapshot?.total ?? fields.Total),
    canCancel: canCustomerCancelOrder(record), history: (history.results || []).map(row => ({ oldStatus: publicText(row.old_status), newStatus: publicText(row.new_status), changedBy: row.changed_by, changedAt: row.changed_at }))
  };
}
export async function acquireOrderLock(env, id) {
  await initializeCustomerOrders(env);
  const owner = randomToken();
  const result = await env.ANALYTICS_DB.prepare("INSERT OR IGNORE INTO customer_order_locks (scope, order_id, owner) VALUES (?, ?, ?)").bind(scope(env), id, owner).run();
  if (!result.meta?.changes) throw fail(409, BUSY);
  return owner;
}
export async function releaseOrderLock(env, id, owner) {
  await env.ANALYTICS_DB.prepare("DELETE FROM customer_order_locks WHERE scope = ? AND order_id = ? AND owner = ?").bind(scope(env), id, owner).run();
}
// Caller holds the lock. Keep it on ambiguous writes: no lease expiry that lets
// a second worker overtake a slow Airtable PATCH. Recovery is explicit, audited.
export async function writeOrderUnderLock(env, record, fields, actor) {
  const event = randomToken();
  const before = clean(record.fields?.["Order Status"]);
  const after = clean(fields["Order Status"] ?? before);
  await env.ANALYTICS_DB.prepare("INSERT INTO customer_order_history (id, scope, order_id, old_status, new_status, changed_by, state, changed_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)").bind(event, scope(env), record.id, before, after, actor, new Date().toISOString()).run();
  try {
    const updated = await airtable(env, env.AIRTABLE_TABLE_NAME, record.id, { method: "PATCH", body: JSON.stringify({ fields, typecast: false }) });
    await env.ANALYTICS_DB.prepare("UPDATE customer_order_history SET state = 'completed' WHERE id = ?").bind(event).run();
    return updated;
  } catch (error) {
    error.keepOrderLock = true;
    throw error;
  }
}
async function cancelOrder(env, access) {
  // A duplicate after success is read-only, even while Airtable's stock
  // automation is still running. Never create movements or reset its flags.
  let record = await readCustomerOrderRecord(env, access.order_id);
  if (record.fields?.["Order Status"] === CANCELLED) return { alreadyCancelled: true, message: "هذا الطلب ملغي بالفعل." };
  const owner = await acquireOrderLock(env, access.order_id);
  let release = true;
  try {
    const verified = await accessRow(env, access.order_id);
    if (verified?.token !== access.token) throw fail(404, INVALID);
    record = await readCustomerOrderRecord(env, access.order_id);
    if (!canCustomerCancelOrder(record)) throw fail(409, "لا يمكن إلغاء هذا الطلب في حالته الحالية.");
    const notes = clean(record.fields.Notes);
    const marker = `إلغاء بواسطة العميل بتاريخ ${new Date().toISOString()}`;
    await writeOrderUnderLock(env, record, { "Order Status": CANCELLED, Notes: [notes, marker].filter(Boolean).join(" | ") }, "customer");
    return { message: "تم إلغاء الطلب بنجاح." };
  } catch (error) { if (error.keepOrderLock) release = false; throw error; }
  finally { if (release) await releaseOrderLock(env, access.order_id, owner); }
}
async function rateLimit(env, request, label, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope(env)}:${label}:${ip}`));
  const key = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  const bucket = Math.floor(Date.now() / 600000);
  const row = await env.ANALYTICS_DB.prepare("INSERT INTO customer_order_rate (key, bucket, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN bucket = excluded.bucket THEN count + 1 ELSE 1 END, bucket = excluded.bucket RETURNING count").bind(key, bucket).first();
  await env.ANALYTICS_DB.prepare("DELETE FROM customer_order_rate WHERE bucket < ?").bind(bucket - 144).run();
  if (row.count > limit) throw fail(429, "محاولات كثيرة. حاول مجددًا بعد عشر دقائق.");
}
export async function customerOrdersResponse({ request, env }, pathname) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
  const json = (body, status = 200) => Response.json(body, { status, headers });
  try {
    const lookup = pathname === "/api/customer-orders/lookup";
    const match = pathname.match(/^\/api\/customer-orders\/([a-f0-9]{64})(\/cancel)?$/);
    if (!lookup && !match) return json({ message: INVALID }, 404);
    const method = lookup || match?.[2] ? "POST" : "GET";
    if (request.method !== method) return json({ message: "طريقة الطلب غير مسموحة." }, 405);
    if (method === "POST" && (request.headers.get("Origin") !== new URL(request.url).origin || !request.headers.get("Content-Type")?.startsWith("application/json"))) return json({ message: "طلب غير مسموح." }, 403);
    await initializeCustomerOrders(env);
    await rateLimit(env, request, lookup ? "lookup" : "tracking", lookup ? 12 : 120);
    if (lookup) {
      const text = await request.text();
      if (text.length > 1024) throw fail(400, INVALID);
      let body;
      try { body = JSON.parse(text); } catch { throw fail(400, INVALID); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw fail(400, INVALID);
      const number = clean(body.orderNumber).replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632));
      const phone = normalizeEgyptianPhone(body.phone);
      if (!/^\d{1,12}$/.test(number) || !phone) throw fail(404, INVALID);
      const data = await airtable(env, env.AIRTABLE_TABLE_NAME, "", {}, { maxRecords: "2", filterByFormula: `{Order ID}=${Number(number)}` });
      const record = data.records?.length === 1 ? data.records[0] : null;
      if (!record || normalizeEgyptianPhone(record.fields?.Phone) !== phone) throw fail(404, INVALID);
      const access = await ensureOrderAccess(env, record.id);
      return json({ trackingUrl: `/order/${access.token}` });
    }
    const access = await env.ANALYTICS_DB.prepare("SELECT * FROM customer_order_access WHERE scope = ? AND token = ?").bind(scope(env), match[1]).first();
    if (!access) throw fail(404, INVALID);
    if (match[2]) {
      await rateLimit(env, request, `cancel:${access.token}`, 6);
      return json({ ok: true, ...await cancelOrder(env, access) });
    }
    const record = await readCustomerOrderRecord(env, access.order_id);
    return json({ order: await publicOrder(env, record, access) });
  } catch (error) {
    return json({ message: error.publicStatus ? error.message : "تعذر تحميل الطلب حاليًا. حاول لاحقًا." }, error.publicStatus || 503);
  }
}
