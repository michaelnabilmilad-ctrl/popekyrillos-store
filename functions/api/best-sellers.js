const CACHE_SECONDS = 12 * 60;
const INCLUDED_STATUSES = new Set([
  "confirmed", "paid", "completed", "تم التأكيد", "تم الدفع", "تم التسليم"
]);
const EXCLUDED_STATUSES = new Set([
  "cancelled", "canceled", "refunded", "test", "ملغي", "ملغى", "مرتجع", "تجريبي"
]);

const FIELD_ALIASES = {
  orderLink: ["Order", "Order ID", "Order Record", "الطلب", "رقم الطلب"],
  orderStatus: ["Order Status", "Status", "حالة الطلب"],
  paymentStatus: ["Payment Status", "حالة الدفع"],
  productLink: ["Product", "Product Record", "المنتج"],
  productId: ["Product ID", "Product Id", "productId", "ProductID", "معرف المنتج"],
  sku: ["SKU", "Sku", "sku", "كود المنتج"],
  quantity: ["Quantity", "Qty", "quantity", "الكمية"],
  name: ["Name", "Product Name", "الاسم", "اسم المنتج"],
  image: ["Image", "Images", "Photo", "الصورة", "الصور"],
  price: ["Price", "Regular Price", "السعر"],
  salePrice: ["Sale Price", "Discount Price", "Compare At Price", "سعر الخصم"],
  stock: ["Stock", "Inventory", "Quantity Available", "المخزون"],
  url: ["URL", "Product URL", "Link", "الرابط"],
  slug: ["Slug", "slug"],
  category: ["Main Category", "Category", "mainCategory", "category", "القسم الرئيسي", "القسم"],
  published: ["Published", "Is Published", "Active", "منشور"],
  deleted: ["Deleted", "Is Deleted", "محذوف"],
  created: ["Created", "Created At", "Created Time", "تاريخ الإنشاء"]
};

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function firstField(fields, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(fields, alias)) return fields[alias];
  }
  const byNormalizedName = new Map(Object.keys(fields).map((key) => [normalized(key), key]));
  for (const alias of aliases) {
    const key = byNormalizedName.get(normalized(alias));
    if (key) return fields[key];
  }
  return undefined;
}

function numeric(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "" || candidate === null || candidate === undefined) return null;
  const number = Number(candidate);
  return Number.isFinite(number) ? number : null;
}

function statusValues(fields) {
  return [
    ...values(firstField(fields, FIELD_ALIASES.orderStatus)),
    ...values(firstField(fields, FIELD_ALIASES.paymentStatus))
  ].map(normalized).filter(Boolean);
}

function statusDecision(statuses) {
  if (statuses.some((status) => EXCLUDED_STATUSES.has(status))) return "excluded";
  if (statuses.some((status) => INCLUDED_STATUSES.has(status))) return "included";
  return "ignored";
}

function tableNames(env) {
  return {
    orders: clean(env.AIRTABLE_ORDERS_TABLE || env.AIRTABLE_TABLE_NAME || "Orders"),
    orderItems: clean(env.AIRTABLE_ORDER_ITEMS_TABLE || "Order Items"),
    products: clean(env.AIRTABLE_PRODUCTS_TABLE || "Products")
  };
}

function airtableUrl(env, table, offset = "") {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "100");
  if (offset) url.searchParams.set("offset", offset);
  return url;
}

async function readAllRecords(env, table) {
  const records = [];
  let offset = "";
  do {
    const response = await fetch(airtableUrl(env, table, offset), {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
    });
    const text = await response.text();
    if (!response.ok) {
      let message = `Airtable ${table} returned ${response.status}`;
      try { message = JSON.parse(text)?.error?.message || message; } catch {}
      throw new Error(message);
    }
    const data = text ? JSON.parse(text) : {};
    records.push(...(data.records || []));
    offset = clean(data.offset);
  } while (offset);
  return records;
}

async function readFirstAvailableTable(env, preferred, alternatives = []) {
  const attempted = [];
  const names = [...new Set([preferred, ...alternatives].map(clean).filter(Boolean))];
  for (const name of names) {
    try {
      return { name, records: await readAllRecords(env, name) };
    } catch (error) {
      attempted.push(name);
    }
  }
  throw new Error(`No readable Airtable table found among: ${attempted.join(", ")}`);
}

function addLookup(map, value, record) {
  for (const item of values(value)) {
    const key = clean(item);
    if (key) map.set(key, record);
  }
}

function productLookups(records) {
  const lookup = new Map();
  for (const record of records) {
    const fields = record.fields || {};
    addLookup(lookup, record.id, record);
    addLookup(lookup, firstField(fields, FIELD_ALIASES.productId), record);
    addLookup(lookup, firstField(fields, FIELD_ALIASES.sku), record);
  }
  return lookup;
}

function orderLookups(records) {
  const lookup = new Map();
  for (const record of records) {
    addLookup(lookup, record.id, record);
    addLookup(lookup, firstField(record.fields || {}, FIELD_ALIASES.orderLink), record);
  }
  return lookup;
}

function linkedRecord(fields, aliases, lookup) {
  for (const candidate of values(firstField(fields, aliases))) {
    const match = lookup.get(clean(candidate));
    if (match) return match;
  }
  return null;
}

function itemStatus(itemFields, ordersLookup) {
  const direct = statusValues(itemFields);
  if (direct.length) return direct;
  const order = linkedRecord(itemFields, FIELD_ALIASES.orderLink, ordersLookup);
  return order ? statusValues(order.fields || {}) : [];
}

function imageUrl(value) {
  for (const item of values(value)) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object") {
      const url = clean(item.url || item.src || item.thumbnails?.large?.url || item.thumbnails?.full?.url);
      if (url) return url;
    }
  }
  return "";
}

function productIdentity(record) {
  const fields = record.fields || {};
  return {
    id: clean(values(firstField(fields, FIELD_ALIASES.productId))[0] || record.id),
    sku: clean(values(firstField(fields, FIELD_ALIASES.sku))[0])
  };
}

function unavailableStock(value) {
  if (typeof value === "number") return value <= 0;
  const text = normalized(value);
  return ["0", "out of stock", "unavailable", "sold out", "غير متاح", "نفد", "نفد مؤقتًا"].includes(text);
}

function isPublished(fields) {
  const deleted = firstField(fields, FIELD_ALIASES.deleted);
  if (deleted === true || ["true", "yes", "1", "محذوف"].includes(normalized(deleted))) return false;
  const published = firstField(fields, FIELD_ALIASES.published);
  if (published === false) return false;
  if (["false", "no", "0", "draft", "unpublished", "archived", "deleted", "غير منشور", "محذوف"].includes(normalized(published))) return false;
  return true;
}

function serializeProduct(record, totalQuantity = 0) {
  const fields = record.fields || {};
  const identity = productIdentity(record);
  const name = clean(values(firstField(fields, FIELD_ALIASES.name))[0]);
  const image = imageUrl(firstField(fields, FIELD_ALIASES.image));
  const stockValue = firstField(fields, FIELD_ALIASES.stock);
  const slug = clean(values(firstField(fields, FIELD_ALIASES.slug))[0]);
  const rawUrl = clean(values(firstField(fields, FIELD_ALIASES.url))[0]);
  const price = numeric(firstField(fields, FIELD_ALIASES.price));
  const salePrice = numeric(firstField(fields, FIELD_ALIASES.salePrice));
  const category = clean(values(firstField(fields, FIELD_ALIASES.category))[0]);
  return {
    id: identity.id,
    sku: identity.sku,
    name,
    image,
    images: image ? [image] : [],
    price: salePrice ?? price,
    compareAtPrice: salePrice !== null ? price : null,
    salePrice,
    stock: unavailableStock(stockValue) ? "غير متاح حاليا" : (clean(stockValue) || "متاح"),
    available: !unavailableStock(stockValue),
    url: rawUrl || (slug ? `/products/${encodeURIComponent(slug)}` : ""),
    slug,
    category,
    totalQuantity,
    createdAt: clean(values(firstField(fields, FIELD_ALIASES.created))[0] || record.createdTime),
    published: isPublished(fields)
  };
}

export function calculateBestSellers({ orders, orderItems, products, limit = 9 }) {
  const ordersLookup = orderLookups(orders);
  const productsLookup = productLookups(products);
  const totals = new Map();

  for (const item of orderItems) {
    const fields = item.fields || {};
    if (statusDecision(itemStatus(fields, ordersLookup)) !== "included") continue;
    const quantity = numeric(firstField(fields, FIELD_ALIASES.quantity));
    if (quantity === null || quantity <= 0) continue;
    const product = linkedRecord(fields, FIELD_ALIASES.productLink, productsLookup)
      || linkedRecord(fields, FIELD_ALIASES.productId, productsLookup)
      || linkedRecord(fields, FIELD_ALIASES.sku, productsLookup);
    if (!product) continue;
    const identity = productIdentity(product);
    const key = identity.id || identity.sku;
    if (!key) continue;
    totals.set(key, { product, quantity: (totals.get(key)?.quantity || 0) + quantity });
  }

  const candidates = [...totals.values()]
    .map(({ product, quantity }) => serializeProduct(product, quantity))
    .filter((product) => product.published && product.image)
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.id.localeCompare(b.id));

  const ranked = [];
  const seenCategories = new Set();
  for (const product of candidates) {
    const categoryKey = normalized(product.category) || `uncategorized:${product.id}`;
    if (seenCategories.has(categoryKey)) continue;
    ranked.push(product);
    seenCategories.add(categoryKey);
    if (ranked.length >= limit) break;
  }
  return ranked;
}

function responseJson(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60`);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export async function bestSellersResponse(context, catalogProducts = []) {
  const { request, env, waitUntil } = context;
  if (request.method !== "GET") return responseJson({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET" } });
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL("/api/best-sellers?v=9", request.url), { method: "GET" });
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;

  const names = tableNames(env);
  let payload;
  try {
    if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) throw new Error("Airtable configuration is incomplete");
    let orders;
    let orderItemsTable;
    let productsTable;
    try { orders = await readAllRecords(env, names.orders); } catch (error) { throw new Error(`${names.orders}: ${error.message}`); }
    productsTable = await readFirstAvailableTable(env, names.products, [
      "Product", "Catalog", "Inventory", "المنتجات"
    ]);
    orderItemsTable = await readFirstAvailableTable(env, names.orderItems, [
      "OrderItems", "Order Line Items", "Line Items", "Items", "Order Products",
      "عناصر الطلب", "تفاصيل الطلبات", "منتجات الطلبات"
    ]);
    const orderItems = orderItemsTable.records;
    const products = productsTable.records;
    names.orderItems = orderItemsTable.name;
    names.products = productsTable.name;
    payload = {
      products: calculateBestSellers({ orders, orderItems, products, limit: 9 }),
      source: "airtable-sales",
      tables: names,
      counts: { orders: orders.length, orderItems: orderItems.length, products: products.length },
      generatedAt: new Date().toISOString(),
      cacheSeconds: CACHE_SECONDS
    };
  } catch (error) {
    console.error("Best sellers Airtable read failed", { message: error.message, tables: names });
    payload = {
      products: [],
      source: "sales-data-unavailable",
      tables: names,
      generatedAt: new Date().toISOString(),
      cacheSeconds: CACHE_SECONDS
    };
  }

  const response = responseJson(payload);
  if (cache) waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export const bestSellersConfig = { CACHE_SECONDS, FIELD_ALIASES, INCLUDED_STATUSES, EXCLUDED_STATUSES };
