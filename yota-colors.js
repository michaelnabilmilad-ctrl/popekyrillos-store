(function initializeYotaColors(global) {
  const sourceImage = "assets/optimized/products/gallery/product-1-image-20260705172724-e7fdfd.webp";
  const sourceProductIds = ["custom-1783032232212", "custom-1783272387022"];
  const colors = [
    { id: "red", name: "أحمر", hex: "#D00101", available: true },
    { id: "black", name: "أسود", hex: "#1A1A1A", available: true },
    { id: "white", name: "أبيض", hex: "#F7F6F6", available: true },
    { id: "yellow", name: "أصفر", hex: "#FEC105", available: true },
    { id: "green", name: "أخضر", hex: "#035207", available: true },
    { id: "silver", name: "فضي", hex: "#C1C1C1", available: true },
    { id: "burgundy", name: "نبيتي", hex: "#640310", available: true },
    { id: "light-blue", name: "لبني", hex: "#72BFFB", available: true },
    { id: "brown", name: "بني", hex: "#4F2108", available: true },
    { id: "beige", name: "بيج", hex: "#F7D1A7", available: true },
    { id: "orange", name: "برتقالي", hex: "#FE6E02", available: true },
    { id: "dark-blue", name: "أزرق غامق", hex: "#173F73", available: true },
    {
      id: "gold",
      name: "ذهبي",
      hex: "#C9A227",
      highlight: "#F2D56B",
      shadow: "#806313",
      metallic: true,
      available: true
    }
  ].map((color, order) => Object.freeze({
    ...color,
    order,
    source: color.id === "gold" ? "إعداد اللون الذهبي المعتمد" : sourceImage
  }));

  const YOTA_COLORS = Object.freeze(colors);
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase();
  const isYotaColorProduct = (product) => {
    if (sourceProductIds.includes(product?.id)) return true;
    const name = normalize(product?.name);
    return /(?:ألوان|لون تلوين).*(?:اليوتا|اليوطا)/.test(name);
  };
  const enrichYotaColorProduct = (product) => {
    if (!product || !isYotaColorProduct(product)) return product;
    const availableColors = YOTA_COLORS.filter((color) => color.available !== false);
    const existingVariants = Array.isArray(product.variants) ? product.variants : [];
    const existingByName = new Map(existingVariants.map((variant) => [normalize(variant.title), variant]));
    return {
      ...product,
      yotaColors: YOTA_COLORS,
      options: [{ name: "اللون", values: availableColors.map((color) => color.name) }],
      variants: availableColors.map((color) => {
        const existing = existingByName.get(normalize(color.name));
        return {
          ...existing,
          id: existing?.id || `${product.id}-color-${color.id}`,
          title: color.name,
          options: { اللون: color.name },
          price: existing?.price ?? product.price,
          available: color.available !== false,
          quantity: existing?.quantity ?? (color.available === false ? 0 : null),
          colorId: color.id,
          colorName: color.name,
          colorHex: color.hex
        };
      })
    };
  };

  global.YOTA_COLORS = YOTA_COLORS;
  global.isYotaColorProduct = isYotaColorProduct;
  global.enrichYotaColorProduct = enrichYotaColorProduct;
})(window);
