// Server-rendered SEO for the storefront: sitemap, crawlable HTML (product,
// category and catalog pages) and structured data. Everything here is built
// from the live catalog the Worker already loads, so a product or category
// published from /admin shows up without a deploy. Pure functions only: the
// Worker passes in the catalog helpers it already owns.

export const STORE_NAME = "مكتبة البابا كيرلس";

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function jsonLdScript(data, id = "") {
  const attr = id ? ` id="${escapeHtml(id)}"` : "";
  return `<script type="application/ld+json"${attr}>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

// Product descriptions are typed in the admin as light markdown. Search
// snippets and visible SSR copy need the words only, with line breaks kept.
export function plainText(value = "") {
  return String(value)
    .split("الاختيارات والأسعار:")[0]
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+•]\s+/gm, "")
    .replace(/(\*\*|__|\*|`)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function oneLine(value = "") {
  return plainText(value).replace(/\s+/g, " ").trim();
}

// Cuts at a word boundary so snippets never end mid-word.
export function truncateText(value = "", max = 158) {
  const text = oneLine(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s،,.:;–-]+$/u, "")}…`;
}

export function priceLabel(price) {
  return price === null || price === undefined ? "" : `${Number(price).toLocaleString("en-US")} ج.م`;
}

function absoluteUrl(origin, value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${origin}/${raw.replace(/^\/+/, "")}`;
}

function rootPath(value = "") {
  const raw = String(value || "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function textOf(value) {
  if (value && typeof value === "object") return value.ar || value.en || Object.values(value).find(Boolean) || "";
  return value == null ? "" : String(value);
}

// ---------------------------------------------------------------------------
// Taxonomy

export function taxonomyView(categories = []) {
  const byId = new Map();
  const subcategoryById = new Map();
  for (const category of categories || []) {
    if (!category?.id) continue;
    const subcategories = (category.subcategories || []).filter((item) => item?.id);
    byId.set(category.id, { ...category, name: textOf(category.name) || category.id, subcategories });
    for (const subcategory of subcategories) {
      if (!subcategoryById.has(subcategory.id)) subcategoryById.set(subcategory.id, { ...subcategory, name: textOf(subcategory.name) || subcategory.id, parentId: category.id });
    }
  }
  return { categories: [...byId.values()], byId, subcategoryById };
}

// Categories the storefront never presents as a destination.
export function isPublicCategory(category) {
  return Boolean(category) && category.id !== "uncategorized" && category.visible !== false;
}

// ---------------------------------------------------------------------------
// Indexability

// A published product page is indexed and listed in the sitemap when it has
// the facts a shopper and Google need: a name, a real price, a photo and a real
// category. Running out of stock never removes it: the page stays indexable and
// its structured data says OutOfStock until it is back.
export function productIndexState(product, helpers) {
  const reasons = [];
  const name = textOf(product?.name).trim();
  if (!name) reasons.push("missing_name");
  if (helpers.productPrice(product) === null) reasons.push("no_price");
  if (!helpers.productImages(product).length) reasons.push("no_image");
  if (["needs-review"].includes(String(product?.subcategory || "")) || helpers.mainCategoryId(product) === "uncategorized") reasons.push("uncategorized");
  const hiddenFlags = product?.active === false || product?.hidden === true || product?.deleted === true || product?.published === false;
  if (hiddenFlags) reasons.push("hidden");
  const inStock = helpers.hasAvailableVariant(product);
  if (!inStock) reasons.push("out_of_stock");
  const blocking = reasons.filter((reason) => reason !== "out_of_stock");
  return {
    indexable: blocking.length === 0,
    inSitemap: blocking.length === 0,
    inStock,
    reasons
  };
}

// ---------------------------------------------------------------------------
// Product page

// Option names the store uses, mapped to the variant attributes Google reads
// (https://developers.google.com/search/docs/appearance/structured-data/product-variants).
const VARIANT_ATTRIBUTES = {
  "اللون": "color",
  "المقاس": "size",
  "الطول": "size",
  "الوزن": "size",
  "الحجم": "size",
  "حجم الكأس": "size",
  "نوع الخشب": "material",
  "الخامة": "material",
  // Stoles: "بزاوية" / "بدون زاوية" is a design detail of the same length.
  "التفصيل": "pattern"
};
const COLOR_VALUE = /^(?:أحمر|احمر|أسود|اسود|أبيض|ابيض|أزرق|ازرق|أخضر|اخضر|أصفر|اصفر|ذهبي|فضي|بني|بيج|نبيتي|لبني|برتقالي|بنفسجي|موف|رمادي|كحلي|وردي|بينك|سيلفر|جولد|gr[ae]y|navy|black|white|red|blue|green|gold|silver|pink|beige|brown)$/i;
const SIZE_VALUE = /صغير|وسط|متوسط|كبير|ميني|مقاس|\d\s*(?:سم|ملي|مل|لتر|جرام|كيلو|متر)/;

// Generic option names ("الاختيار") are classified by their values; anything
// that is not clearly a colour or a size stays out of variesBy and only names
// the variant.
export function variantAttribute(optionName, values) {
  if (VARIANT_ATTRIBUTES[optionName]) return VARIANT_ATTRIBUTES[optionName];
  const list = values.map((value) => String(value).trim()).filter(Boolean);
  if (!list.length) return "";
  if (list.every((value) => COLOR_VALUE.test(value))) return "color";
  if (list.every((value) => SIZE_VALUE.test(value))) return "size";
  return "";
}

const OFFER_BASE = {
  priceCurrency: "EGP",
  itemCondition: "https://schema.org/NewCondition",
  seller: { "@type": "Organization", name: STORE_NAME }
};

export function productSeo(product, helpers, taxonomy, origin) {
  const name = textOf(product.name).trim();
  const images = helpers.productImages(product).map((image) => absoluteUrl(origin, image)).filter(Boolean);
  const canonical = helpers.canonicalProductUrl(product);
  const inStock = helpers.hasAvailableVariant(product);
  // Prices exactly as an order would be charged (variants, medal wood types).
  const offers = (helpers.purchasableOffers
    ? helpers.purchasableOffers(product)
    : [{ id: "default", price: helpers.productPrice(product), available: inStock, options: {}, sku: "", image: "" }])
    .filter((offer) => offer.price !== null);
  const prices = offers.map((offer) => offer.price);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const price = low;
  const priceText = low === null ? "" : high > low ? `من ${priceLabel(low)} إلى ${priceLabel(high)}` : priceLabel(low);
  const mainId = helpers.mainCategoryId(product);
  const category = taxonomy.byId.get(mainId);
  const subcategory = taxonomy.subcategoryById.get(String(product.subcategory || ""));
  const categoryName = isPublicCategory(category) ? category.name : "";
  const subcategoryName = subcategory && subcategory.parentId === mainId && subcategory.id !== "needs-review" ? subcategory.name : "";
  const kind = subcategoryName || categoryName;
  const description = plainText(textOf(product.description));
  const seoTitle = oneLine(textOf(product.seoTitle));
  const seoDescription = oneLine(textOf(product.seoDescription));
  const generated = `${name} من ${STORE_NAME} لمستلزمات الكنائس${kind ? ` – ${kind}` : ""}.${priceText ? ` السعر ${priceText}.` : ""}`;
  const metaDescription = truncateText(seoDescription || (description.length >= 50 ? description : `${description ? `${description} ` : ""}${generated}`));
  const title = seoTitle || `${name} | ${STORE_NAME}`;
  const alt = oneLine(textOf(product.imageAlt)) || (kind && !name.includes(kind) ? `${name} – ${kind}` : name);
  const state = productIndexState(product, helpers);

  const crumbs = [{ name: "الرئيسية", url: `${origin}/` }];
  if (categoryName) crumbs.push({ name: categoryName, url: `${origin}/category/${encodeURIComponent(mainId)}` });
  if (categoryName && subcategoryName) crumbs.push({ name: subcategoryName, url: `${origin}/category/${encodeURIComponent(mainId)}/${encodeURIComponent(subcategory.id)}` });
  crumbs.push({ name, url: canonical });

  const shared = {
    name,
    description: truncateText(seoDescription || description || generated, 5000),
    image: images.length ? images.slice(0, 10) : undefined,
    category: [categoryName, subcategoryName].filter(Boolean).join(" > ") || undefined,
    brand: { "@type": "Brand", name: STORE_NAME },
    url: canonical
  };
  const availability = (offer) => (offer.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");
  let productLd;
  if (offers.length > 1) {
    // One product page with selectable options: a ProductGroup whose variants
    // each carry the Offer a customer can buy, at a URL that opens that option.
    const optionNames = [...new Set(offers.flatMap((offer) => Object.keys(offer.options)))];
    const attributes = Object.fromEntries(optionNames.map((optionName) => [
      optionName,
      variantAttribute(optionName, offers.map((offer) => textOf(offer.options[optionName])))
    ]));
    const variesBy = [...new Set(Object.values(attributes).filter(Boolean))];
    productLd = {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      ...shared,
      productGroupID: String(product.sku || product.id),
      variesBy: variesBy.length ? variesBy.map((attribute) => `https://schema.org/${attribute}`) : undefined,
      hasVariant: offers.map((offer) => {
        const values = optionNames.map((optionName) => textOf(offer.options[optionName]).trim()).filter(Boolean);
        const variantUrl = `${canonical}?variant=${encodeURIComponent(offer.id)}`;
        const variant = {
          "@type": "Product",
          name: values.length ? `${name} – ${values.join(" / ")}` : `${name} – ${offer.id}`,
          description: shared.description,
          sku: offer.sku || undefined,
          image: offer.image ? [absoluteUrl(origin, offer.image)] : shared.image,
          url: variantUrl,
          offers: { "@type": "Offer", url: variantUrl, price: offer.price, availability: availability(offer), ...OFFER_BASE }
        };
        for (const optionName of optionNames) {
          const attribute = attributes[optionName];
          const value = textOf(offer.options[optionName]).trim();
          if (attribute && value) variant[attribute] = variant[attribute] ? `${variant[attribute]} / ${value}` : value;
        }
        return variant;
      })
    };
  } else {
    productLd = { "@context": "https://schema.org", "@type": "Product", ...shared, sku: product.sku || product.id };
    if (offers.length) productLd.offers = { "@type": "Offer", url: canonical, price: offers[0].price, availability: availability({ available: offers[0].available && inStock }), ...OFFER_BASE };
  }

  return {
    name, title, metaDescription, canonical, price, priceText, images, alt, crumbs, kind,
    // Shown on the page: in stock only when an order for it would be accepted.
    inStock: inStock && offers.some((offer) => offer.available),
    description: description || generated,
    robots: state.indexable ? "index, follow" : "noindex, follow",
    state,
    productLd,
    breadcrumbLd: breadcrumbLd(crumbs)
  };
}

export function breadcrumbLd(crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.url }))
  };
}

export function breadcrumbNavHtml(crumbs, className = "seo-breadcrumb") {
  const items = crumbs.map((crumb, index) => index === crumbs.length - 1
    ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
    : `<a href="${escapeHtml(new URL(crumb.url).pathname)}">${escapeHtml(crumb.name)}</a>`);
  return `<nav class="${className}" aria-label="مسار التنقل">${items.join('<span aria-hidden="true"> / </span>')}</nav>`;
}

// Same classes product-page.js renders, without its data-* hooks, so the page
// looks the same before and after the script replaces it.
export function productDetailSsrHtml(seo) {
  const image = seo.images[0] || "";
  const imageMarkup = image
    ? `<div class="product-route-main-image"><img src="${escapeHtml(rootPath(image.replace(/^https?:\/\/[^/]+/i, "")))}" alt="${escapeHtml(seo.alt)}" width="800" height="800" decoding="async" fetchpriority="high"></div>`
    : "";
  return `<div class="product-route-grid"><div class="product-route-gallery">${imageMarkup}</div><article class="product-route-copy">${seo.kind ? `<p class="product-route-category">${escapeHtml(seo.kind)}</p>` : ""}<h1>${escapeHtml(seo.name)}</h1><p class="product-route-description">${escapeHtml(seo.description)}</p>${seo.price !== null ? `<div class="product-route-price">${escapeHtml(seo.priceText || priceLabel(seo.price))}</div>` : ""}<p class="product-route-message">${seo.inStock ? "متاح" : "غير متاح حاليا"}</p></article></div>`;
}

export function productCardHtml(item) {
  const href = escapeHtml(item.path);
  return `<article class="product-card"><a href="${href}"><img src="${escapeHtml(rootPath(item.thumbnail))}" alt="${escapeHtml(item.alt || item.name)}" width="320" height="320" loading="lazy" decoding="async"></a><div class="product-info"><h3><a href="${href}">${escapeHtml(item.name)}</a></h3>${item.price !== null ? `<span class="price">${escapeHtml(priceLabel(item.price))}</span>` : ""}</div></article>`;
}

// ---------------------------------------------------------------------------
// Catalog pages (/, /products, /category/...)

const catalogIndexStyles = `<style>.seo-catalog-index{max-width:1180px;margin:0 auto;padding:8px clamp(16px,4vw,24px) 28px}.seo-catalog-index details{border:1px solid #ded8cb;border-radius:8px;background:#fffdf7}.seo-catalog-index summary{cursor:pointer;padding:14px 18px;font-weight:800;color:#073d42}.seo-catalog-index h2{margin:0;font-size:16px;display:inline}.seo-catalog-index ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 18px;margin:0;padding:4px 18px 18px;list-style:none}.seo-catalog-index li{display:flex;justify-content:space-between;gap:10px;font-size:14px;line-height:1.6}.seo-catalog-index a{color:#10212a;text-decoration:none}.seo-catalog-index a:hover{text-decoration:underline}.seo-catalog-index li span{color:#85243c;font-weight:800;white-space:nowrap}</style>`;

// A collapsed, visible directory under the catalog: every product (or
// category) of the page as a plain link, readable without JavaScript.
export function catalogIndexHtml({ heading, products = [], categories = [] }) {
  const productItems = products.map((item) => {
    const note = item.inStock === false ? "غير متاح حاليا" : item.price !== null ? priceLabel(item.price) : "";
    return `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>${note ? `<span>${escapeHtml(note)}</span>` : ""}</li>`;
  });
  const categoryItems = categories.map((item) => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>${item.count ? `<span>${item.count} منتج</span>` : ""}</li>`);
  const items = [...categoryItems, ...productItems];
  if (!items.length) return "";
  return `${catalogIndexStyles}<section class="seo-catalog-index" aria-label="${escapeHtml(heading)}" data-seo-catalog-index><details><summary><h2>${escapeHtml(heading)}</h2> (${items.length})</summary><ul>${items.join("")}</ul></details></section>`;
}

export function insertBeforeServices(html, fragment) {
  if (!fragment) return html;
  const marker = /<section class="services"/i;
  if (marker.test(html)) return html.replace(marker, `${fragment}\n      <section class="services"`);
  return html.replace(/<\/main>/i, `${fragment}\n  </main>`);
}

export function setCatalogHeading(html, title, breadcrumb) {
  return html
    .replace(/(<h1 data-mobile-catalog-title>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(title)}$2`)
    .replace(/(<small data-mobile-catalog-breadcrumb>)[\s\S]*?(<\/small>)/i, `$1${escapeHtml(breadcrumb)}$2`);
}

// ---------------------------------------------------------------------------
// Sitemap

export function sitemapXml(entries) {
  const seen = new Set();
  const rows = entries.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc)).map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>${lastmod}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

export function productLastmod(product) {
  for (const value of [product?.updatedAt, product?.sourceUpdatedAt, product?.createdAt]) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return "";
}
