(function (root) {
  function validImageValue(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const image = value.trim();
    if (/^(?:javascript|data:text|blob):/i.test(image)) return "";
    return image;
  }

  function chooseImage({ categoryId, subcategory, products, getMainId, getSubId, getImages, isActive }) {
    const manualImage = validImageValue(subcategory?.manualImage);
    if (manualImage) return { image: manualImage, source: "manual", productId: "" };
    if (!categoryId || !subcategory?.id) return { image: "", source: "none", productId: "" };

    const eligible = (products || []).filter((product) => getMainId(product) === categoryId
      && getSubId(product) === subcategory.id && isActive(product));
    const representative = subcategory.representativeProductId
      ? eligible.find((product) => String(product.id) === String(subcategory.representativeProductId))
      : null;
    const ordered = representative ? [representative, ...eligible.filter((product) => product !== representative)] : eligible;
    for (const product of ordered) {
      const image = validImageValue((getImages(product) || [])[0]);
      if (image) return { image, source: representative === product ? "representative-product" : "category-product", productId: String(product.id || "") };
    }
    return { image: "", source: "none", productId: "" };
  }

  root.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY = { validImageValue, chooseImage };
})(typeof window === "object" ? window : globalThis);
