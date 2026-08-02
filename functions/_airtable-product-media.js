export const AIRTABLE_PRODUCTS_TABLE = "المنتجات";
export const AIRTABLE_PRODUCT_SKU_FIELD = "كود المنتج SKU";
export const AIRTABLE_PRODUCT_NAME_FIELD = "اسم المنتج";
export const AIRTABLE_PRODUCT_CATEGORY_FIELD = "القسم";
export const AIRTABLE_PRODUCT_SELL_PRICE_FIELD = "سعر البيع";
export const AIRTABLE_PRODUCT_COST_PRICE_FIELD = "سعر التكلفة";
export const AIRTABLE_PRODUCT_IMAGE_FIELD = "صورة المنتج";
export const AIRTABLE_PRODUCT_URL_FIELD = "رابط المنتج";
export const AIRTABLE_PRODUCT_ON_WEBSITE_FIELD = "موجود على الموقع؟";

const DEFAULT_SITE_ORIGIN = "https://popekyrillos.store";
const AIRTABLE_BATCH_SIZE = 10;
const AIRTABLE_MIN_INTERVAL_MS = 225;
const ARABIC_DIACRITICS = /[\u064b-\u065f\u0670]/g;
const SLUG_ALLOWED = /[^\p{L}\p{N}]+/gu;
const AIRTABLE_PRODUCT_SYNC_FIELDS = [
  AIRTABLE_PRODUCT_SKU_FIELD,
  AIRTABLE_PRODUCT_NAME_FIELD,
  AIRTABLE_PRODUCT_CATEGORY_FIELD,
  AIRTABLE_PRODUCT_SELL_PRICE_FIELD,
  AIRTABLE_PRODUCT_COST_PRICE_FIELD,
  AIRTABLE_PRODUCT_IMAGE_FIELD,
  AIRTABLE_PRODUCT_URL_FIELD,
  AIRTABLE_PRODUCT_ON_WEBSITE_FIELD
];

function clean(value) {
  return String(value ?? "").trim();
}

function localized(value) {
  if (value && typeof value === "object") {
    return value.ar || value.en || Object.values(value).find(Boolean) || "";
  }
  return value || "";
}

function normalizeSlug(value = "") {
  return clean(value)
    .normalize("NFKD")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(SLUG_ALLOWED, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function publicHttpUrl(value, origin = DEFAULT_SITE_ORIGIN) {
  const raw = clean(value);
  if (!raw || /^(?:blob:|data:|file:)/i.test(raw)) return "";
  try {
    const url = new URL(raw, `${origin.replace(/\/+$/, "")}/`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeFilePart(value, fallback = "product") {
  const safe = clean(value)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return safe || fallback;
}

function imageExtension(imageUrl) {
  try {
    const match = new URL(imageUrl).pathname.match(/\.([A-Za-z0-9]{2,5})$/);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

export function canonicalCatalogProductUrl(product, origin = DEFAULT_SITE_ORIGIN) {
  const normalizedOrigin = new URL(origin).origin;
  const existing = publicHttpUrl(product?.url, normalizedOrigin);
  if (existing) {
    const existingUrl = new URL(existing);
    if (existingUrl.origin === normalizedOrigin && existingUrl.pathname.startsWith("/products/")) {
      existingUrl.protocol = "https:";
      existingUrl.hash = "";
      existingUrl.search = "";
      return existingUrl.toString();
    }
  }

  const slug = normalizeSlug(product?.slug || localized(product?.name) || product?.id || "");
  return slug ? `${normalizedOrigin}/products/${encodeURIComponent(slug)}` : "";
}

export function primaryCatalogProductImageUrl(product, origin = DEFAULT_SITE_ORIGIN) {
  const primary = Array.isArray(product?.images) && product.images.length
    ? product.images[0]
    : product?.image;
  return publicHttpUrl(primary, origin);
}

export function catalogProductSkus(product) {
  const values = [
    product?.sku,
    ...(Array.isArray(product?.variants) ? product.variants.map((variant) => variant?.sku) : [])
  ].map(clean).filter(Boolean);
  return [...new Set(values)];
}

export function generatePermanentProductSku(usedSkus = new Set(), randomUuid) {
  const uuid = randomUuid || (() => crypto.randomUUID());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `PK-${clean(uuid()).replace(/[^A-Fa-f0-9]/g, "").toUpperCase()}`;
    if (candidate.length === 35 && !usedSkus.has(candidate)) {
      usedSkus.add(candidate);
      return candidate;
    }
  }
  throw new Error("Could not generate a unique permanent product SKU");
}

function productVariantForSku(product, sku) {
  return (Array.isArray(product?.variants) ? product.variants : [])
    .find((variant) => clean(variant?.sku) === clean(sku));
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function catalogProductMedia(product, sku, origin = DEFAULT_SITE_ORIGIN) {
  const imageUrl = primaryCatalogProductImageUrl(product, origin);
  const pageUrl = canonicalCatalogProductUrl(product, origin);
  const identity = safeFilePart(product?.id || sku);
  return {
    sku: clean(sku),
    productId: clean(product?.id),
    productName: clean(localized(product?.name)),
    imageUrl,
    pageUrl,
    filename: imageUrl
      ? `${identity}-${stableHash(imageUrl)}.${imageExtension(imageUrl)}`
      : ""
  };
}

export function buildAirtableProductCatalogFields(product, sku) {
  const variant = productVariantForSku(product, sku);
  const name = clean(localized(product?.name));
  const category = clean(
    localized(product?.label) ||
    localized(product?.mainCategory) ||
    localized(product?.category) ||
    ""
  );
  const sellPrice = finiteNumber(variant?.price ?? product?.price);
  const costPrice = finiteNumber(variant?.costPrice ?? product?.costPrice);
  const fields = {
    [AIRTABLE_PRODUCT_SKU_FIELD]: clean(sku),
    [AIRTABLE_PRODUCT_ON_WEBSITE_FIELD]: true
  };
  if (name) fields[AIRTABLE_PRODUCT_NAME_FIELD] = name;
  if (category) fields[AIRTABLE_PRODUCT_CATEGORY_FIELD] = category;
  if (sellPrice !== null) fields[AIRTABLE_PRODUCT_SELL_PRICE_FIELD] = sellPrice;
  if (costPrice !== null) fields[AIRTABLE_PRODUCT_COST_PRICE_FIELD] = costPrice;
  return fields;
}

export function buildAirtableProductCreateFields(product, sku, origin = DEFAULT_SITE_ORIGIN) {
  return {
    ...buildAirtableProductCatalogFields(product, sku),
    ...buildAirtableProductMediaFields(catalogProductMedia(product, sku, origin))
  };
}

export function buildAirtableProductMediaFields(media) {
  const fields = {};
  if (media?.pageUrl) fields[AIRTABLE_PRODUCT_URL_FIELD] = media.pageUrl;
  if (media?.imageUrl) {
    fields[AIRTABLE_PRODUCT_IMAGE_FIELD] = [{
      url: media.imageUrl,
      filename: media.filename
    }];
  }
  return fields;
}

function airtableTableUrl(env, recordId = "") {
  const baseId = encodeURIComponent(clean(env?.AIRTABLE_BASE_ID));
  const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_PRODUCTS_TABLE)}${suffix}`;
}

function requireAirtableConfig(env) {
  if (!clean(env?.AIRTABLE_TOKEN) || !clean(env?.AIRTABLE_BASE_ID)) {
    const error = new Error("Airtable product-media configuration is incomplete");
    error.code = "airtable_not_configured";
    throw error;
  }
}

async function airtableProductRequest(env, url, init = {}, options = {}) {
  requireAirtableConfig(env);
  if (options.beforeRequest) await options.beforeRequest();
  const response = await (options.fetchImpl || fetch)(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(`Airtable product-media request failed with status ${response.status}`);
    error.code = "airtable_product_media_failed";
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function findAirtableProductByExactSku(env, sku, options = {}) {
  const exactSku = clean(sku);
  if (!exactSku) return { status: "missing_sku", records: [] };
  const url = new URL(airtableTableUrl(env));
  url.searchParams.set("maxRecords", "2");
  AIRTABLE_PRODUCT_SYNC_FIELDS.forEach((field) => url.searchParams.append("fields[]", field));
  url.searchParams.set(
    "filterByFormula",
    `{${AIRTABLE_PRODUCT_SKU_FIELD}}='${exactSku.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  );
  const data = await airtableProductRequest(env, url.toString(), {}, options);
  const records = Array.isArray(data.records) ? data.records : [];
  if (!records.length) return { status: "not_found", records };
  if (records.length > 1) return { status: "duplicate_airtable_sku", records };
  return { status: "found", record: records[0], records };
}

async function listAirtableProductRecords(env, options = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(airtableTableUrl(env));
    url.searchParams.set("pageSize", "100");
    AIRTABLE_PRODUCT_SYNC_FIELDS.forEach((field) => url.searchParams.append("fields[]", field));
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableProductRequest(env, url.toString(), {}, options);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset);
  } while (offset);
  return records;
}

function currentAttachmentFilenames(record) {
  const attachments = record?.fields?.[AIRTABLE_PRODUCT_IMAGE_FIELD];
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => clean(attachment?.filename)).filter(Boolean);
}

export function airtableProductMediaPatch(record, media) {
  const desired = buildAirtableProductMediaFields(media);
  const fields = {};
  const currentUrl = clean(record?.fields?.[AIRTABLE_PRODUCT_URL_FIELD]);
  if (desired[AIRTABLE_PRODUCT_URL_FIELD] && desired[AIRTABLE_PRODUCT_URL_FIELD] !== currentUrl) {
    fields[AIRTABLE_PRODUCT_URL_FIELD] = desired[AIRTABLE_PRODUCT_URL_FIELD];
  }

  const desiredAttachment = desired[AIRTABLE_PRODUCT_IMAGE_FIELD]?.[0];
  if (
    desiredAttachment &&
    !currentAttachmentFilenames(record).includes(desiredAttachment.filename)
  ) {
    fields[AIRTABLE_PRODUCT_IMAGE_FIELD] = [desiredAttachment];
  }
  return fields;
}

export function airtableProductCatalogPatch(record, product, sku) {
  const desired = buildAirtableProductCatalogFields(product, sku);
  const fields = {};
  for (const [field, value] of Object.entries(desired)) {
    if (JSON.stringify(record?.fields?.[field]) !== JSON.stringify(value)) fields[field] = value;
  }
  return fields;
}

export async function updateAirtableProductMediaRecord(env, record, media, options = {}) {
  const fields = airtableProductMediaPatch(record, media);
  if (!Object.keys(fields).length) {
    return { status: "up_to_date", recordId: record.id, sku: media.sku, fields: {} };
  }
  await airtableProductRequest(env, airtableTableUrl(env, record.id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false })
  }, options);
  return { status: "updated", recordId: record.id, sku: media.sku, fields };
}

export async function updateAirtableProductMediaBySku(env, product, sku, options = {}) {
  const media = catalogProductMedia(product, sku, options.origin);
  const match = await findAirtableProductByExactSku(env, sku, options);
  if (match.status !== "found") return { status: match.status, sku: clean(sku), media };
  return updateAirtableProductMediaRecord(env, match.record, media, options);
}

export async function upsertAirtableCatalogProductBySku(env, product, sku, options = {}) {
  const exactSku = clean(sku);
  const updateFoundRecord = async (record) => {
    const fields = {
      ...airtableProductMediaPatch(record, catalogProductMedia(product, exactSku, options.origin)),
      ...airtableProductCatalogPatch(record, product, exactSku)
    };
    if (!Object.keys(fields).length) {
      return { status: "up_to_date", recordId: record.id, sku: exactSku, fields: {} };
    }
    await airtableProductRequest(env, airtableTableUrl(env, record.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: false })
    }, options);
    return { status: "updated", recordId: record.id, sku: exactSku, fields };
  };

  const firstCheck = await findAirtableProductByExactSku(env, exactSku, options);
  if (firstCheck.status === "found") return updateFoundRecord(firstCheck.record);
  if (firstCheck.status !== "not_found") return { status: firstCheck.status, sku: exactSku };

  const secondCheck = await findAirtableProductByExactSku(env, exactSku, options);
  if (secondCheck.status === "found") return updateFoundRecord(secondCheck.record);
  if (secondCheck.status !== "not_found") return { status: secondCheck.status, sku: exactSku };

  const fields = buildAirtableProductCreateFields(product, exactSku, options.origin);
  const data = await airtableProductRequest(env, airtableTableUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false })
  }, options);
  return {
    status: "created",
    recordId: data.records?.[0]?.id || "",
    sku: exactSku,
    fields
  };
}

export async function assignPermanentSkusToNewProducts(env, products, newProductIds, options = {}) {
  const catalog = Array.isArray(products) ? products : [];
  const newIds = new Set(Array.isArray(newProductIds) ? newProductIds.map(clean).filter(Boolean) : []);
  const usedSkus = new Set(catalog.flatMap(catalogProductSkus));
  const generated = [];

  const nextUniqueSku = async (product) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sku = generatePermanentProductSku(usedSkus, options.randomUuid);
      if (!env?.AIRTABLE_TOKEN || !env?.AIRTABLE_BASE_ID) return sku;
      try {
        const match = await findAirtableProductByExactSku(env, sku, options);
        if (match.status === "not_found") return sku;
      } catch (error) {
        console.warn("Airtable SKU uniqueness check skipped during admin save", {
          productId: clean(product?.id),
          reason: error.code || "lookup_failed",
          status: error.status || null
        });
        return sku;
      }
    }
    throw new Error("Could not allocate an unused permanent product SKU");
  };

  for (const product of catalog) {
    if (!newIds.has(clean(product?.id))) continue;
    if (Array.isArray(product.variants) && product.variants.length) {
      for (const variant of product.variants) {
        if (clean(variant?.sku)) continue;
        const sku = await nextUniqueSku(product);
        variant.sku = sku;
        generated.push({ productId: clean(product.id), variantId: clean(variant?.id), sku });
      }
    } else if (!clean(product?.sku)) {
      const sku = await nextUniqueSku(product);
      product.sku = sku;
      generated.push({ productId: clean(product.id), variantId: "", sku });
    }
  }
  return { products: catalog, generated };
}

export async function syncResolvedOrderProductMedia(env, resolvedItems, products, options = {}) {
  const byId = new Map(products.map((product) => [clean(product?.id), product]));
  const bySku = new Map();
  for (const product of products) {
    for (const sku of catalogProductSkus(product)) {
      if (!bySku.has(sku)) bySku.set(sku, product);
    }
  }

  const seen = new Set();
  const results = [];
  for (const item of resolvedItems) {
    if (!item?.productId || !item?.sku || seen.has(item.sku)) continue;
    seen.add(item.sku);
    const product = byId.get(clean(item.websiteProductId)) || bySku.get(item.sku);
    if (!product) {
      results.push({ status: "website_product_not_found", sku: item.sku });
      continue;
    }
    try {
      results.push(await updateAirtableProductMediaBySku(env, product, item.sku, options));
    } catch (error) {
      console.warn("Airtable product media sync skipped after order", {
        requestId: clean(options.requestId),
        productName: clean(item.productName),
        sku: item.sku,
        reason: error.code || "update_failed",
        status: error.status || null
      });
      results.push({ status: "failed", sku: item.sku, reason: error.code || "update_failed" });
    }
  }
  return results;
}

function createRateLimiter(minIntervalMs, sleep) {
  let nextRequestAt = 0;
  return async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs) await sleep(waitMs);
    nextRequestAt = Date.now() + minIntervalMs;
  };
}

function summaryItem(product, extra = {}) {
  return {
    productId: clean(product?.id),
    productName: clean(localized(product?.name)),
    ...extra
  };
}

export async function syncAirtableCatalogProductMedia(env, products, options = {}) {
  const catalog = Array.isArray(products) ? products : [];
  const summary = {
    websiteProductsScanned: catalog.length,
    airtableProductsUpdated: 0,
    airtableProductsCreated: 0,
    skippedMissingSku: [],
    skusNotFound: [],
    productsMissingImage: [],
    productsMissingPageUrl: [],
    failedUpdates: [],
    alreadyCurrent: 0
  };
  const skuEntries = new Map();

  for (const product of catalog) {
    const skus = catalogProductSkus(product);
    if (!skus.length) summary.skippedMissingSku.push(summaryItem(product));
    const sampleMedia = catalogProductMedia(product, skus[0] || "", options.origin);
    if (!sampleMedia.imageUrl) summary.productsMissingImage.push(summaryItem(product));
    if (!sampleMedia.pageUrl) summary.productsMissingPageUrl.push(summaryItem(product));
    for (const sku of skus) {
      const entries = skuEntries.get(sku) || [];
      entries.push({ product, media: catalogProductMedia(product, sku, options.origin) });
      skuEntries.set(sku, entries);
    }
  }
  if (!skuEntries.size) return summary;

  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const beforeRequest = createRateLimiter(options.minIntervalMs ?? AIRTABLE_MIN_INTERVAL_MS, sleep);
  const requestOptions = { ...options, beforeRequest };
  const plannedUpdates = [];
  const plannedCreates = [];
  let airtableRecords;
  try {
    airtableRecords = await listAirtableProductRecords(env, requestOptions);
  } catch (error) {
    for (const [sku, entries] of skuEntries) {
      for (const { product } of entries) {
        summary.failedUpdates.push(summaryItem(product, {
          sku,
          reason: error.code || "catalog_lookup_failed",
          status: error.status || null
        }));
      }
    }
    return summary;
  }
  const airtableBySku = new Map();
  for (const record of airtableRecords) {
    const sku = clean(record?.fields?.[AIRTABLE_PRODUCT_SKU_FIELD]);
    if (!sku) continue;
    const matches = airtableBySku.get(sku) || [];
    matches.push(record);
    airtableBySku.set(sku, matches);
  }

  for (const [sku, entries] of skuEntries) {
    if (entries.length > 1) {
      summary.failedUpdates.push({
        sku,
        reason: "duplicate_website_sku",
        products: entries.map(({ product }) => summaryItem(product))
      });
      continue;
    }
    const [{ product, media }] = entries;
    try {
      const matches = airtableBySku.get(sku) || [];
      if (!matches.length) {
        if (!options.createMissing) {
          summary.skusNotFound.push(summaryItem(product, { sku }));
          continue;
        }
        const secondCheck = await findAirtableProductByExactSku(env, sku, requestOptions);
        if (secondCheck.status === "not_found") {
          plannedCreates.push({
            fields: buildAirtableProductCreateFields(product, sku, options.origin),
            sku,
            product
          });
          continue;
        }
        if (secondCheck.status !== "found") {
          summary.failedUpdates.push(summaryItem(product, { sku, reason: secondCheck.status }));
          continue;
        }
        airtableBySku.set(sku, [secondCheck.record]);
        matches.push(secondCheck.record);
      }
      if (!matches.length) {
        summary.skusNotFound.push(summaryItem(product, { sku }));
        continue;
      }
      if (matches.length > 1) {
        summary.failedUpdates.push(summaryItem(product, { sku, reason: "duplicate_airtable_sku" }));
        continue;
      }
      const fields = {
        ...airtableProductMediaPatch(matches[0], media),
        ...(options.includeCatalogFields ? airtableProductCatalogPatch(matches[0], product, sku) : {})
      };
      if (!Object.keys(fields).length) {
        summary.alreadyCurrent += 1;
        continue;
      }
      plannedUpdates.push({ id: matches[0].id, fields, sku, product });
    } catch (error) {
      summary.failedUpdates.push(summaryItem(product, {
        sku,
        reason: error.code || "lookup_failed",
        status: error.status || null
      }));
    }
  }

  for (let index = 0; index < plannedUpdates.length; index += AIRTABLE_BATCH_SIZE) {
    const batch = plannedUpdates.slice(index, index + AIRTABLE_BATCH_SIZE);
    if (options.dryRun) {
      summary.airtableProductsUpdated += batch.length;
      continue;
    }
    try {
      await airtableProductRequest(env, airtableTableUrl(env), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: batch.map(({ id, fields }) => ({ id, fields })),
          typecast: false
        })
      }, requestOptions);
      summary.airtableProductsUpdated += batch.length;
    } catch (error) {
      batch.forEach(({ product, sku }) => {
        summary.failedUpdates.push(summaryItem(product, {
          sku,
          reason: error.code || "update_failed",
          status: error.status || null
        }));
      });
    }
  }

  for (let index = 0; index < plannedCreates.length; index += AIRTABLE_BATCH_SIZE) {
    const batch = plannedCreates.slice(index, index + AIRTABLE_BATCH_SIZE);
    if (options.dryRun) {
      summary.airtableProductsCreated += batch.length;
      continue;
    }
    try {
      const data = await airtableProductRequest(env, airtableTableUrl(env), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: batch.map(({ fields }) => ({ fields })),
          typecast: false
        })
      }, requestOptions);
      summary.airtableProductsCreated += Array.isArray(data.records) ? data.records.length : batch.length;
    } catch (error) {
      batch.forEach(({ product, sku }) => {
        summary.failedUpdates.push(summaryItem(product, {
          sku,
          reason: error.code || "create_failed",
          status: error.status || null
        }));
      });
    }
  }

  return summary;
}

async function initializeAirtableProductSyncQueue(env) {
  if (!env?.ANALYTICS_DB) return false;
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS airtable_product_sync_queue (
      sku TEXT PRIMARY KEY,
      product_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  return true;
}

export async function enqueueAirtableProductSync(env, products) {
  if (!await initializeAirtableProductSyncQueue(env)) return { queued: 0, unavailable: true };
  const skuEntries = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const sku of catalogProductSkus(product)) {
      const entries = skuEntries.get(sku) || [];
      entries.push(product);
      skuEntries.set(sku, entries);
    }
  }
  let queued = 0;
  const duplicateWebsiteSkus = [];
  for (const [sku, entries] of skuEntries) {
    if (entries.length !== 1) {
      duplicateWebsiteSkus.push(sku);
      continue;
    }
    await env.ANALYTICS_DB.prepare(`
      INSERT INTO airtable_product_sync_queue (sku, product_json, status, attempts, last_error, updated_at)
      VALUES (?, ?, 'pending', 0, '', CURRENT_TIMESTAMP)
      ON CONFLICT(sku) DO UPDATE SET
        product_json = excluded.product_json,
        status = CASE WHEN status = 'processing' THEN status ELSE 'pending' END,
        last_error = '',
        updated_at = CURRENT_TIMESTAMP
    `).bind(sku, JSON.stringify(entries[0])).run();
    queued += 1;
  }
  return { queued, duplicateWebsiteSkus, unavailable: false };
}

export async function processAirtableProductSyncQueue(env, options = {}) {
  if (!await initializeAirtableProductSyncQueue(env)) return { processed: 0, failed: 0, unavailable: true };
  const rowsResult = await env.ANALYTICS_DB.prepare(`
    SELECT sku, product_json productJson
    FROM airtable_product_sync_queue
    WHERE status IN ('pending', 'failed')
    ORDER BY updated_at ASC
    LIMIT 20
  `).all();
  const rows = rowsResult?.results || [];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const claim = await env.ANALYTICS_DB.prepare(`
      UPDATE airtable_product_sync_queue
      SET status = 'processing', updated_at = CURRENT_TIMESTAMP
      WHERE sku = ? AND status IN ('pending', 'failed')
    `).bind(row.sku).run();
    if (!claim.meta?.changes) continue;
    try {
      const product = JSON.parse(row.productJson);
      const result = await upsertAirtableCatalogProductBySku(env, product, row.sku, options);
      if (!["created", "updated", "up_to_date"].includes(result.status)) {
        const error = new Error(result.status || "sync_failed");
        error.code = result.status || "sync_failed";
        throw error;
      }
      const removed = await env.ANALYTICS_DB.prepare(`
        DELETE FROM airtable_product_sync_queue
        WHERE sku = ? AND product_json = ? AND status = 'processing'
      `).bind(row.sku, row.productJson).run();
      if (!removed.meta?.changes) {
        await env.ANALYTICS_DB.prepare(`
          UPDATE airtable_product_sync_queue
          SET status = 'pending', updated_at = CURRENT_TIMESTAMP
          WHERE sku = ? AND status = 'processing'
        `).bind(row.sku).run();
      }
      processed += 1;
    } catch (error) {
      await env.ANALYTICS_DB.prepare(`
        UPDATE airtable_product_sync_queue
        SET status = CASE WHEN product_json = ? THEN 'failed' ELSE 'pending' END,
            attempts = attempts + 1,
            last_error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE sku = ? AND status = 'processing'
      `).bind(row.productJson, clean(error.code || "sync_failed").slice(0, 80), row.sku).run();
      console.warn("Queued Airtable product sync failed", {
        sku: row.sku,
        reason: error.code || "sync_failed",
        status: error.status || null
      });
      failed += 1;
    }
  }
  return { processed, failed, unavailable: false };
}
