// Category (taxonomy) publishing scenarios through the real Worker against a fake
// GitHub. The taxonomy file is produced by admin.js's own buildTaxonomyFile(), and
// products are shaped the way the admin saves them (mainCategory = Arabic main name,
// subCategory = Arabic sub name, subcategory = sub ID, plus the legacy `category`).
// Tests marked todo describe known defects that the category fix must resolve.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { SITE, adminJsonPost, createAdminEnv, installFakeGitHub } from "./helpers/fake-github.mjs";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };

const worker = (await import(`../cloudflare-worker.js?category-publish=${Date.now()}`)).default;
const env = createAdminEnv();
const ctx = { waitUntil() {} };
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

function setup(t, categories = baseTaxonomy, products = baseProducts(categories)) {
  return installFakeGitHub(t, env, {
    "products.json": `${JSON.stringify(products, null, 2)}\n`,
    "category-taxonomy.js": adminTaxonomyFile(categories)
  });
}

async function publishTaxonomy(categories) {
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", {
    categories,
    taxonomySource: adminTaxonomyFile(categories),
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
  setup(t);
  assert.deepEqual(await catalogIds("category=crosses"), ["cross-1", "cross-2"]);
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"]);
  assert.deepEqual(await catalogIds("category=crosses&subcategory=hand-crosses"), ["cross-1", "cross-2"]);
});

test("the admin-generated taxonomy file publishes and evaluates to the edited categories", async (t) => {
  const github = setup(t);
  const edited = clone(baseTaxonomy);
  edited[0].subcategories.push({ id: "pectoral-crosses", name: "صلبان صدر", visible: true, homeVisible: true });
  await publishTaxonomy(edited);
  const published = evaluateTaxonomy(github.text("category-taxonomy.js"));
  assert.deepEqual(published.categories.map((category) => category.id), ["crosses", "occasions-service"]);
  assert.deepEqual(published.categories[0].subcategories.map((item) => item.id), ["hand-crosses", "pectoral-crosses"]);
});

test("a new subcategory under an existing main category shows its linked product", async (t) => {
  setup(t);
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
  setup(t);
  const edited = clone(baseTaxonomy);
  edited[0].subcategories[0].name = "صلبان اليد الخشب";
  await publishTaxonomy(edited);
  await publishProducts(baseProducts(edited));
  assert.deepEqual(await catalogIds("category=crosses&subcategory=hand-crosses"), ["cross-1", "cross-2"]);
});

test("renaming a main category keeps its products on the category page", { todo: "Worker resolves main categories by a hard-coded Arabic name list" }, async (t) => {
  setup(t);
  const edited = clone(baseTaxonomy);
  edited[1].name = "المناسبات والخدمة";
  await publishTaxonomy(edited);
  await publishProducts(baseProducts(edited));
  assert.deepEqual(await catalogIds("category=occasions-service"), ["gift-1"]);
});

test("a new main category created in the admin shows the products linked to it", { todo: "new main IDs/names are unknown to the Worker; legacy `category` wins" }, async (t) => {
  setup(t);
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

test("publishing categories from a stale admin tab cannot silently undo a newer publish", { todo: "update-taxonomy overwrites the whole file without a base-version check" }, async (t) => {
  const github = setup(t);
  const tabA = clone(baseTaxonomy);
  const tabB = clone(baseTaxonomy);
  tabA[0].subcategories.push({ id: "pectoral-crosses", name: "صلبان صدر", visible: true, homeVisible: true });
  await publishTaxonomy(tabA);
  tabB[1].subcategories[0].name = "هدايا";
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories: tabB, taxonomySource: adminTaxonomyFile(tabB) }), env, ctx);
  const published = evaluateTaxonomy(github.text("category-taxonomy.js"));
  const keptNewSub = published.categories[0].subcategories.some((item) => item.id === "pectoral-crosses");
  assert.ok(response.status === 409 || keptNewSub, "the newer subcategory must survive or the stale publish must be rejected");
});

test("an old local admin draft cannot replace newer published categories on load", { todo: "loadCategoryTaxonomy prefers any valid localStorage draft over the live taxonomy" }, () => {
  const loader = extractFunction(adminSource, "loadCategoryTaxonomy");
  assert.match(loader, /savedAt|baseVersion|CURRENT_TAXONOMY_VERSION/, "draft restore must compare against the live taxonomy version");
});

test("live catalog copy: every product is served under the main category its taxonomy name points to", { todo: "today 19 purchasable live products are hidden and 3 are filed under the wrong main category" }, async (t) => {
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
