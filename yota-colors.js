(function initializeYotaColors(global) {
  const sourceImage = "assets/optimized/products/gallery/product-1-image-20260705172724-e7fdfd.webp";
  const sourceProductIds = ["custom-1783032232212", "custom-1783272387022"];
  const colors = [
    { id: "red", name: "أحمر", hex: "#C20000", available: true },
    { id: "white", name: "أبيض", hex: "#FFFFFF", available: true },
    { id: "yellow", name: "أصفر", hex: "#F0B400", available: true },
    { id: "green", name: "أخضر", hex: "#034A08", available: true },
    { id: "black", name: "أسود", hex: "#141414", available: true },
    { id: "silver", name: "فضي", hex: "#AFAFAF", available: true },
    { id: "burgundy", name: "نبيتي", hex: "#57020E", available: true },
    { id: "light-blue", name: "لبني", hex: "#55AEEA", available: true },
    { id: "brown", name: "بني", hex: "#431B06", available: true },
    { id: "beige", name: "بيج", hex: "#EBB987", available: true },
    { id: "orange", name: "برتقالي", hex: "#EA5B00", available: true },
    { id: "dark-blue", name: "أزرق غامق", hex: "#123562", available: true },
    {
      id: "gold",
      name: "ذهبي",
      hex: "#B88C18",
      highlight: "#E8C451",
      shadow: "#6F500C",
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
