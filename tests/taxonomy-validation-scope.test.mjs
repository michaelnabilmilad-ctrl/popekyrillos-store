// Category admin: a product-link problem that already exists in the published
// taxonomy must not block every later category/image publish, while a change that
// breaks product links still does. Products must not be published ahead of the
// taxonomy they point to.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { extractFunction } from "./helpers/storefront-sandbox.mjs";

const admin = fs.readFileSync("admin.js", "utf8");
const css = fs.readFileSync("admin.css", "utf8");

function sandbox({ products, original }) {
  const context = { state: { products, originalTaxonomy: original }, legacyCategoryToMainCategory: { brass: "altar-tools" }, String, Set, Map, Boolean };
  vm.createContext(context);
  vm.runInContext(["validateTaxonomy", "productTaxonomyLinkIssues", "summarizeIssues"].map((name) => extractFunction(admin, name)).join("\n\n"), context);
  return context;
}

const taxonomy = () => [
  { id: "altar-vessels", name: "المذبح", subcategories: [{ id: "censers", name: "الشوريات" }, { id: "relic-boxes", name: "حافظات رفات" }] },
  { id: "church-equipment", name: "تجهيز الكنائس", subcategories: [{ id: "chairs", name: "كراسي" }] }
];
const products = [
  { id: "p1", name: "شورية", mainCategory: "المذبح", subcategory: "censers" },
  // Stale main label: the subcategory's parent wins everywhere, so this is not broken.
  { id: "p2", name: "حق ذخيرة", mainCategory: "تجهيز الكنائس", subcategory: "relic-boxes" },
  // Points at a subcategory that was never published.
  { id: "p3", name: "بيضة نعام", mainCategory: "تجهيز الكنائس", subcategory: "custom-subcategory-1", subCategory: "بيض نعام" }
];

test("existing broken links are warnings and do not block a publish", () => {
  const context = sandbox({ products, original: taxonomy() });
  const next = taxonomy();
  next[0].subcategories[0].customImage = "assets/optimized/products/gallery/new.webp";
  const result = context.validateTaxonomy(next);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /بيضة نعام/);
});

test("a stale mainCategory label is not reported as a broken link", () => {
  const context = sandbox({ products, original: taxonomy() });
  const issues = context.productTaxonomyLinkIssues(taxonomy());
  assert.equal(issues.has("p2"), false);
});

test("an edit that breaks product links still blocks", () => {
  const context = sandbox({ products, original: taxonomy() });
  const next = taxonomy();
  next[0].subcategories[0].id = "censers-renamed";
  const result = context.validateTaxonomy(next);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /شورية/);
});

test("adding a new main category and subcategory validates", () => {
  const context = sandbox({ products, original: taxonomy() });
  const next = [...taxonomy(), { id: "custom-category-1", name: "قسم رئيسي جديد", subcategories: [{ id: "custom-subcategory-2", name: "قسم فرعي جديد" }] }];
  assert.equal(context.validateTaxonomy(next).ok, true);
});

test("long issue lists are summarised and the toast cannot cover the page", () => {
  const context = sandbox({ products, original: taxonomy() });
  const text = context.summarizeIssues("عنوان", Array.from({ length: 40 }, (_, index) => `مشكلة ${index}`));
  assert.equal(text.split("\n").length, 7);
  assert.match(text, /و35 غيرهم/);
  assert.match(css, /\.toast \{[^}]*max-height:[^}]*overflow-y: auto/);
});

test("products publish waits for unpublished new or moved subcategories", () => {
  assert.match(admin, /const pendingTaxonomy = productsWaitingForTaxonomyPublish\(\);\s*if \(pendingTaxonomy\.length\)/);
  assert.match(admin, /unknownSubcategoryId && product\.subCategory \? product\.subCategory : subCategoryName\(product\)/);
});
