import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogIndexHtml,
  insertBeforeServices,
  plainText,
  productDetailSsrHtml,
  productIndexState,
  productLastmod,
  productSeo,
  setCatalogHeading,
  sitemapXml,
  taxonomyView,
  truncateText,
  variantAttribute
} from "../functions/_seo.js";
import { purchasableOffers } from "../functions/_order-pricing.js";

const origin = "https://popekyrillos.store";
const helpers = {
  productPrice: (product) => (Number(product.price) > 0 ? Number(product.price) : null),
  productImages: (product) => product.images || [],
  hasAvailableVariant: (product) => product.stock !== "غير متاح حاليا",
  canonicalProductUrl: (product) => `${origin}/products/${encodeURIComponent(product.slug)}`,
  mainCategoryId: (product) => product.mainCategory
};
const taxonomy = taxonomyView([
  { id: "altar-vessels", name: "المذبح والأواني المقدسة", subcategories: [{ id: "censers", name: "الشوريات" }] },
  { id: "uncategorized", name: "غير مصنف", subcategories: [{ id: "needs-review", name: "يحتاج مراجعة" }] }
]);
const censer = {
  id: "c1",
  slug: "شورية-نحاس",
  name: "شورية نحاس يوناني صغيرة",
  description: "### شورية يوناني صغيرة\n\n**مزخرفة** بالألوان – ذهبي بأجراس",
  price: 12000,
  stock: "متاح",
  images: ["assets/products/censer.webp"],
  mainCategory: "altar-vessels",
  subcategory: "censers"
};

test("plainText strips the admin's markdown but keeps line breaks", () => {
  assert.equal(plainText(censer.description), "شورية يوناني صغيرة\n\nمزخرفة بالألوان – ذهبي بأجراس");
  assert.equal(plainText("وصف\nالاختيارات والأسعار: 1 - 100"), "وصف");
});

test("truncateText cuts on a word boundary", () => {
  const text = "كلمة ".repeat(60);
  const cut = truncateText(text, 40);
  assert.ok(cut.length <= 40);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes("كلم…"));
});

test("productSeo builds title, description, alt, breadcrumbs and Product data from real fields", () => {
  const seo = productSeo(censer, helpers, taxonomy, origin);
  assert.equal(seo.title, "شورية نحاس يوناني صغيرة | مكتبة البابا كيرلس");
  assert.ok(!/[#*]/.test(seo.metaDescription));
  assert.equal(seo.alt, "شورية نحاس يوناني صغيرة – الشوريات");
  assert.equal(seo.robots, "index, follow");
  assert.deepEqual(seo.crumbs.map((crumb) => crumb.name), ["الرئيسية", "المذبح والأواني المقدسة", "الشوريات", censer.name]);
  assert.equal(seo.productLd.offers.price, 12000);
  assert.equal(seo.productLd.offers.priceCurrency, "EGP");
  assert.equal(seo.productLd.offers.availability, "https://schema.org/InStock");
  assert.deepEqual(seo.productLd.image, [`${origin}/assets/products/censer.webp`]);
  assert.equal(seo.breadcrumbLd.itemListElement.length, 4);
});

test("admin seoTitle / seoDescription win over generated values", () => {
  const seo = productSeo({ ...censer, seoTitle: "عنوان مخصص", seoDescription: "وصف مخصص للبحث" }, helpers, taxonomy, origin);
  assert.equal(seo.title, "عنوان مخصص");
  assert.equal(seo.metaDescription, "وصف مخصص للبحث");
});

test("admin imageAlt wins for the main photo", () => {
  assert.equal(productSeo({ ...censer, imageAlt: "شورية نحاس ذهبي بأجراس" }, helpers, taxonomy, origin).alt, "شورية نحاس ذهبي بأجراس");
});

test("products with options become a ProductGroup with one buyable Offer per option", () => {
  const stole = { ...censer, id: "stole-1", sku: "ST-1" };
  const offers = [
    { id: "v1", price: 650, available: true, options: { "الطول": "3.5 متر", "التفصيل": "بدون زاوية" }, sku: "", image: "" },
    { id: "v2", price: 700, available: false, options: { "الطول": "4 متر", "التفصيل": "بزاوية" }, sku: "ST-1-4", image: "assets/v2.webp" },
    { id: "v3", price: null, available: true, options: { "الطول": "5 متر", "التفصيل": "بزاوية" }, sku: "", image: "" }
  ];
  const seo = productSeo(stole, { ...helpers, purchasableOffers: () => offers }, taxonomy, origin);
  const ld = seo.productLd;
  assert.equal(ld["@type"], "ProductGroup");
  assert.equal(ld.productGroupID, "ST-1");
  assert.deepEqual(ld.variesBy, ["https://schema.org/size", "https://schema.org/pattern"]);
  assert.equal(ld.hasVariant[0].pattern, "بدون زاوية");
  assert.equal(ld.hasVariant.length, 2, "an option without a price is never offered");
  const [first, second] = ld.hasVariant;
  assert.equal(first.name, "شورية نحاس يوناني صغيرة – 3.5 متر / بدون زاوية");
  assert.equal(first.size, "3.5 متر");
  assert.equal(first.offers["@type"], "Offer");
  assert.equal(first.offers.price, 650);
  assert.equal(first.offers.url, `${origin}/products/${encodeURIComponent(stole.slug)}?variant=v1`);
  assert.equal(second.offers.availability, "https://schema.org/OutOfStock");
  assert.equal(second.sku, "ST-1-4");
  assert.deepEqual(second.image, [`${origin}/assets/v2.webp`]);
  assert.equal(seo.priceText, "من 650 ج.م إلى 700 ج.م");
  assert.ok(!JSON.stringify(ld).includes("AggregateOffer"));
});

test("medal wood types map to material; a single buyable option stays one Product + Offer", () => {
  const medal = [
    { id: "medal-wood-plywood", price: 18, available: true, options: { "نوع الخشب": "كونتر" }, sku: "", image: "" },
    { id: "medal-wood-beech", price: 27, available: true, options: { "نوع الخشب": "زان" }, sku: "", image: "" }
  ];
  const group = productSeo(censer, { ...helpers, purchasableOffers: () => medal }, taxonomy, origin).productLd;
  assert.deepEqual(group.variesBy, ["https://schema.org/material"]);
  assert.deepEqual(group.hasVariant.map((variant) => [variant.material, variant.offers.price]), [["كونتر", 18], ["زان", 27]]);
  const single = productSeo(censer, { ...helpers, purchasableOffers: () => [medal[1]] }, taxonomy, origin).productLd;
  assert.equal(single["@type"], "Product");
  assert.equal(single.offers.price, 27);
});

test("purchasableOffers uses the order pricing rules (medal wood prices, variant stock)", () => {
  const medal = purchasableOffers({ id: "m", name: "صليب يوتا مادلية موديل 3", price: 20, variants: [{ id: "x", price: 20 }] });
  assert.deepEqual(medal.map((offer) => [offer.id, offer.price]), [["medal-wood-plywood", 18], ["medal-wood-beech", 27]]);
  const stocked = purchasableOffers({ id: "p", name: "قنديل", price: 100, variants: [{ id: "a", price: 100, quantity: 0 }, { id: "b", price: 120 }] });
  assert.deepEqual(stocked.map((offer) => [offer.id, offer.price, offer.available]), [["a", 100, false], ["b", 120, true]]);
  const soldOut = purchasableOffers({ id: "s", name: "شمعة", price: 50, stock: "غير متاح حاليا" });
  assert.equal(soldOut[0].available, false);
});

test("generic option names are classified by their values only when clear", () => {
  assert.equal(variantAttribute("الاختيار", ["أحمر", "أبيض", "ذهبي"]), "color");
  assert.equal(variantAttribute("الاختيار", ["ميني", "صغير", "وسط"]), "size");
  assert.equal(variantAttribute("الاختيار", ["مقاس 1 - 80 ملي", "مقاس 2 - 100 ملي"]), "size");
  assert.equal(variantAttribute("الاختيار", ["كهرباء", "زيت"]), "");
  assert.equal(variantAttribute("الاختيار", ["أحمر", "اختيار 2"]), "");
  assert.equal(variantAttribute("اللغة", ["Arabic", "English"]), "");
});

test("a product without description gets a factual generated one", () => {
  const seo = productSeo({ ...censer, description: "" }, helpers, taxonomy, origin);
  assert.match(seo.metaDescription, /شورية نحاس يوناني صغيرة من مكتبة البابا كيرلس/);
  assert.match(seo.metaDescription, /12,000 ج\.م/);
});

test("placeholder, unpriced and out-of-stock products are handled separately", () => {
  const placeholder = { id: "p", slug: "منتج-جديد", name: "منتج جديد", price: 0, stock: "متاح", images: [], mainCategory: "uncategorized", subcategory: "needs-review" };
  const state = productIndexState(placeholder, helpers);
  assert.equal(state.indexable, false);
  assert.equal(state.inSitemap, false);
  assert.deepEqual(state.reasons.sort(), ["no_image", "no_price", "uncategorized"]);
  const seo = productSeo(placeholder, helpers, taxonomy, origin);
  assert.equal(seo.robots, "noindex, follow");
  assert.equal(seo.productLd.offers, undefined);

  const outOfStock = productIndexState({ ...censer, stock: "غير متاح حاليا" }, helpers);
  // Sold out is temporary: the page stays indexed and in the sitemap.
  assert.equal(outOfStock.indexable, true);
  assert.equal(outOfStock.inSitemap, true);
  assert.equal(outOfStock.inStock, false);
  assert.equal(productSeo({ ...censer, stock: "غير متاح حاليا" }, helpers, taxonomy, origin).productLd.offers.availability, "https://schema.org/OutOfStock");
});

test("sitemap escapes URLs, drops duplicates and omits unknown lastmod", () => {
  const xml = sitemapXml([
    { loc: `${origin}/products/a?x=1&y=2`, lastmod: "2026-10-01" },
    { loc: `${origin}/products/a?x=1&y=2` },
    { loc: `${origin}/` }
  ]);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
  assert.match(xml, /a\?x=1&amp;y=2/);
  assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
  assert.equal(productLastmod({ updatedAt: "2026-10-23T18:37:35.000Z" }), "2026-10-23");
  assert.equal(productLastmod({}), "");
});

test("catalog page helpers insert a crawlable directory and the page heading", () => {
  const html = `<main><section class="catalog"><h1 data-mobile-catalog-title>المنتجات</h1><small data-mobile-catalog-breadcrumb>المنتجات</small></section>
      <section class="services">x</section></main>`;
  const index = catalogIndexHtml({ heading: "كل منتجات الشوريات", products: [{ path: "/products/a", name: "شورية <1>", price: 900 }] });
  const out = insertBeforeServices(setCatalogHeading(html, "الشوريات", "المذبح / الشوريات"), index);
  assert.match(out, /<h1 data-mobile-catalog-title>الشوريات<\/h1>/);
  assert.match(out, /<a href="\/products\/a">شورية &lt;1&gt;<\/a><span>900 ج\.م<\/span>/);
  assert.ok(out.indexOf("data-seo-catalog-index") < out.indexOf('class="services"'));
  assert.equal(catalogIndexHtml({ heading: "x" }), "");
});

test("images on another host (old Shopify imports) keep their full URL", () => {
  const shopify = "https://cdn.shopify.com/s/files/1/0761/files/IMG-1.png?v=1";
  const seo = productSeo({ ...censer, images: [shopify] }, helpers, taxonomy, origin);
  assert.deepEqual(seo.productLd.image, [shopify]);
  assert.match(productDetailSsrHtml(seo), /<img src="https:\/\/cdn\.shopify\.com\/s\/files\/1\/0761\/files\/IMG-1\.png\?v=1"/);
  assert.match(productDetailSsrHtml(productSeo(censer, helpers, taxonomy, origin)), /<img src="\/assets\/products\/censer\.webp"/);
});
