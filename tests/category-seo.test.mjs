import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  applyCategorySeoChange,
  categorySeoContent,
  demoteHeroHeading,
  emptyCategorySeoFile,
  introHtml,
  parseCategorySeoFile,
  serializeCategorySeoFile,
  setCategoryHeading,
  validateCategorySeoEntry
} from "../functions/_category-seo.js";
import { updateCategorySeo } from "../functions/api/update-category-seo.js";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const h1s = (html) => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].trim());
const CENSERS = "altar-vessels/censers";
const BOXES = "altar-vessels/custom-subcategory-1793199421562";
const live = new Set(["altar-vessels", CENSERS, BOXES, "candles-lamps/church-incense"]);
const taxonomyKeys = new Set([...live, "icons-frames", "altar-vessels/chalices"]);
const checks = {
  keyExists: (key) => taxonomyKeys.has(key),
  categoryExists: (key) => live.has(key),
  productExists: (slug) => slug === "شوريه-ستانلس-وسط"
};

test("a category page has one H1, the category name; the banner keeps the store name as text", () => {
  let html = demoteHeroHeading(indexHtml);
  html = setCategoryHeading(html, { title: "الشوريات", breadcrumb: "المذبح والأواني المقدسة / الشوريات", introHtml: "نص", key: CENSERS });
  assert.deepEqual(h1s(html), ["الشوريات"]);
  assert.match(html, /<p id="hero-title" class="hero-title">مكتبة البابا كيرلس<\/p>/);
  assert.match(html, /<header class="mobile-catalog-heading" data-mobile-catalog-heading>/);
  assert.match(html, /<div class="category-intro-wrap" data-category-intro="altar-vessels\/censers"><input type="checkbox" id="category-intro-more" class="category-intro-more" aria-label="[^"]+"><p class="category-intro">نص<\/p><label for="category-intro-more" class="category-intro-toggle" aria-hidden="true"><\/label><\/div>/);
  assert.deepEqual(h1s(indexHtml), ["مكتبة البابا كيرلس", "المنتجات"], "home page HTML keeps its H1");
  assert.doesNotMatch(setCategoryHeading(indexHtml, { title: "x", breadcrumb: "x", introHtml: "", key: "x" }), /data-category-intro/);
});

test("intro links: escaped text, links only to live store pages", () => {
  const liveOnly = (target) => target.type === "category" ? live.has(target.key) : false;
  assert.equal(
    introHtml(`تصفح [علب البخور](/category/${BOXES}) و[فارغ](/category/icons-frames) و[موقع](https://evil.example) <b>`, liveOnly),
    `تصفح <a href="/category/${BOXES}">علب البخور</a> وفارغ وموقع &lt;b&gt;`
  );
  assert.equal(introHtml('[x](/products/a"b)'), "x");
});

test("the file parser keeps only known, bounded, plain-text fields", () => {
  const file = parseCategorySeoFile(JSON.stringify({
    categories: {
      [CENSERS]: { seoTitle: "  عنوان\n\tجديد ", seoDescription: "x".repeat(400), seoRelated: [BOXES, BOXES, "Bad Key!"], extra: "<script>" },
      "../etc": { seoTitle: "no" },
      "altar-vessels/chalices": { seoTitle: "" }
    },
    history: { [CENSERS]: [{ replacedAt: "t", entry: { seoTitle: "قديم" } }] }
  }));
  assert.deepEqual(Object.keys(file.categories), [CENSERS]);
  assert.equal(file.categories[CENSERS].seoTitle, "عنوان جديد");
  assert.equal(file.categories[CENSERS].seoDescription.length, 160);
  assert.deepEqual(file.categories[CENSERS].seoRelated, [BOXES]);
  assert.equal(file.categories[CENSERS].extra, undefined);
  assert.equal(file.history[CENSERS][0].entry.seoTitle, "قديم");
  assert.throws(() => parseCategorySeoFile("not json"));
  assert.throws(() => parseCategorySeoFile("[]"));
});

test("content lookup: a category without an entry gets empty fields (automatic values)", () => {
  const entries = { [CENSERS]: { seoTitle: "ع", seoDescription: "و", seoIntro: "ن", seoRelated: [BOXES, CENSERS] } };
  assert.deepEqual(categorySeoContent({ categoryId: "altar-vessels", subcategoryId: "censers", entries }), { key: CENSERS, seoTitle: "ع", seoDescription: "و", seoIntro: "ن", seoRelated: [BOXES] });
  assert.deepEqual(categorySeoContent({ categoryId: "altar-vessels", subcategoryId: "chalices", entries }), { key: "altar-vessels/chalices", seoTitle: "", seoDescription: "", seoIntro: "", seoRelated: [] });
});

test("validation: HTML, scripts, lengths, bad links and unknown categories are refused", () => {
  const v = (entry, key = CENSERS) => validateCategorySeoEntry(entry, { key, ...checks });
  assert.equal(v({ seoTitle: "<script>alert(1)</script>" }).ok, false);
  assert.equal(v({ seoDescription: "اضغط javascript:alert(1)" }).ok, false);
  assert.equal(v({ seoTitle: "x".repeat(71) }).ok, false);
  assert.equal(v({ seoIntro: "[موقع](https://evil.example)" }).ok, false);
  assert.equal(v({ seoIntro: "[قسم فارغ](/category/icons-frames)" }).ok, false, "empty category is not a link target");
  assert.equal(v({ seoIntro: "[نفسه](/category/altar-vessels/censers)" }).ok, false);
  assert.equal(v({ seoIntro: "[منتج](/products/غير-موجود)" }).ok, false);
  assert.equal(v({ seoIntro: "نص ](مكسور" }).ok, false);
  assert.equal(v({ seoRelated: ["icons-frames"] }).ok, false);
  assert.equal(v({ seoRelated: [CENSERS] }).ok, false);
  assert.equal(v({ seoTitle: "x" }, "no-such-category").ok, false);
  const good = v({ seoTitle: " شوريات ", seoIntro: `[علب](/category/${BOXES}) و[منتج](/products/${encodeURIComponent("شوريه-ستانلس-وسط")})`, seoRelated: [BOXES, BOXES] });
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  assert.deepEqual(good.entry.seoRelated, [BOXES]);
  assert.equal(good.entry.seoTitle, "شوريات");
  assert.equal(v({ seoTitle: "x" }, "icons-frames").ok, true, "an empty but published category can have SEO text");
  assert.equal(v({ seoTitle: " ", seoRelated: [] }).entry, null, "all fields empty = back to automatic");
  assert.equal(v({ seoTitle: "x".repeat(65) }).warnings.length, 1);
});

test("a change touches only its category and keeps the previous value in history", () => {
  let file = emptyCategorySeoFile();
  file = applyCategorySeoChange(file, CENSERS, { seoTitle: "1", seoDescription: "", seoIntro: "", seoRelated: [] }, "t1");
  file = applyCategorySeoChange(file, BOXES, { seoTitle: "b", seoDescription: "", seoIntro: "", seoRelated: [] }, "t2");
  file = applyCategorySeoChange(file, CENSERS, { seoTitle: "2", seoDescription: "", seoIntro: "", seoRelated: [] }, "t3");
  assert.equal(file.categories[BOXES].seoTitle, "b");
  assert.equal(file.categories[CENSERS].seoTitle, "2");
  assert.equal(file.history[CENSERS][0].entry.seoTitle, "1");
  file = applyCategorySeoChange(file, CENSERS, null, "t4");
  assert.equal(file.categories[CENSERS], undefined);
  assert.equal(file.history[CENSERS][0].entry.seoTitle, "2");
  for (let i = 0; i < 8; i += 1) file = applyCategorySeoChange(file, BOXES, { seoTitle: `v${i}`, seoDescription: "", seoIntro: "", seoRelated: [] }, `t${i}`);
  assert.equal(file.history[BOXES].length, 5);
  assert.deepEqual(parseCategorySeoFile(serializeCategorySeoFile(file)).categories, file.categories);
});

// A stand-in for GitHub's contents API: one file, SHA-checked writes.
function fakeGitHub({ initial = null, beforeWrite } = {}) {
  const store = { text: initial, sha: initial ? "sha-0" : "", writes: 0, commits: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    if (method === "GET") {
      if (!store.text) return new Response("{}", { status: 404 });
      return Response.json({ sha: store.sha, content: Buffer.from(store.text, "utf8").toString("base64") });
    }
    const body = JSON.parse(options.body);
    if (beforeWrite) await beforeWrite(store);
    if ((body.sha || "") !== store.sha) return new Response("{}", { status: store.sha && !body.sha ? 422 : 409 });
    store.text = Buffer.from(body.content, "base64").toString("utf8");
    store.writes += 1;
    store.sha = `sha-${store.writes}`;
    store.commits.push(body.message);
    return Response.json({ commit: { sha: `commit-${store.writes}` } });
  };
  return { store, restore: () => { globalThis.fetch = original; } };
}

const env = { GITHUB_TOKEN: "test-token" };
const save = (payload, extra = {}) => updateCategorySeo({ request: new Request("https://x/admin", { method: "POST", body: JSON.stringify(payload) }), env, ...checks, ...extra });

test("save endpoint: creates the file, edits, refuses a stale edit, resets to automatic", async () => {
  const gh = fakeGitHub();
  try {
    let result = await save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "أول" } }, { now: () => "t1" });
    assert.equal(result.status, 200);
    assert.equal(parseCategorySeoFile(gh.store.text).categories[CENSERS].seoTitle, "أول");
    assert.equal(result.text, gh.store.text, "the worker caches exactly the committed text");
    result = await save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "قديم" } });
    assert.equal(result.status, 409, "an admin page opened before the first save cannot overwrite it");
    assert.equal(result.body.current.seoTitle, "أول");
    result = await save({ key: CENSERS, baseUpdatedAt: "t1", entry: { seoTitle: "ثاني" } }, { now: () => "t2" });
    assert.equal(result.status, 200);
    result = await save({ key: CENSERS, baseUpdatedAt: "t2", entry: null }, { now: () => "t3" });
    assert.equal(result.status, 200);
    const file = parseCategorySeoFile(gh.store.text);
    assert.equal(file.categories[CENSERS], undefined);
    assert.equal(file.history[CENSERS][0].entry.seoTitle, "ثاني");
    result = await save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "<b>" } });
    assert.equal(result.status, 400);
    assert.equal(gh.store.writes, 3, "invalid input never reaches GitHub");
  } finally {
    gh.restore();
  }
});

test("save endpoint: a concurrent save of another category is kept (re-applied on the newer file)", async () => {
  let injected = false;
  const gh = fakeGitHub({
    initial: serializeCategorySeoFile(emptyCategorySeoFile()),
    beforeWrite: async (store) => {
      if (injected) return;
      injected = true;
      // Another admin saves the boxes category between our read and our write.
      const other = applyCategorySeoChange(parseCategorySeoFile(store.text), BOXES, { seoTitle: "علب", seoDescription: "", seoIntro: "", seoRelated: [] }, "other");
      store.text = serializeCategorySeoFile(other);
      store.sha = "sha-other";
    }
  });
  try {
    const result = await save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "شوريات" } }, { now: () => "mine" });
    assert.equal(result.status, 200);
    const file = parseCategorySeoFile(gh.store.text);
    assert.equal(file.categories[BOXES].seoTitle, "علب", "the other admin's save survived");
    assert.equal(file.categories[CENSERS].seoTitle, "شوريات");
  } finally {
    gh.restore();
  }
});

test("save endpoint: two saves of the same category from the same version: one wins, one gets 409", async () => {
  const gh = fakeGitHub({ initial: serializeCategorySeoFile(emptyCategorySeoFile()) });
  try {
    const [a, b] = await Promise.all([
      save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "أ" } }, { now: () => "ta" }),
      save({ key: CENSERS, baseUpdatedAt: "", entry: { seoTitle: "ب" } }, { now: () => "tb" })
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const winner = a.status === 200 ? "أ" : "ب";
    assert.equal(parseCategorySeoFile(gh.store.text).categories[CENSERS].seoTitle, winner);
  } finally {
    gh.restore();
  }
});
