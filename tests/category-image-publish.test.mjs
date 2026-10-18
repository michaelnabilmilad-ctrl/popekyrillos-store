// Category image publishing: admin upload -> taxonomy publish -> what the storefront
// renders. Uses the real Worker with a fake GitHub, admin.js's buildTaxonomyFile(),
// and the storefront's own card-image functions from script.js in a sandbox.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";
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
    console, JSON, String, Number, Array, Object, Map, Set, RegExp, URL, URLSearchParams,
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

// The field the admin's «صورة القسم على الموقع» input writes for a main category.
const adminMainImageField = /<input[^>]*data-taxonomy-main-field="([^"]+)"[^>]*placeholder="اتركه فارغًا لاستخدام الرسمة الافتراضية"/
  .exec(fs.readFileSync("admin.html", "utf8"))?.[1];

test("a main category image set in the admin appears on the storefront tile", async (t) => {
  assert.equal(adminMainImageField, "customImage");
  const github = installFakeGitHub(t, env, seedFiles());
  const edited = baseTaxonomy();
  edited[0][adminMainImageField] = "assets/optimized/products/gallery/new-crosses-tile.webp";
  await publishTaxonomy(edited);
  const live = evaluateTaxonomy(github.text("category-taxonomy.js"));
  const tile = storefrontImages().mainCategoryTileArt(live[0]);
  assert.match(tile, /new-crosses-tile\.webp/);
});

test("changing a category image on the live catalog copy keeps every product and category", async (t) => {
  let products;
  let liveTaxonomySource;
  try {
    products = execSync("git show github/products-data:products.json", { maxBuffer: 1e8 }).toString();
    liveTaxonomySource = execSync("git show github/products-data:category-taxonomy.js", { maxBuffer: 1e8 }).toString();
  } catch {
    t.skip("github/products-data is not fetched in this clone");
    return;
  }
  const github = installFakeGitHub(t, env, { "products.json": products, "category-taxonomy.js": liveTaxonomySource });
  const before = evaluateTaxonomy(liveTaxonomySource);
  const ids = (categories) => categories.flatMap((category) => [category.id, ...category.subcategories.map((sub) => `${category.id}/${sub.id}`)]).sort();

  const edited = JSON.parse(JSON.stringify(before));
  edited.find((category) => category.id === "crosses")[adminMainImageField] = "assets/optimized/products/gallery/new-crosses-tile.webp";
  const { response } = await publishTaxonomy(edited);
  assert.equal(response.status, 200);

  const after = evaluateTaxonomy(github.text("category-taxonomy.js"));
  assert.deepEqual(ids(after), ids(before), "no category or subcategory is added or removed");
  assert.equal(github.text("products.json"), products, "products.json is untouched by a category publish");
  assert.equal(JSON.parse(github.text("products.json")).length, JSON.parse(products).length);
  assert.equal(after.find((category) => category.id === "crosses").customImage, "assets/optimized/products/gallery/new-crosses-tile.webp");
  const unchanged = (list) => list.map(({ customImage, ...rest }) => rest);
  assert.deepEqual(unchanged(after), unchanged(before), "only the edited image field changed");
});

test("existing legacy subcategoryImage values do not change today's main category tiles", () => {
  const tile = storefrontImages().mainCategoryTileArt(baseTaxonomy()[0]);
  assert.match(tile, /<svg/, "without a configured image the built-in drawing stays");
  assert.doesNotMatch(tile, /processional-cross\.webp/);
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

// admin.js verification helpers, with the admin page's relative fetches sent to the Worker.
function adminVerifier(fetchImpl = (path, init) => worker.fetch(new Request(`${SITE}${path}`, init), env, ctx)) {
  const context = { fetch: fetchImpl, setTimeout, Date, Map, Set, Promise };
  vm.createContext(context);
  vm.runInContext(["changedTaxonomyImages", "verifyPublishedTaxonomy"].map((name) => extractFunction(adminSource, name)).join("\n\n"), context);
  return context;
}

test("changedTaxonomyImages lists only new or changed main and subcategory images", () => {
  const before = baseTaxonomy();
  const after = baseTaxonomy();
  after[0].customImage = "assets/optimized/products/gallery/main-new.webp";
  after[0].subcategories[0].customImage = "assets/optimized/products/gallery/sub-new.webp";
  const { changedTaxonomyImages } = adminVerifier();
  assert.deepEqual(JSON.parse(JSON.stringify(changedTaxonomyImages(before, after))), ["assets/optimized/products/gallery/main-new.webp", "assets/optimized/products/gallery/sub-new.webp"]);
  assert.equal(changedTaxonomyImages(after, after).length, 0);
});

test("after a real publish the admin confirms the new image is live on the site", async (t) => {
  installFakeGitHub(t, env, seedFiles());
  const { result } = await uploadTaxonomyImage("hand-crosses");
  const edited = baseTaxonomy();
  edited[0].subcategories[0].customImage = result.path;
  edited[0][adminMainImageField] = result.path;
  assert.equal((await publishTaxonomy(edited)).response.status, 200);
  const { changedTaxonomyImages, verifyPublishedTaxonomy } = adminVerifier();
  const verification = await verifyPublishedTaxonomy(changedTaxonomyImages(baseTaxonomy(), edited), { attempts: 2, delayMs: 0 });
  assert.equal(verification.ok, true, JSON.stringify(verification));
});

test("an image that never reached the site is reported instead of a success message", async (t) => {
  installFakeGitHub(t, env, seedFiles());
  const edited = baseTaxonomy();
  edited[0][adminMainImageField] = "assets/optimized/products/gallery/never-uploaded.webp";
  await publishTaxonomy(edited);
  const verification = await adminVerifier().verifyPublishedTaxonomy(["assets/optimized/products/gallery/never-uploaded.webp"], { attempts: 2, delayMs: 0 });
  assert.equal(verification.ok, false);
  assert.deepEqual([...verification.missing], ["assets/optimized/products/gallery/never-uploaded.webp"]);
});

test("a site still serving the old taxonomy is reported as not live yet", async () => {
  const stale = adminVerifier(async () => new Response("window.POPE_KYRILLOS_TAXONOMY = { categories: [] };", { status: 200 }));
  const verification = await stale.verifyPublishedTaxonomy(["assets/optimized/products/gallery/new.webp"], { attempts: 2, delayMs: 0 });
  assert.equal(verification.ok, false);
});

test("the admin says the categories are live only after verification succeeds", () => {
  const source = extractFunction(adminSource, "publishTaxonomyToSite");
  const verify = source.indexOf("await verifyPublishedTaxonomy(");
  const liveToast = source.indexOf("وظهرت على الموقع.\")");
  assert.ok(verify > 0 && liveToast > verify, "success toast comes after the live check");
  assert.match(source, /if \(verification\.ok\)[\s\S]*else[\s\S]*لسه ما ظهرتش على الموقع/);
});
