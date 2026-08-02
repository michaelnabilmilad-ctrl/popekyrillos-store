import {
  AIRTABLE_PRODUCT_SKU_FIELD,
  AIRTABLE_PRODUCTS_TABLE,
  buildAirtableProductCreateFields,
  catalogProductSkus
} from "./_airtable-product-media.js";

const DETAILS_TABLE = "تفاصيل الطلبات";
const ORDER_LINK_FIELD = "رقم الأوردر";
const PRODUCT_LINK_FIELD = "المنتج";

function clean(value) { return String(value ?? "").trim(); }
function normalizeName(value) {
  return clean(value).normalize("NFKC").replace(/[\u064b-\u065f\u0670]/g, "").replace(/\s+/g, " ").toLocaleLowerCase("ar");
}
function tableUrl(env, table, recordId = "") {
  const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
  return `https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${suffix}`;
}
async function airtableRequest(env, url, init = {}, options = {}) {
  if (options.beforeRequest) await options.beforeRequest();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const error = new Error(`Airtable backfill request failed with status ${response.status}`);
    error.code = "airtable_backfill_failed";
    error.status = response.status;
    throw error;
  }
  return data;
}
async function listRecords(env, table, fields, options) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(tableUrl(env, table));
    fields.forEach((field) => url.searchParams.append("fields[]", field));
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableRequest(env, url.toString(), {}, options);
    records.push(...(data.records || []));
    offset = clean(data.offset);
  } while (offset);
  return records;
}
function legacyItems(value) {
  return clean(value).split(/\r?\n/).filter(Boolean).map((line) => ({
    name: clean(line.split("|")[0]),
    sku: clean(line.match(/(?:^|\|)\s*SKU:\s*([^|]+)/i)?.[1]),
    productId: clean(line.match(/(?:^|\|)\s*Product ID:\s*([^|]+)/i)?.[1])
  }));
}
function orderItems(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value));
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return legacyItems(value);
}
function catalogIndexes(products) {
  const byIdentity = new Map();
  const byName = new Map();
  for (const product of products) {
    [product?.id, ...catalogProductSkus(product)].map(clean).filter(Boolean).forEach((identity) => byIdentity.set(identity, product));
    const name = normalizeName(product?.name?.ar || product?.name?.en || product?.name);
    if (name) byName.set(name, [...(byName.get(name) || []), product]);
  }
  return { byIdentity, byName };
}

export async function backfillAirtableOrderProducts(env, products, options = {}) {
  if (!clean(env?.AIRTABLE_TOKEN) || !clean(env?.AIRTABLE_BASE_ID)) {
    const error = new Error("Airtable configuration is incomplete");
    error.code = "airtable_not_configured";
    throw error;
  }
  const dryRun = options.dryRun !== false;
  const ordersTable = clean(env.AIRTABLE_TABLE_NAME) || "Orders";
  const selected = new Set((options.orderNumbers || []).map(clean).filter(Boolean));
  let nextRequestAt = 0;
  let requestChain = Promise.resolve();
  const rateLimitedRequest = options.beforeRequest || (() => {
    requestChain = requestChain.then(async () => {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      nextRequestAt = Date.now() + 225;
    });
    return requestChain;
  });
  const requestOptions = { beforeRequest: rateLimitedRequest };
  const [orders, details, airtableProducts] = await Promise.all([
    listRecords(env, ordersTable, ["Order ID", "Products"], requestOptions),
    listRecords(env, DETAILS_TABLE, [ORDER_LINK_FIELD, PRODUCT_LINK_FIELD], requestOptions),
    listRecords(env, AIRTABLE_PRODUCTS_TABLE, [AIRTABLE_PRODUCT_SKU_FIELD], requestOptions)
  ]);
  const { byIdentity, byName } = catalogIndexes(Array.isArray(products) ? products : []);
  const productRecords = new Map();
  for (const record of airtableProducts) {
    const identity = clean(record.fields?.[AIRTABLE_PRODUCT_SKU_FIELD]);
    if (identity && !productRecords.has(identity)) productRecords.set(identity, record.id);
  }
  const detailsByOrder = new Map();
  for (const detail of details) {
    for (const orderId of detail.fields?.[ORDER_LINK_FIELD] || []) {
      detailsByOrder.set(orderId, [...(detailsByOrder.get(orderId) || []), detail]);
    }
  }
  for (const rows of detailsByOrder.values()) rows.sort((a, b) => clean(a.createdTime).localeCompare(clean(b.createdTime)));

  const report = { linked: 0, alreadyLinked: 0, unresolved: 0, failures: [], problemOrderNumbers: [], dryRun };
  const problemOrders = new Set();
  for (const order of orders) {
    const orderNumber = clean(order.fields?.["Order ID"]);
    if (selected.size && !selected.has(orderNumber)) continue;
    const items = orderItems(order.fields?.Products);
    const rows = detailsByOrder.get(order.id) || [];
    for (let index = 0; index < Math.max(items.length, rows.length); index += 1) {
      const item = items[index];
      const detail = rows[index];
      if (detail?.fields?.[PRODUCT_LINK_FIELD]?.length) { report.alreadyLinked += 1; continue; }
      if (!item || !detail) {
        report.unresolved += 1;
        problemOrders.add(orderNumber);
        report.failures.push({ orderNumber, itemNumber: index + 1, reason: !item ? "missing_original_item" : "missing_detail_row" });
        continue;
      }
      let identity = clean(item.sku || item.productSku || item.productId || item.id);
      let catalogProduct = identity ? byIdentity.get(identity) : null;
      if (!identity) {
        const nameMatches = byName.get(normalizeName(item.name || item.productName)) || [];
        if (nameMatches.length === 1) {
          catalogProduct = nameMatches[0];
          identity = catalogProductSkus(catalogProduct)[0] || clean(catalogProduct.id);
        }
      }
      if (!identity) {
        report.unresolved += 1;
        problemOrders.add(orderNumber);
        report.failures.push({ orderNumber, itemNumber: index + 1, reason: "product_identity_not_unique" });
        continue;
      }
      let productRecordId = productRecords.get(identity);
      if (!productRecordId && catalogProduct) {
        if (dryRun) {
          productRecordId = `preview:${identity}`;
        } else {
          const created = await airtableRequest(env, tableUrl(env, AIRTABLE_PRODUCTS_TABLE), {
            method: "POST",
            body: JSON.stringify({ records: [{ fields: buildAirtableProductCreateFields(catalogProduct, identity, options.origin) }], typecast: false })
          }, requestOptions);
          productRecordId = created.records?.[0]?.id || "";
        }
        if (productRecordId) productRecords.set(identity, productRecordId);
      }
      if (!productRecordId) {
        report.unresolved += 1;
        problemOrders.add(orderNumber);
        report.failures.push({ orderNumber, itemNumber: index + 1, reason: "product_not_found" });
        continue;
      }
      if (!dryRun) {
        await airtableRequest(env, tableUrl(env, DETAILS_TABLE, detail.id), {
          method: "PATCH",
          body: JSON.stringify({ fields: { [PRODUCT_LINK_FIELD]: [productRecordId] }, typecast: false })
        }, requestOptions);
      }
      report.linked += 1;
    }
  }
  report.problemOrderNumbers = [...problemOrders].filter(Boolean).sort((a, b) => Number(a) - Number(b));
  return report;
}
