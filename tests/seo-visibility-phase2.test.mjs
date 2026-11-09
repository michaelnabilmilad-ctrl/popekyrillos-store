import assert from "node:assert/strict";
import test from "node:test";
import { googleProductCategory, merchantReturnPolicy, productSeo, taxonomyView } from "../functions/_seo.js";
import { LEGACY_PRODUCT_IDS, collectionPath, legacyRoute, mayBeLegacyPath, normalizeArabicHandle } from "../functions/_legacy-redirects.js";

const origin = "https://popekyrillos.store";
const helpers = {
  productPrice: (product) => (Number(product.price) > 0 ? Number(product.price) : null),
  productImages: (product) => product.images || [],
  hasAvailableVariant: (product) => product.stock !== "غير متاح حاليا",
  canonicalProductUrl: (product) => `${origin}/products/${encodeURIComponent(product.slug)}`,
  mainCategoryId: (product) => product.mainCategory
};
const taxonomy = taxonomyView([
  { id: "candles-lamps", name: "الشمع والبخور", subcategories: [{ id: "church-candles", name: "شمع الكنيسة" }] },
  { id: "occasions-service", name: "المناسبات والخدمة", subcategories: [{ id: "personalized", name: "منتجات مطبوعة ومخصصة" }] }
]);
const candle = {
  id: "old-1", slug: "شمعه-شماس", name: "شمعة شماس شكل صليب", price: 300, stock: "متاح",
  description: "صليب شمعة مضيء مصمم بأناقة يجمع بين الروحانية والعملية ويعمل بالشحن عبر وصلة تايب سي.",
  images: ["assets/a.webp"], mainCategory: "candles-lamps", subcategory: "church-candles"
};

test("category is a Google product category code, never Arabic text", () => {
  const seo = productSeo(candle, helpers, taxonomy, origin);
  assert.deepEqual(seo.productLd.category, {
    "@type": "CategoryCode",
    inCodeSet: "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt",
    codeValue: "588"
  });
  assert.equal(googleProductCategory("crosses", "hand-crosses").codeValue, "97");
  assert.equal(googleProductCategory("books-rituals", "katameros").codeValue, "543543");
  assert.equal(googleProductCategory("books-rituals", "book-accessories").codeValue, "6174");
  assert.equal(googleProductCategory("church-vestments", "stoles").codeValue, "5483");
  // The Arabic path is still on the page as breadcrumbs.
  assert.deepEqual(seo.breadcrumbLd.itemListElement.map((item) => item.name), ["الرئيسية", "الشمع والبخور", "شمع الكنيسة", "شمعة شماس شكل صليب"]);
});

test("every offer carries the store's real return policy", () => {
  const seo = productSeo(candle, helpers, taxonomy, origin);
  const policy = seo.productLd.offers.hasMerchantReturnPolicy;
  assert.equal(policy.applicableCountry, "EG");
  assert.equal(policy.merchantReturnDays, 14);
  assert.equal(policy.returnPolicyCategory, "https://schema.org/MerchantReturnFiniteReturnWindow");
  assert.equal(policy.itemDefectReturnFees, "https://schema.org/FreeReturn");
  assert.equal(policy.merchantReturnLink, `${origin}/policies#returns`);
  // Not stated on the policy page, so not claimed.
  assert.equal(policy.returnFees, undefined);
  assert.equal(seo.productLd.offers.shippingDetails, undefined);

  const bookmark = { ...candle, id: "p2", slug: "بوك-مارك-بالاسم", name: "بوك مارك بالاسم", mainCategory: "occasions-service", subcategory: "personalized" };
  const custom = productSeo(bookmark, helpers, taxonomy, origin).productLd.offers.hasMerchantReturnPolicy;
  assert.equal(custom.returnPolicyCategory, "https://schema.org/MerchantReturnNotPermitted");
  assert.equal(custom.merchantReturnDays, undefined);
  assert.equal(merchantReturnPolicy(origin, "church-candles").merchantReturnDays, 14);
});

test("variant offers carry the return policy too", () => {
  const stole = {
    ...candle, id: "s1", slug: "بطرشيل", name: "بطرشيل", hasVariants: true,
    options: [{ name: "الطول", values: ["3.5 متر", "4 متر"] }],
    variants: [
      { id: "v1", price: 900, available: true, options: { "الطول": "3.5 متر" } },
      { id: "v2", price: 1000, available: true, options: { "الطول": "4 متر" } }
    ]
  };
  const ld = productSeo(stole, { ...helpers, purchasableOffers: (p) => p.variants.map((v) => ({ id: v.id, price: v.price, available: true, options: v.options })) }, taxonomy, origin).productLd;
  assert.equal(ld["@type"], "ProductGroup");
  assert.ok(ld.hasVariant.every((variant) => variant.offers.hasMerchantReturnPolicy.merchantReturnDays === 14));
});

test("products sharing one description get a snippet that starts with their own name", () => {
  const model2 = { ...candle, name: "شمعة شماس شكل صليب موديل 2", slug: "m2" };
  const plain = productSeo(model2, helpers, taxonomy, origin).metaDescription;
  const distinct = productSeo(model2, { ...helpers, isSharedDescription: () => true }, taxonomy, origin);
  assert.ok(plain.startsWith("صليب شمعة"));
  assert.ok(distinct.metaDescription.startsWith("شمعة شماس شكل صليب موديل 2 – 300 ج.م. صليب شمعة"));
  // The page text itself is unchanged.
  assert.equal(distinct.description, productSeo(model2, helpers, taxonomy, origin).description);
  // An admin SEO description always wins.
  const own = productSeo({ ...model2, seoDescription: "وصف مخصص للمنتج يكتبه صاحب المتجر من لوحة الإدارة." }, { ...helpers, isSharedDescription: () => true }, taxonomy, origin);
  assert.equal(own.metaDescription, "وصف مخصص للمنتج يكتبه صاحب المتجر من لوحة الإدارة.");
});

test("old Shopify links map to the right destination", () => {
  assert.deepEqual(legacyRoute("/en"), { redirect: "/" });
  assert.deepEqual(legacyRoute("/en/"), { redirect: "/" });
  assert.deepEqual(legacyRoute("/en/policies/privacy-policy"), { redirect: "/policies" });
  assert.deepEqual(legacyRoute("/policies/refund-policy"), { redirect: "/policies" });
  assert.deepEqual(legacyRoute("/pages/contact"), { redirect: "/contact" });
  assert.deepEqual(legacyRoute("/pages/about-us"), { redirect: "/" });
  assert.deepEqual(legacyRoute("/search", "?q=%D8%B5%D9%84%D9%8A%D8%A8"), { redirect: "/products?q=%D8%B5%D9%84%D9%8A%D8%A8" });
  assert.deepEqual(legacyRoute("/search"), { redirect: "/products" });
  assert.deepEqual(legacyRoute("/collections/all"), { redirect: "/products" });
  assert.deepEqual(legacyRoute(`/en/collections/${encodeURIComponent("علب-بخور")}`), { collection: "علب-بخور", productHandle: "" });
  assert.deepEqual(legacyRoute(`/products/${encodeURIComponent("أنبوبة-رفات-قديسين-زان-مقاس-3")}`), { productId: LEGACY_PRODUCT_IDS["أنبوبة-رفات-قديسين-زان-مقاس-3"] });
  assert.deepEqual(legacyRoute("/category/brass"), { categoryId: "altar-vessels" });
  assert.deepEqual(legacyRoute("/category/atb3ho"), { categoryId: "occasions-service" });
  for (const gone of ["/cdn/shop/t/4/assets/component.js", "/cdn", "/services/login_with_shop/authorize", "/wpm", "/cart/update", "/cart/change", "/en/cart", "/search/suggest", "/en/search/suggest"]) {
    assert.deepEqual(legacyRoute(gone), { gone: true }, gone);
  }
});

test("current pages are never treated as old links", () => {
  for (const path of ["/", "/products", "/contact", "/policies", "/cart", "/checkout", "/category/crosses", "/category/crosses/hand-crosses", "/sitemap.xml", "/admin/", "/api/catalog"]) {
    assert.equal(legacyRoute(path), null, path);
  }
  assert.equal(legacyRoute(`/products/${encodeURIComponent("شمعه-شحن")}`), null);
  assert.equal(mayBeLegacyPath("/api/catalog"), false);
  assert.equal(mayBeLegacyPath("/assets/optimized/x.webp"), false);
  // Unknown junk keeps its normal 404.
  assert.equal(legacyRoute("/b"), null);
  assert.equal(legacyRoute("/v1/produce"), null);
});

test("old collections resolve to today's subcategory by reviewed map or exact name", () => {
  const categories = [
    { id: "altar-vessels", name: "المذبح والأواني المقدسة", subcategories: [{ id: "custom-subcategory-1793199421562", name: "علب بخور" }, { id: "censers", name: "الشوريات" }] },
    { id: "books-rituals", name: "الكتب والطقوس", subcategories: [{ id: "bibles", name: "الكتاب المقدس" }, { id: "book-accessories", name: "فواصل وجرابات الكتب" }] }
  ];
  assert.equal(collectionPath("علب-بخور", categories), "/category/altar-vessels/custom-subcategory-1793199421562");
  assert.equal(collectionPath("جرابات-كتاب-مقدس", categories), "/category/books-rituals/book-accessories");
  assert.equal(collectionPath("شوريات", categories), "");
  assert.equal(collectionPath("حاجة-مش-موجودة", categories), "");
  assert.equal(normalizeArabicHandle("علبة-بخور"), normalizeArabicHandle("علبه بخور"));
});
