export const COLORING_DESIGNS = Object.freeze([
  Object.freeze({
    id: "yota-01",
    name: "ميدالية يوتا 1",
    productId: "custom-1782980654479",
    basePath: "/coloring/yota-01/base.png",
    outlinePath: "/coloring/yota-01/outline.png",
    regionsPath: "/coloring/yota-01/regions.png",
    regionsDataPath: "/coloring/yota-01/regions.json",
    enabled: true,
    status: "ready",
    modelVersion: "yota-01-v6"
  }),
  Object.freeze({
    id: "yota-02",
    name: "ميدالية يوتا 2",
    productId: "custom-1782980654479-copy-1782982056347",
    basePath: "/coloring/yota-02/base.png",
    outlinePath: "/coloring/yota-02/outline.png",
    regionsPath: "/coloring/yota-02/regions.png",
    regionsDataPath: "/coloring/yota-02/regions.json",
    regionOverridesPath: "/coloring/yota-02/region-overrides.json",
    enabled: true,
    status: "ready",
    modelVersion: "yota-02-v14"
  }),
  Object.freeze({
    id: "yota-03",
    name: "ميدالية يوتا 3",
    productId: "custom-1782980654479-copy-1782982056347-copy-1782986984554",
    productImagePath: "/assets/optimized/products/gallery/product-1-3-20260702101011-89b158.webp",
    basePath: "/coloring/yota-03/base.png",
    outlinePath: "/coloring/yota-03/outline.png",
    regionsPath: "/coloring/yota-03/regions.png",
    regionsDataPath: "/coloring/yota-03/regions.json",
    regionOverridesPath: "/coloring/yota-03/region-overrides.json",
    enabled: true,
    status: "ready",
    modelVersion: "yota-03-v7"
  }),
  Object.freeze({
    id: "yota-04",
    name: "ميدالية يوتا 4",
    productId: "custom-1782980654479-copy-1782982056347-copy-1782986984554-copy-1783007327699",
    productImagePath: "/assets/optimized/products/gallery/product-1-4-20260702154908-1f32ba.webp",
    enabled: false,
    status: "missing-region-assets",
    missingAssets: Object.freeze(["base.png", "outline.png", "regions.png", "regions.json"])
  }),
  Object.freeze({
    id: "yota-05",
    name: "ميدالية يوتا 5",
    productId: "custom-1782980654479-copy-1782982056347-copy-1782986984554-copy-1783007327699-copy-1783007378119",
    productImagePath: "/assets/optimized/products/gallery/product-1-5-20260702155020-88d93d.webp",
    enabled: false,
    status: "missing-region-assets",
    missingAssets: Object.freeze(["base.png", "outline.png", "regions.png", "regions.json"])
  }),
  Object.freeze({
    id: "yota-06",
    name: "ميدالية يوتا 6",
    productId: "custom-1782980654479-copy-1782982056347-copy-1782986984554-copy-1783007327699-copy-1783007378119-copy-1783007431642",
    productImagePath: "/assets/optimized/products/gallery/product-1-6-20260702155054-4c2515.webp",
    enabled: false,
    status: "missing-region-assets",
    missingAssets: Object.freeze(["base.png", "outline.png", "regions.png", "regions.json"])
  }),
  Object.freeze({
    id: "yota-07",
    name: "ميدالية يوتا 7",
    productId: "custom-1782980654479-copy-1782982056347-copy-1782986984554-copy-1783007327699-copy-1783007378119-copy-1783007431642-copy-1783007465321",
    productImagePath: "/assets/optimized/products/gallery/product-1-7-20260702155122-9f46d4.webp",
    enabled: false,
    status: "missing-region-assets",
    missingAssets: Object.freeze(["base.png", "outline.png", "regions.png", "regions.json"])
  })
]);

export const coloringDesignForProduct = (product) => {
  const productId = String(product?.id || "");
  const slug = String(product?.slug || "");
  return COLORING_DESIGNS.find((design) => design.enabled !== false && (
    design.productId === productId ||
    (Array.isArray(design.slugs) && design.slugs.includes(slug))
  )) || null;
};

export const coloringDesignById = (modelId) =>
  COLORING_DESIGNS.find((design) => design.id === modelId) || null;

export const coloringDesignStatusForProduct = (product) => {
  const productId = String(product?.id || "");
  const slug = String(product?.slug || "");
  return COLORING_DESIGNS.find((design) =>
    design.productId === productId ||
    (Array.isArray(design.slugs) && design.slugs.includes(slug))
  ) || null;
};

const withoutColoringConfig = (product) => {
  const {
    coloringModelId,
    coloringModelName,
    coloringModelVersion,
    coloringBaseImageUrl,
    coloringMaskUrl,
    coloringOutlineUrl,
    coloringRegionsUrl,
    coloringRegionOverridesUrl,
    coloringRegions,
    shapeGroups,
    ...cleanProduct
  } = product || {};
  return cleanProduct;
};

export const withYotaColoringConfig = (product) => {
  const status = coloringDesignStatusForProduct(product);
  if (!status) return product;

  // Yota products can be duplicated in the catalog together with stale
  // coloring fields. Always clear those fields before selecting by the real
  // product ID, so one model can never display another model's artwork/mask.
  const cleanProduct = withoutColoringConfig(product);
  if (status.enabled === false) return cleanProduct;

  const version = encodeURIComponent(status.modelVersion);
  return {
    ...cleanProduct,
    coloringModelId: status.id,
    coloringModelName: status.name,
    coloringModelVersion: status.modelVersion,
    coloringBaseImageUrl: `${status.basePath}?v=${version}`,
    coloringMaskUrl: `${status.regionsPath}?v=${version}`,
    coloringOutlineUrl: `${status.outlinePath}?v=${version}`,
    coloringRegionsUrl: `${status.regionsDataPath}?v=${version}`,
    ...(status.regionOverridesPath
      ? { coloringRegionOverridesUrl: `${status.regionOverridesPath}?v=${version}` }
      : {})
  };
};
