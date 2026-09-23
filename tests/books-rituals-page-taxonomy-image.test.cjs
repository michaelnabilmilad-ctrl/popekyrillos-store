const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("/category/books-rituals renders the published tasbeha taxonomy image", () => {
  const policyContext = {};
  vm.createContext(policyContext);
  vm.runInContext(fs.readFileSync("subcategory-image-policy.js", "utf8"), policyContext);

  const source = fs.readFileSync("script.js", "utf8");
  const resolverStart = source.indexOf("function subcategoryCardImage");
  const rendererEnd = source.indexOf("function updateFilterButtons", resolverStart);
  assert.notEqual(resolverStart, -1);
  assert.notEqual(rendererEnd, -1);

  const customImage = "assets/optimized/products/gallery/taxonomy-tasbeha-books-image-20260922085412-aa5aff.webp";
  const representativeImage = "assets/optimized/products/gallery/tasbeha-giza-annual-psalmody.webp";
  const tasbeha = {
    id: "tasbeha-books",
    name: "كتب التسبحة",
    subcategoryImage: "assets/optimized/products/gallery/baskha-araby.webp",
    customImage,
    representativeProductId: "tasbeha-representative"
  };
  const category = { id: "books-rituals", name: "الكتب والطقوس", subcategories: [tasbeha] };
  const cardRoot = { hidden: true, innerHTML: "", dataset: {} };
  const context = {
    window: { POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY: policyContext.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY },
    taxonomy: { categoryById: new Map([[category.id, category]]), categoryImage: () => "" },
    products: [{ id: "tasbeha-representative", mainCategory: category.id, subcategory: tasbeha.id, images: [representativeImage] }],
    catalogSubcategoryImages: { [category.id]: { [tasbeha.id]: representativeImage } },
    catalogSubcategoryCountsLoaded: true,
    subcategoryCards: cardRoot,
    state: { filter: category.id, labelFilter: "", subcategoryCardsCategory: "", subcategoryCardsExpanded: false },
    productsAssetVersion: "integration-test",
    normalizeCategoryFilter: (value) => value,
    orderedLabelsForCategory: () => [tasbeha],
    fullSubcategoryProductCount: () => 3,
    fullCategoryProductCount: () => 3,
    productMainCategoryId: (product) => product.mainCategory,
    productSubCategoryId: (product) => product.subcategory,
    getProductImages: (product) => product.images,
    hasAvailableVariant: () => true,
    localized: (value) => value,
    t: (key) => key === "labelAll" ? "كل الأقسام الفرعية" : key,
    formatter: { format: String },
    displayText: String,
    isEnglish: () => false,
    escapeHtml: (value) => String(value),
    versionedAssetUrl: (value) => value.startsWith("assets/") ? `/${value}` : value
  };
  vm.createContext(context);
  vm.runInContext(source.slice(resolverStart, rendererEnd), context);
  vm.runInContext("renderSubcategoryCards()", context);

  const card = cardRoot.innerHTML.match(/data-subcategory-card="tasbeha-books"[\s\S]*?<img src="([^"]+)"/);
  assert.ok(card, "tasbeha-books card must be present on the books route");
  assert.equal(card[1], `/${customImage}`);
  assert.doesNotMatch(card[1], /tasbeha-giza-annual-psalmody/);
});
