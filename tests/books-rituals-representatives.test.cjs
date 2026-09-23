const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadTaxonomy() {
  const context = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("category-taxonomy.js", "utf8"), context);
  return context.window.POPE_KYRILLOS_TAXONOMY;
}

test("every books-rituals representative belongs to that exact subcategory", (t) => {
  const policyContext = {};
  vm.createContext(policyContext);
  vm.runInContext(fs.readFileSync("subcategory-image-policy.js", "utf8"), policyContext);
  const { chooseImage } = policyContext.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY;
  const taxonomy = loadTaxonomy();
  const category = taxonomy.categoryById.get("books-rituals");
  const products = JSON.parse(fs.readFileSync("products.json", "utf8"));
  const placeholder = "assets/optimized/hero-papa-kyrillos-products.webp";

  for (const subcategory of category.subcategories) {
    const item = subcategory.id === "tasbeha-books"
      ? { ...subcategory, customImage: "assets/optimized/products/gallery/taxonomy-tasbeha-books-image-20260923213943-22106b.webp" }
      : subcategory;
    const choice = chooseImage({
      categoryId: category.id,
      subcategory: item,
      products,
      getMainId: (product) => taxonomy.categoryIdFromName(product.mainCategory) || product.mainCategory || product.category || "",
      getSubId: (product) => product.subcategory || product.subCategory || "",
      getImages: (product) => Array.isArray(product.images) && product.images.length ? product.images : [product.image || product.images].filter(Boolean),
      isActive: (product) => product.published !== false && product.deleted !== true
    });
    const representative = products.find((product) => String(product.id) === choice.productId) || null;
    const trace = {
      taxonomyId: item.id,
      representativeProductId: representative?.id || null,
      representativeProductCategory: representative ? (taxonomy.categoryIdFromName(representative.mainCategory) || representative.mainCategory || representative.category || null) : null,
      representativeProductSubcategory: representative?.subcategory || representative?.subCategory || null,
      finalImage: choice.image || placeholder
    };
    t.diagnostic(JSON.stringify(trace));
    if (representative) {
      assert.equal(trace.representativeProductCategory, category.id, `${item.id}: main category mismatch`);
      assert.equal(trace.representativeProductSubcategory, item.id, `${item.id}: subcategory mismatch`);
    }
    if (!choice.image) assert.equal(trace.finalImage, placeholder);
  }
});
