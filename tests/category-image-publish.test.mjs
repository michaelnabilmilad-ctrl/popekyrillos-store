// Category image publishing: admin upload -> taxonomy publish -> what the storefront
// renders. Uses the real Worker with a fake GitHub, admin.js's buildTaxonomyFile(),
// and the storefront's own card-image functions from script.js in a sandbox.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { SITE, adminJsonPost, createAdminEnv, installFakeGitHub } from "./helpers/fake-github.mjs";
import { extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?category-image=${Date.now()}`)).default;
const env = createAdminEnv();
const ctx = { waitUntil() {} };
const adminSource = fs.readFileSync("admin.js", "utf8");
const buildTaxonomyFileSource = extractFunction(adminSource, "buildTaxonomyFile");
const adminTaxonomyFile = (categories) => new Function("taxonomyCategoriesForAdmin", `${buildTaxonomyFileSource}; return buildTaxonomyFile();`)(() => categories);

function evaluateTaxonomy(source) {
  const sandbox = { localStorage: { getItem: () => null, setItem() {} } };
  sandbox.window = sandbox;
  new Function("window", "localStorage", source)(sandbox, sandbox.localStorage);
  return sandbox.POPE_KYRILLOS_TAXONOMY.categories;
}

function storefrontImages() {
  const context = {
    console, JSON, String, Number, Array, Object, Map, Set, RegExp,
    products: [], catalogSubcategoryImages: {}, productsAssetVersion: "v1",
    productMainCategoryId: (product) => product.mainCategoryId, productSubCategoryId: (product) => product.subcategory,
    getProductImages: (product) => product.images || [], hasAvailableVariant: () => true
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("subcategory-image-policy.js", "utf8"), context);
  vm.runInContext(["escapeHtml", "versionedAssetUrl", "taxonomyCardConfiguredImage", "subcategoryCardImage", "mainCategoryTileArt", "historicalMainCategoryArt", "mainCategoryFallbackArt"]
    .map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  return context;
}

const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([16, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(16)]).toString("base64");
const baseTaxonomy = () => [
  { id: "crosses", name: "الصلبان", subcategoryImage: "assets/optimized/products/processional-cross.webp", visible: true, homeVisible: true,
    subcategories: [{ id: "hand-crosses", name: "صلبان يد", customImage: "", visible: true, homeVisible: true }] }
];
const seedFiles = () => ({ "products.json": "[]\n", "category-taxonomy.js": adminTaxonomyFile(baseTaxonomy()) });

async function uploadTaxonomyImage(subcategoryId) {
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/upload-product-image", { filename: "new.png", productId: `taxonomy-${subcategoryId}`, imageBase64: webp }), env, ctx);
  return { response, result: await response.json() };
}

async function publishTaxonomy(categories) {
  const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-taxonomy", { categories, taxonomySource: adminTaxonomyFile(categories) }), env, ctx);
  return { response, result: await response.json() };
}

test("a new subcategory image is uploaded, published, served and rendered on the storefront", async (t) => {
  const github = installFakeGitHub(t, env, seedFiles());
  const { response, result } = await uploadTaxonomyImage("hand-crosses");
  assert.equal(response.status, 200, JSON.stringify(result));

  const edited = baseTaxonomy();
  edited[0].subcategories[0].customImage = result.path;
  const published = await publishTaxonomy(edited);
  assert.equal(published.response.status, 200);

  const live = evaluateTaxonomy(github.text("category-taxonomy.js"));
  const storefront = storefrontImages();
  assert.equal(storefront.subcategoryCardImage(live[0].subcategories[0], live[0]), result.path);

  const image = await worker.fetch(new Request(`${SITE}/${result.path}`), env, ctx);
  assert.equal(image.status, 200, "an uploaded image is served from products-data before any deploy");
  assert.equal(image.headers.get("Content-Type"), "image/webp");
});

test("a main category image set in the admin appears on the storefront tile", { todo: "admin edits `subcategoryImage`; the storefront tile only reads customImage and falls back to built-in drawings" }, async (t) => {
  const github = installFakeGitHub(t, env, seedFiles());
  const edited = baseTaxonomy();
  edited[0].subcategoryImage = "assets/optimized/products/gallery/new-crosses-tile.webp";
  await publishTaxonomy(edited);
  const live = evaluateTaxonomy(github.text("category-taxonomy.js"));
  const tile = storefrontImages().mainCategoryTileArt(live[0]);
  assert.match(tile, /new-crosses-tile\.webp/);
});

test("a failed image upload returns an error status and commits nothing", async (t) => {
  const github = installFakeGitHub(t, env, seedFiles(), { fail: (method, path) => method === "POST" && path === "/git/blobs" ? 500 : 0 });
  const { response, result } = await uploadTaxonomyImage("hand-crosses");
  assert.ok(response.status >= 500, `status ${response.status}`);
  assert.ok(result.error);
  assert.equal(github.commitCount(), 0);
});

test("a rejected taxonomy publish returns an error status and leaves the live file unchanged", async (t) => {
  const github = installFakeGitHub(t, env, seedFiles(), { fail: (method, path) => method === "PATCH" && path.startsWith("/git/refs/heads/") ? 422 : 0 });
  const before = github.text("category-taxonomy.js");
  const edited = baseTaxonomy();
  edited[0].subcategories[0].customImage = "assets/optimized/products/gallery/x.webp";
  const { response } = await publishTaxonomy(edited);
  assert.equal(response.status, 422);
  assert.equal(github.text("category-taxonomy.js"), before);
});

test("the admin shows success toasts only after a successful response", () => {
  for (const name of ["processTaxonomyImageFile", "publishTaxonomyToSite"]) {
    const source = extractFunction(adminSource, name);
    const okCheck = source.indexOf("if (!response.ok)");
    const success = Math.max(source.indexOf("تم رفع الصورة"), source.indexOf("تم حفظ الأقسام"));
    assert.ok(okCheck > 0 && success > okCheck, `${name} must check response.ok before announcing success`);
  }
});

test("publishing confirms the new images are live before saying it succeeded", { todo: "the success message relies on the GitHub commit only" }, () => {
  const source = extractFunction(adminSource, "publishTaxonomyToSite");
  assert.match(source, /category-taxonomy\.js\?[^"`]*verify|verifyPublishedTaxonomy/);
});
