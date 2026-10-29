// Category (taxonomy) publishing scenarios through the real Worker against a fake
// GitHub. The taxonomy file is produced by admin.js's own buildTaxonomyFile(), and
// products are shaped the way the admin saves them (mainCategory = Arabic main name,
// subCategory = Arabic sub name, subcategory = sub ID, plus the legacy `category`).
// Tests marked todo describe known defects that the category fix must resolve.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { SITE, adminJsonPost, createAdminEnv, installFakeGitHub, liveTaxonomyVersion } from "./helpers/fake-github.mjs";
import { resetLiveDataMemory } from "../functions/_live-data.js";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };

const worker = (await import(`../cloudflare-worker.js?category-publish=${Date.now()}`)).default;
const env = createAdminEnv();
const ctx = { waitUntil() {} };
// Each test seeds its own fake GitHub: start every test like a new Worker isolate.
test.beforeEach(() => resetLiveDataMemory());
const adminSource = fs.readFileSync("admin.js", "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `admin.js defines ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unbalanced ${name}`);
}

const buildTaxonomyFileSource = extractFunction(adminSource, "buildTaxonomyFile");
function adminTaxonomyFile(categories) {
  return new Function("taxonomyCategoriesForAdmin", `${buildTaxonomyFileSource}; return buildTaxonomyFile();`)(() => categories);
}

function evaluateTaxonomy(source) {
  const store = new Map();
  const localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const sandbox = { localStorage };
  sandbox.window = sandbox;
  new Function("window", "localStorage", source)(sandbox, localStorage);
  return sandbox.POPE_KYRILLOS_TAXONOMY;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const baseTaxonomy = [
  { id: "crosses", name: "الصلبان", visible: true, homeVisible: true, subcategories: [{ id: "hand-crosses", name: "صلبان يد", visible: true, homeVisible: true }] },
  { id: "occasions-service", name: "الهدايا والإكسسوارات", visible: true, homeVisible: true, subcategories: [{ id: "service-gifts", name: "هدايا الخدمة", visible: true, homeVisible: true }] }
];

function productIn(categories, id, mainId, subId, legacyCategory) {
  const main = categories.find((category) => category.id === mainId);
  const sub = main.subcategories.find((item) => item.id === subId);
  return { id, name: `منتج ${id}`, price: 100, stock: "متاح", category: legacyCategory, mainCategory: main.name, subCategory: sub.name, subcategory: sub.id, variants: [] };
}

function baseProducts(categories = baseTaxonomy) {
  return [
    productIn(categories, "cross-1", "crosses", "hand-crosses", "icons"),
    productIn(categories, "cross-2", "crosses", "hand-crosses", "icons"),
    productIn(categories, "gift-1", "occasions-service", "service-gifts", "atb3ho")
  ];
}

// Seeds the fake GitHub, then publishes the taxonomy through the admin endpoint so
// the Worker's in-memory taxonomy (cached ~5s) never carries over between tests.
async function setup(t, categories = baseTaxonomy, products = baseProducts(categories)) {
  const github = installFakeGitHub(t, env, {
    "products.json": `${JSON.stringify(products, null, 2)}\n`,
    "category-taxonomy.js": adminTaxonomyFile(categories)
  });
  await publishTaxonomy(categories);
  return github;
}

async function publishTaxonomy(categories) {
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", {
    categories,
    taxonomySource: adminTaxonomyFile(categories),
    baseVersion: liveTaxonomyVersion(),
    message: "Update category taxonomy from admin test"
  }), env, ctx);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function publishProducts(products, extra = {}) {
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-products", { products, newProductIds: [], deletedProductIds: [], ...extra }), env, ctx);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function catalogIds(query) {
  const response = await worker.fetch(new Request(`${SITE}/api/catalog?${query}&limit=48`), env, ctx);
  assert.equal(response.status, 200);
  return (await response.json()).items.map((item) => item.id).sort();
}

test("baseline: products appear under their existing main and sub categories", async (t) => {
  await setup(t);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-1", "cross-2"]);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"]);
  assert.deepEqual(await catalogIds("category=crosses&subcategory=hand-crosses"), ["cross-1", "cross-2"]);
});

test("the admin-generated taxonomy file publishes and evaluates to the edited categories", async (t) => {
  const github = await setup(t);
  const edited = clone(baseTaxonomy);
  edited[0].subcategories.push({ id: "pectoral-crosses", name: "صلبان صدر", visible: true, homeVisible: true });
  await publishTaxonomy(edited);
  const published = evaluateTaxonomy(github.text("category-taxonomy.js"));
  assert.deepEqual(published.categories.map((category) => category.id), ["crosses", "occasions-service"]);
  assert.deepEqual(published.categories[0].subcategories.map((item) => item.id), ["hand-crosses", "pectoral-crosses"]);
});

test("a new subcategory under an existing main category shows its linked product", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited[0].subcategories.push({ id: "pectoral-crosses", name: "صلبان صدر", visible: true, homeVisible: true });
  await publishTaxonomy(edited);
  const products = baseProducts(edited);
  products[1] = productIn(edited, "cross-2", "crosses", "pectoral-crosses", "icons");
  await publishProducts(products);
  assert.deepEqual(await catalogIds("category=crosses&subcategory=pectoral-crosses"), ["cross-2"]);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-1", "cross-2"]);
});

test("renaming a subcategory keeps its products because the ID is stable", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited[0].subcategories[0].name = "صلبان اليد الخشب";
  await publishTaxonomy(edited);
  await publishProducts(baseProducts(edited));
  assert.deepEqual(await catalogIds("category=crosses&subcategory=hand-crosses"), ["cross-1", "cross-2"]);
});

test("renaming a main category keeps its products on the category page", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited[1].name = "المناسبات والخدمة";
  await publishTaxonomy(edited);
  await publishProducts(baseProducts(edited));
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"]);
});

test("a new main category created in the admin shows the products linked to it", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited.push({ id: "custom-category-1790000000000", name: "قسم رئيسي جديد", visible: true, homeVisible: true, subcategories: [{ id: "custom-subcategory-1790000000001", name: "قسم فرعي جديد", visible: true, homeVisible: true }] });
  await publishTaxonomy(edited);
  const products = baseProducts(edited);
  products[0] = productIn(edited, "cross-1", "custom-category-1790000000000", "custom-subcategory-1790000000001", "icons");
  await publishProducts(products);
  assert.deepEqual(await catalogIds("category=custom-category-1790000000000"), ["cross-1"]);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-2"]);
  assert.deepEqual(await catalogIds("category=icons-frames"), [], "the product must not leak into the legacy icons category");
});

test("publishing categories from a stale admin tab cannot silently undo a newer publish", async (t) => {
  const github = await setup(t);
  const loadedVersion = liveTaxonomyVersion(); // both tabs opened the admin now
  const tabA = clone(baseTaxonomy);
  const tabB = clone(baseTaxonomy);
  tabA[0].subcategories.push({ id: "pectoral-crosses", name: "صلبان صدر", visible: true, homeVisible: true });
  const first = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories: tabA, taxonomySource: adminTaxonomyFile(tabA), baseVersion: loadedVersion }), env, ctx);
  assert.equal(first.status, 200);
  tabB[1].subcategories[0].name = "هدايا";
  const stale = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories: tabB, taxonomySource: adminTaxonomyFile(tabB), baseVersion: loadedVersion }), env, ctx);
  const result = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(result.code, "taxonomy_changed");
  assert.match(result.error, /حدّث صفحة الإدارة/);
  const published = evaluateTaxonomy(github.text("category-taxonomy.js"));
  assert.ok(published.categories[0].subcategories.some((item) => item.id === "pectoral-crosses"), "the newer publish survives");
  assert.equal(published.categories[1].subcategories[0].name, "هدايا الخدمة", "the stale change was not applied");
});

test("an admin page opened before a deploy (no baseVersion) cannot overwrite published categories", async (t) => {
  const github = await setup(t);
  const before = github.text("category-taxonomy.js");
  const oldPage = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories: baseTaxonomy, taxonomySource: adminTaxonomyFile(baseTaxonomy) }), env, ctx);
  assert.equal(oldPage.status, 409);
  assert.equal(github.text("category-taxonomy.js"), before);
});

test("a publish from the current page succeeds and the next publish uses the new version", async (t) => {
  await setup(t);
  const first = clone(baseTaxonomy);
  first[0].name = "الصلبان المقدسة";
  await publishTaxonomy(first);
  const second = clone(first);
  second[0].name = "الصلبان";
  await publishTaxonomy(second);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-1", "cross-2"]);
});

function adminTaxonomyLoader({ liveVersion, draft }) {
  const store = new Map(draft ? [["pope-kyrillos-admin-taxonomy-draft", JSON.stringify(draft)]] : []);
  const toasts = [];
  const context = {
    state: {}, toasts, JSON, String, Array, console,
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) },
    window: { POPE_KYRILLOS_TAXONOMY: { categories: clone(baseTaxonomy), CURRENT_TAXONOMY_VERSION: liveVersion }, POPE_KYRILLOS_CATEGORY_MIGRATION: { categories: (list) => list } },
    TAXONOMY_DRAFT_KEY: "pope-kyrillos-admin-taxonomy-draft",
    deepClone: clone, validateTaxonomy: () => ({ ok: true }), renderTaxonomyManager() {}, refreshTaxonomyDependentUi() {},
    showToast: (message) => toasts.push(message)
  };
  vm.createContext(context);
  vm.runInContext(`async ${extractFunction(adminSource, "loadCategoryTaxonomy")}`, context); // extractor starts at "function"
  return { context, store };
}

test("an old local admin draft cannot replace newer published categories on load", async () => {
  const oldDraftCategories = clone(baseTaxonomy);
  oldDraftCategories[0].name = "اسم قديم من مسودة";
  const { context, store } = adminTaxonomyLoader({ liveVersion: 2000, draft: { baseVersion: "1000", categories: oldDraftCategories } });
  await context.loadCategoryTaxonomy();
  assert.equal(context.state.taxonomy[0].name, "الصلبان", "the live categories are shown");
  assert.equal(context.state.taxonomyBaseVersion, "2000");
  assert.equal(store.has("pope-kyrillos-admin-taxonomy-draft"), false, "the stale draft is discarded");
  assert.match(context.toasts.join(" "), /مسودة أقسام قديمة/);
});

test("a draft made on the current live version is restored", async () => {
  const draftCategories = clone(baseTaxonomy);
  draftCategories[0].name = "تعديل غير منشور";
  const { context } = adminTaxonomyLoader({ liveVersion: 2000, draft: { baseVersion: "2000", categories: draftCategories } });
  await context.loadCategoryTaxonomy();
  assert.equal(context.state.taxonomy[0].name, "تعديل غير منشور");
});

test("live catalog copy: every product is served under the main category its taxonomy name points to", async (t) => {
  let products;
  let source;
  try {
    products = JSON.parse(execSync("git show github/products-data:products.json", { maxBuffer: 1e8 }).toString());
    source = execSync("git show github/products-data:category-taxonomy.js", { maxBuffer: 1e8 }).toString();
  } catch {
    t.skip("github/products-data is not fetched in this clone");
    return;
  }
  installFakeGitHub(t, env, { "products.json": JSON.stringify(products), "category-taxonomy.js": source });
  // Re-publish the unchanged live file so the Worker drops any taxonomy cached by an earlier test.
  const republish = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories: evaluateTaxonomy(source).categories, taxonomySource: source, baseVersion: liveTaxonomyVersion() }), env, ctx);
  assert.equal(republish.status, 200);
  const nameToId = new Map(evaluateTaxonomy(source).categories.map((category) => [category.name, category.id]));
  const served = new Map();
  for (const id of new Set(nameToId.values())) {
    for (let page = 1; ; page += 1) {
      const response = await worker.fetch(new Request(`${SITE}/api/catalog?category=${id}&limit=48&page=${page}`), env, ctx);
      const body = await response.json();
      body.items.forEach((item) => served.set(item.id, [...(served.get(item.id) || []), id]));
      if (!body.hasMore) break;
    }
  }
  const misfiled = products
    .filter((product) => served.has(String(product.id)))
    .filter((product) => !served.get(String(product.id)).includes(nameToId.get(product.mainCategory)));
  const purchasable = (product) => (Array.isArray(product.variants) && product.variants.length
    ? product.variants.some((variant) => variant.available !== false)
    : product.stock !== "غير متاح حاليا" && product.available !== false);
  const hidden = products.filter((product) => nameToId.has(product.mainCategory) && !served.has(String(product.id))
    && product.published !== false && product.deleted !== true && product.hidden !== true && purchasable(product));
  assert.deepEqual({ misfiled: misfiled.map((product) => product.id), hidden: hidden.map((product) => product.id) }, { misfiled: [], hidden: [] });
});

test("renaming a main category without re-saving products keeps them on its page", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited[1].name = "المناسبات والخدمة";
  await publishTaxonomy(edited);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"], "products still carry the old name");
});

test("moving a subcategory to another main category moves its products", async (t) => {
  await setup(t);
  const edited = clone(baseTaxonomy);
  edited[1].subcategories.push(edited[0].subcategories.shift());
  await publishTaxonomy(edited);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["cross-1", "cross-2", "gift-1"]);
  assert.deepEqual(await catalogIds("category=crosses"), []);
  assert.deepEqual(await catalogIds("category=occasions-service&subcategory=hand-crosses"), ["cross-1", "cross-2"]);
});

test("a taxonomy-only publish is not hidden behind a cached catalog response", async (t) => {
  const store = new Map();
  t.mock.method(globalThis.caches.default, "match", async (request) => store.get(request.url)?.clone() || null);
  t.mock.method(globalThis.caches.default, "put", async (request, response) => { store.set(request.url, response); });
  await setup(t);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"]);
  const edited = clone(baseTaxonomy);
  edited[1].subcategories.push(edited[0].subcategories.shift());
  await publishTaxonomy(edited);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["cross-1", "cross-2", "gift-1"]);
});

test("subcategory images are keyed by the main category ID, not its Arabic name", async (t) => {
  await setup(t, baseTaxonomy, baseProducts().map((product) => ({ ...product, images: [`assets/optimized/products/gallery/${product.id}.webp`] })));
  const response = await worker.fetch(new Request(`${SITE}/api/catalog?category=occasions-service&limit=48`), env, ctx);
  const body = await response.json();
  assert.ok(body.subcategoryImages["occasions-service"]?.["service-gifts"], JSON.stringify(Object.keys(body.subcategoryImages)));
  assert.equal(body.subcategoryImages["الهدايا والإكسسوارات"], undefined);
});

test("when the live taxonomy cannot be read, the built-in category lists still work", async (t) => {
  installFakeGitHub(t, env, {
    "products.json": `${JSON.stringify(baseProducts(), null, 2)}\n`,
    "category-taxonomy.js": "window.POPE_KYRILLOS_TAXONOMY = { not: 'parsable' }; const categories = [];"
  });
  const reseed = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", {
    categories: baseTaxonomy,
    taxonomySource: "window.POPE_KYRILLOS_TAXONOMY = { broken: true }; const categories = [];"
  }), env, ctx);
  assert.equal(reseed.status, 200);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-1", "cross-2"]);
});

test("the admin saves a product's main category from its subcategory's parent", () => {
  const context = {
    state: { taxonomy: clone(baseTaxonomy) }, legacyCategoryToMainCategory: {}, String, Array,
    window: { POPE_KYRILLOS_CATEGORY_MIGRATION: { product: (item) => item } }
  };
  context.state.taxonomy[1].subcategories.push(context.state.taxonomy[0].subcategories.shift());
  vm.createContext(context);
  vm.runInContext(["taxonomyCategoriesForAdmin", "findTaxonomyCategory", "findTaxonomySubcategory", "taxonomyCategoryIdFromName",
    "taxonomyCategoryNameFromId", "normalizeMainCategoryValue", "inferredSubcategoryFromProduct", "mainCategoryName"]
    .map((name) => extractFunction(adminSource, name)).join("\n\n"), context);
  assert.equal(context.mainCategoryName(productIn(baseTaxonomy, "cross-1", "crosses", "hand-crosses", "icons")), "الهدايا والإكسسوارات");
  assert.equal(context.mainCategoryName(productIn(baseTaxonomy, "gift-1", "occasions-service", "service-gifts", "atb3ho")), "الهدايا والإكسسوارات");
});
