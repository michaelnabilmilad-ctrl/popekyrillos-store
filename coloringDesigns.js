export const COLORING_DESIGNS = Object.freeze([
  Object.freeze({
    id: "yota-01",
    name: "ميدالية يوتا 1",
    productId: "custom-1782980654479",
    basePath: "/coloring/yota-01/base.png",
    outlinePath: "/coloring/yota-01/outline.png",
    regionsPath: "/coloring/yota-01/regions.png",
    regionsDataPath: "/coloring/yota-01/regions.json",
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
    modelVersion: "yota-02-v7"
  })
]);

export const coloringDesignForProduct = (product) => {
  const productId = String(product?.id || "");
  const slug = String(product?.slug || "");
  return COLORING_DESIGNS.find((design) =>
    design.productId === productId ||
    (Array.isArray(design.slugs) && design.slugs.includes(slug))
  ) || null;
};

export const coloringDesignById = (modelId) =>
  COLORING_DESIGNS.find((design) => design.id === modelId) || null;
