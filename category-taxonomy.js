(function () {
  const categories = [
    {
      id: "altar-tools",
      name: "مستلزمات المذبح والخدمة",
      description: "أواني المذبح والشمعدانات والذخائر وأدوات الخدمة",
      subcategoryImage: "assets/optimized/products/communion-set.webp",
      subcategories: [
        { id: "candlesticks", name: "شمعدانات", subcategoryImage: "assets/optimized/products/gallery/taxonomy-candlesticks-image-20260705074916-183d5a.webp" },
        { id: "censers", name: "شورية ومباخر", subcategoryImage: "assets/optimized/products/incense-chat.webp" },
        { id: "altar-vessels", name: "أواني المذبح", subcategoryImage: "assets/optimized/products/communion-set.webp" },
        { id: "relic-boxes", name: "ذخائر وعلب", subcategoryImage: "assets/optimized/products/reliquary-boxes.webp" },
        { id: "stands", name: "حوامل ومنجليات", subcategoryImage: "assets/optimized/products/brass-plate.webp" },
        { id: "service-tools", name: "أدوات خدمة", subcategoryImage: "assets/optimized/products/acrylic-reliquary.webp" }
      ]
    },
    {
      id: "candles-incense",
      name: "الشمع والبخور",
      description: "شموع وبخور وفحم وأباركة ومستلزمات الشموع",
      subcategoryImage: "assets/optimized/products/incense-chat-v2.webp",
      subcategories: [
        { id: "candles", name: "شموع", subcategoryImage: "assets/optimized/products/gallery/sham3.iconat.webp" },
        { id: "incense", name: "بخور", subcategoryImage: "assets/optimized/products/incense-chat-v2.webp" },
        { id: "charcoal", name: "فحم", subcategoryImage: "assets/optimized/featured-service-bundle.webp" },
        { id: "aparaka", name: "أباركة", subcategoryImage: "assets/optimized/products/gallery/040-9762760196403-01.webp" },
        { id: "candle-supplies", name: "فتائل ومستلزمات الشموع", subcategoryImage: "assets/optimized/products/gallery/041-9762682011955-01.webp" },
        { id: "incense-sets", name: "أطقم بخور", subcategoryImage: "assets/optimized/products/incense-chat.webp" }
      ]
    },
    {
      id: "church-vestments",
      name: "الملابس والمفارش الكنسية",
      description: "ملابس كنسية وبطرشيلات ومفارش وأقمشة وتطريز",
      subcategoryImage: "assets/optimized/products/gallery/stole-01.webp",
      subcategories: [
        { id: "deacon-tonias", name: "تواني شمامسة", subcategoryImage: "assets/optimized/products/gallery/006-10121173303603-01.webp" },
        { id: "stoles", name: "بطرشيلات", subcategoryImage: "assets/optimized/products/gallery/stole-01.webp" },
        { id: "priest-clothing", name: "ملابس كهنة", subcategoryImage: "assets/optimized/products/gallery/stole-black.webp" },
        { id: "children-clothing", name: "ملابس أطفال", subcategoryImage: "assets/optimized/products/gallery/007-10120837660979-01.webp" },
        { id: "altar-cloths", name: "مفارش مذبح", subcategoryImage: "assets/optimized/products/gallery/012-10070727688499-01.webp" },
        { id: "curtains", name: "ستائر", subcategoryImage: "assets/optimized/products/gallery/013-10070727000371-01.webp" },
        { id: "church-fabrics", name: "أقمشة كنسية", subcategoryImage: "assets/optimized/products/gallery/014-10070726574387-01.webp" },
        { id: "custom-embroidery", name: "تطريز حسب الطلب", subcategoryImage: "assets/optimized/products/gallery/015-10070704980275-01.webp" },
        { id: "complete-sets", name: "أطقم كاملة", subcategoryImage: "assets/optimized/products/gallery/016-10070671687987-01.webp" }
      ]
    },
    {
      id: "icons-frames",
      name: "الأيقونات والبراويز",
      description: "أيقونات خشب ومطبوعة وبراويز وصور قديسين",
      subcategoryImage: "assets/optimized/products/gallery/030-9841770725683-01.webp",
      subcategories: [
        { id: "wooden-icons", name: "أيقونات خشب", subcategoryImage: "assets/optimized/products/gallery/030-9841770725683-01.webp" },
        { id: "printed-icons", name: "أيقونات مطبوعة", subcategoryImage: "assets/optimized/products/gallery/031-9841769054515-01.webp" },
        { id: "frames", name: "براويز", subcategoryImage: "assets/optimized/products/gallery/032-9841765515571-01.webp" },
        { id: "saints-pictures", name: "صور قديسين", subcategoryImage: "assets/optimized/products/gallery/033-9841763516723-01.webp" },
        { id: "small-icons", name: "أيقونات صغيرة", subcategoryImage: "assets/optimized/products/gallery/madlia-iota-sada-1.webp" }
      ]
    },
    {
      id: "crosses",
      name: "الصلبان",
      description: "صلبان يد وصدر وخشب ومعدن ومذبح وزفة",
      subcategoryImage: "assets/optimized/products/processional-cross.webp",
      subcategories: [
        { id: "hand-crosses", name: "صلبان اليد", subcategoryImage: "assets/optimized/products/gallery/product-1-7-20260702155122-9f46d4.webp" },
        { id: "pectoral-crosses", name: "صلبان الصدر", subcategoryImage: "assets/optimized/products/gallery/021-10068212646195-01.webp" },
        { id: "wooden-crosses", name: "صلبان الخشب", subcategoryImage: "assets/products/gallery/iota-plain-cross-20cm-model-1.webp" },
        { id: "metal-crosses", name: "صلبان المعدن", subcategoryImage: "assets/optimized/products/processional-cross.webp" },
        { id: "altar-crosses", name: "صلبان المذبح", subcategoryImage: "assets/optimized/products/processional-cross.webp" },
        { id: "processional-crosses", name: "صلبان الزفة", subcategoryImage: "assets/optimized/products/gallery/006-10121173303603-01.webp" }
      ]
    },
    {
      id: "books-rituals",
      name: "الكتب والطقوس",
      description: "أجبية وقطمارس وكتب طقسية وروحية وألحان وقبطي",
      subcategoryImage: "assets/optimized/products/gallery/baskha-araby.webp",
      subcategories: [
        { id: "agpeya-prayers", name: "أجبية وصلوات", subcategoryImage: "assets/optimized/products/gallery/5amsin-araby.webp" },
        { id: "katameros", name: "قطمارس", subcategoryImage: "assets/optimized/products/gallery/ahad-araby.webp" },
        { id: "liturgical-books", name: "كتب طقسية", subcategoryImage: "assets/optimized/products/gallery/baskha-araby.webp" },
        { id: "hymns-books", name: "كتب ألحان", subcategoryImage: "assets/optimized/products/gallery/ayam-sanawy-araby.webp" },
        { id: "spiritual-theology", name: "كتب روحية وعقيدة", subcategoryImage: "assets/optimized/products/gallery/som-araby.webp" },
        { id: "children-books", name: "كتب أطفال", subcategoryImage: "assets/optimized/products/gallery/5amsin-2epty.webp" },
        { id: "coptic-books", name: "كتب باللغة القبطية", subcategoryImage: "assets/optimized/products/gallery/ahad-epty.webp" }
      ]
    },
    {
      id: "gifts-accessories",
      name: "الهدايا والإكسسوارات",
      description: "ميداليات وسلاسل وأساور وشنط ونوت وكروت وهدايا بالاسم",
      subcategoryImage: "assets/optimized/products/gallery/madlia-iota-sada-1-v2.webp",
      subcategories: [
        { id: "medals", name: "ميداليات", subcategoryImage: "assets/optimized/products/gallery/madlia-iota-sada-1-v2.webp" },
        { id: "chains", name: "سلاسل", subcategoryImage: "assets/optimized/products/gallery/madlia-iota-sada-1-v2.webp" },
        { id: "bracelets", name: "أساور", subcategoryImage: "assets/optimized/products/gallery/madlia-iota-sada-1-v2.webp" },
        { id: "tote-bags", name: "توتي باج وشنط", subcategoryImage: "assets/optimized/products/gallery/product-1-image-20260702224955-5f0f3a.webp" },
        { id: "notebooks", name: "نوت", subcategoryImage: "assets/optimized/products/gallery/som-araby-1200.webp" },
        { id: "planners", name: "أجندات وجورنالينج", subcategoryImage: "assets/optimized/products/gallery/ahad-araby-1200.webp" },
        { id: "cards", name: "كروت", subcategoryImage: "assets/optimized/products/gallery/baskha-araby-1200.webp" },
        { id: "bookmarks", name: "بوك مارك", subcategoryImage: "assets/optimized/products/gallery/ayam-sanawy-araby-1200.webp" },
        { id: "meeting-games", name: "ألعاب الاجتماعات", subcategoryImage: "assets/optimized/featured-service-bundle.webp" },
        { id: "personalized", name: "منتجات بالاسم", subcategoryImage: "assets/optimized/products/gallery/ayam-sanawy-araby-1200.webp" }
      ]
    },
    {
      id: "uncategorized",
      name: "غير مصنف",
      description: "منتجات تحتاج مراجعة",
      hiddenFromCustomerNav: true,
      subcategories: [{ id: "needs-review", name: "يحتاج مراجعة", subcategoryImage: "assets/optimized/hero-products-collage.webp" }]
    }
  ];

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const subcategoryById = new Map();
  const subcategoryByName = new Map();

  categories.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      const entry = { ...subcategory, mainId: category.id, mainName: category.name };
      subcategoryById.set(subcategory.id, entry);
      subcategoryByName.set(subcategory.name, entry);
    });
  });

  const categoryAliases = new Map([
    ["أدوات المذبح", "altar-tools"],
    ["مستلزمات المذبح", "altar-tools"],
    ["نحاسيات", "altar-tools"],
    ["الملابس الكنسية", "church-vestments"],
    ["المفارش والتطريز", "church-vestments"],
    ["الصلبان والهدايا", "crosses"],
    ["منتجات أتبعه", "gifts-accessories"],
    ["أيقونات وهدايا", "icons-frames"]
  ]);
  categoryAliases.forEach((categoryId, alias) => {
    const category = categoryById.get(categoryId);
    if (category) categoryByName.set(alias, category);
  });

  const subcategoryAliases = new Map([
    ["يوتا", "wooden-crosses"],
    ["يوطا", "wooden-crosses"],
    ["صلبان مذبح", "altar-crosses"],
    ["صلبان زفة", "processional-crosses"],
    ["هدايا اجتماعات", "meeting-games"],
    ["شنط ومستلزمات روحية", "tote-bags"],
    ["نوت بوك", "notebooks"],
    ["جورنالينج", "planners"],
    ["كروت", "cards"],
    ["بوك مارك", "bookmarks"]
  ]);
  subcategoryAliases.forEach((subcategoryId, alias) => {
    const subcategory = subcategoryById.get(subcategoryId);
    if (subcategory) subcategoryByName.set(alias, subcategory);
  });

  function customerCategories() { return categories.filter((category) => !category.hiddenFromCustomerNav); }
  function categoryIdFromName(name) { return categoryByName.get(name)?.id || ""; }
  function categoryNameFromId(id) { return categoryById.get(id)?.name || ""; }
  function subcategoryIdFromName(name) { return subcategoryByName.get(name)?.id || ""; }
  function subcategoryNameFromId(id) { return subcategoryById.get(id)?.name || ""; }
  function getSubcategories(categoryIdOrName) {
    return (categoryById.get(categoryIdOrName) || categoryByName.get(categoryIdOrName))?.subcategories || [];
  }

  window.POPE_KYRILLOS_TAXONOMY = {
    categories, customerCategories, categoryById, categoryByName, subcategoryById, subcategoryByName,
    categoryIdFromName, categoryNameFromId, subcategoryIdFromName, subcategoryNameFromId, getSubcategories
  };
})();
