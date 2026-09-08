(function (root) {
  const legacySubcategoryNames = {
  "شوريات نحاس": "brass-censers",
  "شوريات ستانلس": "stainless-censers",
  "شوريات فضي وذهبي": "silver-gold-censers",
  "شوريات شماسية": "deacon-censers",
  "مباخر منزلية": "home-censers",
  "حق البخور": "incense-boxes",
  "ملاعق البخور": "incense-spoons",
  "بخور كنسي": "church-incense",
  "بخور يوناني": "greek-incense",
  "لبان وبخور طبيعي": "natural-incense",
  "الفحم": "charcoal",
  "الأباركة والعطور الكنسية": "aparaka",
  "الحنوط": "hanout",
  "أدوات وقطع غيار الشوريات": "censer-parts",
  "شمع الكنيسة": "church-candles",
  "شمع المذبح": "altar-candles",
  "شمع الإكليل": "wedding-candles",
  "شمع المعمودية": "baptism-candles",
  "شمع أسبوع الآلام": "holy-week-candles",
  "شمع القيامة": "resurrection-candles",
  "شمع النحل": "beeswax-candles",
  "شمعدانات": "candlesticks",
  "حوامل شمع": "candle-holders",
  "قناديل معلقة": "hanging-lamps",
  "قناديل حائط": "wall-lamps",
  "قناديل المذبح": "altar-lamps",
  "كاسات القناديل": "lamp-glasses",
  "زيت القناديل": "lamp-oil",
  "الفتائل والعوامات": "wicks-floats",
  "قطع غيار القناديل": "lamp-parts",
  "الشوريات": "censers",
  "القناديل": "lamps",
  "candles": "church-candles",
  "incense-sets": "church-incense",
  "incense": "church-incense"
};
  const censerIds = new Set(["censers", "brass-censers", "stainless-censers", "silver-gold-censers", "deacon-censers", "home-censers", "censer-parts"]);
  const lampIds = new Set(["lamps", "hanging-lamps", "wall-lamps", "altar-lamps", "lamp-glasses", "lamp-oil", "wicks-floats", "lamp-parts"]);
  const incenseIds = new Set(["incense-boxes", "incense-spoons", "church-incense", "greek-incense", "natural-incense", "charcoal", "aparaka", "hanout"]);
  function route(category, subcategory = "") {
    subcategory = legacySubcategoryNames[subcategory] || subcategory;
    if (censerIds.has(subcategory) || subcategory === "الشوريات") return { category: "altar-vessels", label: "censers" };
    if (lampIds.has(subcategory) || subcategory === "القناديل") return { category: "altar-vessels", label: "lamps" };
    if (incenseIds.has(subcategory)) return { category: "candles-lamps", label: subcategory };
    if (["censers-incense", "الشوريات والبخور", "الشوريات"].includes(category)) return { category: "altar-vessels", label: "censers" };
    if (["candles-incense", "candles", "الشمع والقناديل", "الشمع والبخور"].includes(category)) category = "candles-lamps";
    return { category, label: subcategory };
  }
  function product(item) {
    const main = item.mainCategory || "";
    const rawSub = item.subcategory || item.subCategory || "";
    const sub = legacySubcategoryNames[rawSub] || rawSub;
    const name = typeof item.name === "string" ? item.name : item.name?.ar || "";
    let next;
    if (censerIds.has(sub) || /شوري[ةه]|شوريات|مبخر[ةه]|مباخر|\bcenser\b/i.test(name)) next = route("altar-vessels", "censers");
    else if (lampIds.has(sub) || /قنديل|قناديل|\boil lamp\b/i.test(name)) next = route("altar-vessels", "lamps");
    else if (["censers-incense", "الشوريات والبخور"].includes(main)) next = { category: "candles-lamps", label: incenseIds.has(sub) ? sub : "church-incense" };
    else if (["الشمع والقناديل", "الشمع والبخور"].includes(main)) next = route(main, sub);
    else if (incenseIds.has(sub)) next = route(main, sub);
    if (!next || (main === next.category && sub === next.label && item.subCategory === next.label)) return item;
    return { ...item, mainCategory: next.category, subcategory: next.label, subCategory: next.label };
  }
  function categories(input) {
    const result = JSON.parse(JSON.stringify(input));
    const old = result.find(c => c.id === "censers-incense");
    const altar = result.find(c => c.id === "altar-vessels");
    const candles = result.find(c => c.id === "candles-lamps");
    if (!altar || !candles) return result;
    const add = (parent, item) => { if (!parent.subcategories.some(s => s.id === item.id)) parent.subcategories.push(item); };
    if (old || candles.name === "الشمع والقناديل") {
      candles.name = "الشمع والبخور";
      candles.description = "شموع الكنيسة والبخور والفحم والعطور الكنسية";
    }
    add(altar, { id: "censers", name: "الشوريات", subcategoryImage: old?.subcategoryImage || altar.subcategoryImage });
    add(altar, { id: "lamps", name: "القناديل", subcategoryImage: candles.subcategories.find(s => lampIds.has(s.id))?.subcategoryImage || candles.subcategoryImage });
    for (const sub of old?.subcategories || []) if (!censerIds.has(sub.id)) add(candles, sub);
    candles.subcategories = candles.subcategories.filter(s => !lampIds.has(s.id));
    altar.subcategories = [
      ...["censers", "lamps"].map(id => altar.subcategories.find(s => s.id === id)),
      ...altar.subcategories.filter(s => !["censers", "lamps"].includes(s.id))
    ];
    return result.filter(c => c.id !== "censers-incense");
  }
  root.POPE_KYRILLOS_CATEGORY_MIGRATION = { route, product, categories };
  if (typeof module !== "undefined") module.exports = root.POPE_KYRILLOS_CATEGORY_MIGRATION;
})(typeof window !== "undefined" ? window : globalThis);
