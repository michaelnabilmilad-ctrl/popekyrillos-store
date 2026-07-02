(function () {
  const categories = [
    {
      id: "altar-tools",
      name: "أدوات المذبح",
      description: "شمعدانات، صلبان مذبح، شورية، أواني وخدمة المذبح",
      subcategories: [
        { id: "candlesticks", name: "شمعدانات" },
        { id: "altar-crosses", name: "صلبان مذبح" },
        { id: "censers", name: "شورية ومباخر" },
        { id: "altar-vessels", name: "أواني المذبح" },
        { id: "relic-boxes", name: "ذخائر وعلب" },
        { id: "stands", name: "حوامل ومنجليات" },
        { id: "service-tools", name: "أدوات خدمة" }
      ]
    },
    {
      id: "candles-incense",
      name: "الشمع والبخور",
      description: "شموع، بخور، فحم، أباركة ومستلزمات الشموع",
      subcategories: [
        { id: "candles", name: "شموع" },
        { id: "incense", name: "بخور" },
        { id: "charcoal", name: "فحم" },
        { id: "aparaka", name: "أباركة" },
        { id: "candle-supplies", name: "فتائل ومستلزمات الشموع" },
        { id: "incense-sets", name: "أطقم بخور" }
      ]
    },
    {
      id: "church-vestments",
      name: "الملابس الكنسية",
      description: "تواني، بطرشيلات، ملابس كهنة وأطفال ومقاسات خاصة",
      subcategories: [
        { id: "deacon-tonias", name: "تواني شمامسة" },
        { id: "stoles", name: "بطرشيلات" },
        { id: "priest-clothing", name: "ملابس كهنة" },
        { id: "children-clothing", name: "ملابس أطفال" },
        { id: "custom-sizes", name: "مقاسات خاصة" }
      ]
    },
    {
      id: "embroidery-textiles",
      name: "المفارش والتطريز",
      description: "مفارش مذبح، ستائر، أقمشة وتطريز حسب الطلب",
      subcategories: [
        { id: "altar-cloths", name: "مفارش مذبح" },
        { id: "curtains", name: "ستائر" },
        { id: "church-fabrics", name: "أغطية وأقمشة كنسية" },
        { id: "custom-embroidery", name: "تطريز حسب الطلب" },
        { id: "complete-sets", name: "أطقم كاملة" }
      ]
    },
    {
      id: "books-rituals",
      name: "الكتب والطقوس",
      description: "أجبية، قطمارس، كتب طقسية وروحية وألحان وقبطي",
      subcategories: [
        { id: "agpeya-prayers", name: "أجبية وصلوات" },
        { id: "katameros", name: "قطمارس" },
        { id: "liturgical-books", name: "كتب طقسية" },
        { id: "hymns-books", name: "كتب ألحان" },
        { id: "spiritual-theology", name: "كتب روحية وعقيدة" },
        { id: "children-books", name: "كتب أطفال" },
        { id: "coptic-books", name: "كتب باللغة القبطية" }
      ]
    },
    {
      id: "icons-frames",
      name: "الأيقونات والبراويز",
      description: "أيقونات خشب ومطبوعة، براويز، صور قديسين وأيقونات صغيرة",
      subcategories: [
        { id: "wooden-icons", name: "أيقونات خشب" },
        { id: "printed-icons", name: "أيقونات مطبوعة" },
        { id: "frames", name: "براويز" },
        { id: "saints-pictures", name: "صور قديسين" },
        { id: "small-icons", name: "أيقونات صغيرة" }
      ]
    },
    {
      id: "crosses-gifts",
      name: "الصلبان والهدايا",
      description: "صلبان حائط ويد ومكتبية، ميداليات، هدايا وتوزيعات",
      subcategories: [
        { id: "wall-crosses", name: "صلبان حائط" },
        { id: "hand-crosses", name: "صلبان يد" },
        { id: "desk-crosses", name: "صلبان مكتبية" },
        { id: "medals", name: "ميداليات" },
        { id: "meeting-gifts", name: "هدايا اجتماعات" },
        { id: "souvenirs", name: "توزيعات وتذكارات" }
      ]
    },
    {
      id: "uncategorized",
      name: "غير مصنف",
      description: "منتجات تحتاج مراجعة قبل ظهورها في أقسام العملاء",
      hiddenFromCustomerNav: true,
      subcategories: [{ id: "needs-review", name: "يحتاج مراجعة" }]
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

  function customerCategories() {
    return categories.filter((category) => !category.hiddenFromCustomerNav);
  }

  function categoryIdFromName(name) {
    return categoryByName.get(name)?.id || "";
  }

  function categoryNameFromId(id) {
    return categoryById.get(id)?.name || "";
  }

  function subcategoryIdFromName(name) {
    return subcategoryByName.get(name)?.id || "";
  }

  function subcategoryNameFromId(id) {
    return subcategoryById.get(id)?.name || "";
  }

  function getSubcategories(categoryIdOrName) {
    const category = categoryById.get(categoryIdOrName) || categoryByName.get(categoryIdOrName);
    return category?.subcategories || [];
  }

  window.POPE_KYRILLOS_TAXONOMY = {
    categories,
    customerCategories,
    categoryById,
    categoryByName,
    subcategoryById,
    subcategoryByName,
    categoryIdFromName,
    categoryNameFromId,
    subcategoryIdFromName,
    subcategoryNameFromId,
    getSubcategories
  };
})();
