const text = value => String(value && typeof value === "object" ? value.ar || value.en || "" : value ?? "");
const trim = (value, length = 1600) => text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, length);
export const normalizeAssistantSearch = value => trim(value, 300).normalize("NFKD").replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
// Catalog uses the plural «أنابيب» while customers commonly ask for «أنبوبة».
export const assistantSearchQuery = value => normalizeAssistantSearch(value).replace(/(^|\s)(انبوبه|انبوب|انابيب|reliquary)(?=\s|$)/g, "$1انابيب");

export function safeStoreUrl(value, origin = "https://popekyrillos.store") {
  try {
    const url = new URL(String(value || ""), origin + "/");
    return url.origin === origin && url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

// Preserve unknown values; absence must never become an assertion of availability.
export function catalogAvailability(value) {
  if (value?.available === false) return "unavailable";
  if (value?.quantity !== null && value?.quantity !== undefined && value?.quantity !== "") {
    const quantity = Number(value.quantity);
    if (Number.isInteger(quantity) && quantity >= 0) return quantity ? "available" : "unavailable";
  }
  const stock = normalizeAssistantSearch(value?.stock || "");
  if (/غير متاح|غير متوفر|نفد|out of stock|unavailable/.test(stock)) return "unavailable";
  if (value?.available === true || /^(متاح|متوفر|available|in stock)$/.test(stock)) return "available";
  return "unknown";
}

const names = {
  search_products: { query: { type: "string", minLength: 1, maxLength: 200 } },
  get_product_details: { product_id: { type: "string", minLength: 1, maxLength: 160 } },
  check_stock: { product_id: { type: "string", minLength: 1, maxLength: 160 } },
  get_category_products: { category: { type: "string", minLength: 1, maxLength: 160 } },
  get_store_policies: { topic: { type: "string", enum: ["returns", "shipping", "payment-policy", "privacy", "contact-policy"] } },
  get_order_status: {},
  handoff_to_human: {}
};
const descriptions = {
  search_products: "Search the current store catalog. Use concise product keywords, not a full customer sentence. Returns up to 6 products; prices are EGP.",
  get_product_details: "Read the current public specifications and prices for a product ID returned by search.",
  check_stock: "Read catalog availability, NOT real-time warehouse stock. Never promises quantities or reservation.",
  get_category_products: "Find products using an Arabic category name or category ID.",
  get_store_policies: "Read the currently deployed policy text. No assumptions about shipping fees or dates.",
  get_order_status: "Provide the secure tracking page. No order lookup or private customer data is available in this chat.",
  handoff_to_human: "Provide the store contact page only. Does not send a notification or create a ticket."
};
export const ASSISTANT_TOOLS = Object.entries(names).map(([name, properties]) => ({
  name, description: descriptions[name], input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false }
}));

export function validToolInput(name, input) {
  if (typeof name !== "string" || !Object.hasOwn(names, name)) return false;
  const properties = names[name];
  if (!properties || !input || Array.isArray(input) || typeof input !== "object") return false;
  if (Object.keys(input).length !== Object.keys(properties).length) return false;
  return Object.entries(properties).every(([key, rule]) => typeof input[key] === "string" &&
    (rule.enum ? rule.enum.includes(input[key]) : input[key].trim().length >= rule.minLength && input[key].length <= rule.maxLength));
}

export function policyText(html, topic) {
  if (!names.get_store_policies.topic.enum.includes(topic)) return "";
  const section = String(html).match(new RegExp(`<article\\b[^>]*id=["']${topic}["'][^>]*>([\\s\\S]*?)<\\/article>`, "i"));
  // Arabic is the complete version in the current site. Bound the tool payload.
  const ar = section?.[1].match(/<div\b[^>]*lang=["']ar["'][^>]*>([\s\S]*?)<\/div>/i);
  return trim((ar?.[1] || section?.[1] || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""), 6500)
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function createAssistantTools({ getProducts, getPolicies, price, hasVariants, productUrl, searchScore }) {
  let loaded;
  const products = async signal => {
    if (!loaded) loaded = getProducts(signal).then(items => {
      if (!Array.isArray(items)) throw new Error("catalog_unavailable");
      return items.filter(p => p && p.active !== false && p.hidden !== true && p.deleted !== true && p.published !== false);
    });
    return loaded;
  };
  function project(p) {
    const choices = hasVariants(p);
    const variants = choices && Array.isArray(p.variants) ? p.variants.slice(0, 20).map(v => ({
      id: trim(v.id, 160), title: trim(v.title, 160), price: v.price !== null && v.price !== "" && Number.isFinite(Number(v.price)) && Number(v.price) > 0 ? Number(v.price) : null,
      availability: catalogAvailability(v)
    })) : [];
    const known = variants.map(v => v.availability);
    const availability = catalogAvailability(p) === "unavailable" ? "unavailable" : variants.length
      ? known.includes("available") ? "available" : known.every(v => v === "unavailable") ? "unavailable" : "unknown"
      : catalogAvailability(p);
    return {
      id: trim(p.id, 160), name: trim(p.name, 250), description: trim(p.description), price: price(p), currency: "EGP", priceFrom: choices,
      priceNote: trim(p.priceNote, 200), variants, availability, availabilitySource: "website_catalog_not_live_inventory",
      url: safeStoreUrl(productUrl(p)), image: p.thumbnail || p.image ? safeStoreUrl(p.thumbnail || p.image) : "",
      category: trim(p.mainCategory || p.category, 160), subcategory: trim(p.subCategory || p.subcategory, 160)
    };
  }
  return async (name, input, signal) => {
    if (!validToolInput(name, input)) return { error: "invalid_tool_input" };
    if (name === "get_order_status") return { status: "verification_required", url: "https://popekyrillos.store/track-order", message: "افتح صفحة متابعة الطلب وأدخل رقم الطلب والهاتف هناك، لا ترسلهما في المحادثة." };
    if (name === "handoff_to_human") return { status: "link_only", url: "https://popekyrillos.store/contact", message: "افتح صفحة التواصل لاختيار واتساب أو الهاتف. لم يُرسل إشعار ولم تُسجل تذكرة." };
    if (name === "get_store_policies") {
      const content = policyText(await getPolicies(signal), input.topic);
      return content ? { text: content, url: `https://popekyrillos.store/policies#${input.topic}` } : { error: "policy_unavailable" };
    }
    const catalog = await products(signal);
    const checkedAt = new Date().toISOString();
    if (name === "get_product_details" || name === "check_stock") {
      const product = catalog.find(p => p.id === input.product_id);
      return product ? { products: [project(product)], checkedAt } : { error: "not_found" };
    }
    if (name === "get_category_products") {
      const category = normalizeAssistantSearch(input.category);
      return { products: catalog.filter(p => [p.mainCategory, p.category, p.subcategory, p.subCategory, ...(p.collections || [])].some(v => normalizeAssistantSearch(v).includes(category))).slice(0, 6).map(project), checkedAt };
    }
    return { products: catalog.map(p => ({ p, score: searchScore(p, assistantSearchQuery(input.query)) })).filter(p => Number.isFinite(p.score)).sort((a, b) => a.score - b.score).slice(0, 6).map(({ p }) => project(p)), checkedAt };
  };
}
