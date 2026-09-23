(function (root) {
  function validImageValue(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const image = value.trim();
    if (/^(?:javascript|data:text|blob):/i.test(image)) return "";
    return image.replace(/^\/?public\//, "/");
  }

  function configuredImage(taxonomyItem) {
    if (!taxonomyItem || typeof taxonomyItem !== "object") return "";
    const value = taxonomyItem.customImage
      || taxonomyItem.manualImage
      || taxonomyItem.taxonomyImage
      || taxonomyItem.subcategoryImage
      || taxonomyItem.imageUrl
      || taxonomyItem.imageURL
      || taxonomyItem.image_url
      || taxonomyItem.image
      || taxonomyItem.thumbnail
      || taxonomyItem.thumbnailUrl
      || taxonomyItem.cover
      || taxonomyItem.categoryImage
      || "";
    return validImageValue(value);
  }

  function chooseImage({ categoryId, subcategory, products, getMainId, getSubId, getImages, isActive, getConfiguredImage }) {
    const customImage = validImageValue(typeof getConfiguredImage === "function" ? getConfiguredImage(subcategory) : configuredImage(subcategory));
    if (customImage) return { image: customImage, source: "configured", productId: "" };
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

  root.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY = { validImageValue, configuredImage, chooseImage };
})(typeof window === "object" ? window : globalThis);
