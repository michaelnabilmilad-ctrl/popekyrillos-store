import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { categorySeoContent, categorySeoDefaults, demoteHeroHeading, introHtml, setCategoryHeading } from "../functions/_category-seo.js";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const h1s = (html) => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].trim());

test("a category page has one H1, the category name; the banner keeps the store name as text", () => {
  let html = demoteHeroHeading(indexHtml);
  html = setCategoryHeading(html, { title: "الشوريات", breadcrumb: "المذبح والأواني المقدسة / الشوريات", intro: "نص", key: "altar-vessels/censers" });
  assert.deepEqual(h1s(html), ["الشوريات"]);
  assert.match(html, /<p id="hero-title" class="hero-title">مكتبة البابا كيرلس<\/p>/);
  assert.match(html, /<header class="mobile-catalog-heading" data-mobile-catalog-heading>/, "server-rendered heading is not hidden");
  assert.match(html, /<small data-mobile-catalog-breadcrumb>المذبح والأواني المقدسة \/ الشوريات<\/small>/);
  assert.match(html, /<\/h1>\n\s*<div class="category-intro-wrap" data-category-intro="altar-vessels\/censers"><input type="checkbox" id="category-intro-more" class="category-intro-more" aria-label="[^"]+"><p class="category-intro">نص<\/p><label for="category-intro-more" class="category-intro-toggle" aria-hidden="true"><\/label><\/div>/);
});

test("the home page HTML keeps its H1 (the demotion runs on category pages only)", () => {
  assert.deepEqual(h1s(indexHtml), ["مكتبة البابا كيرلس", "المنتجات"]);
});

test("a category without SEO content gets no intro paragraph", () => {
  const html = setCategoryHeading(indexHtml, { title: "الكؤوس", breadcrumb: "x", intro: "", key: "altar-vessels/chalices" });
  assert.doesNotMatch(html, /data-category-intro/);
});

test("intro links: only internal store paths become links, everything is escaped", () => {
  assert.equal(
    introHtml("تصفح [علب البخور](/category/altar-vessels/custom-subcategory-1793199421562) و[موقع](https://evil.example) <b>"),
    'تصفح <a href="/category/altar-vessels/custom-subcategory-1793199421562">علب البخور</a> و موقع &lt;b&gt;'.replace("و موقع", "وموقع")
  );
  assert.equal(introHtml("[x](/products/a\"b)"), "x");
});

test("taxonomy fields override the built-in defaults field by field", () => {
  const defaults = categorySeoContent({ categoryId: "altar-vessels", subcategoryId: "censers" });
  assert.equal(defaults.seoTitle, categorySeoDefaults["altar-vessels/censers"].seoTitle);
  assert.ok(defaults.seoRelated.includes("candles-lamps/church-incense"));
  const own = categorySeoContent({ categoryId: "altar-vessels", subcategoryId: "censers", subcategory: { seoTitle: "  عنوان   من الإدارة " } });
  assert.equal(own.seoTitle, "عنوان من الإدارة");
  assert.equal(own.seoDescription, defaults.seoDescription);
  const none = categorySeoContent({ categoryId: "altar-vessels", subcategoryId: "chalices", subcategory: {} });
  assert.deepEqual([none.seoTitle, none.seoDescription, none.seoIntro, none.seoRelated], ["", "", "", []]);
  const mainCategory = categorySeoContent({ categoryId: "crosses", category: { seoIntro: "صلبان" } });
  assert.equal(mainCategory.key, "crosses");
  assert.equal(mainCategory.seoIntro, "صلبان");
});

test("censers texts: meta within Google's length, no prices, only real product types", () => {
  const { seoTitle, seoDescription, seoIntro } = categorySeoDefaults["altar-vessels/censers"];
  assert.ok(seoDescription.length <= 158, `meta ${seoDescription.length}`);
  for (const value of [seoTitle, seoDescription, seoIntro]) assert.doesNotMatch(value, /ج\.م|جنيه|[0-9]+\s*منتج/);
  assert.match(seoIntro, /\]\(\/category\/candles-lamps\/church-incense\)/);
});
