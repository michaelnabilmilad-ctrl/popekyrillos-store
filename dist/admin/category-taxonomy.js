(function () {
  const categories = [
      {
          "id": "altar-tools",
          "name": "أدوات المذبح",
          "description": "شمعدانات، صلبان مذبح، شورية، أواني وخدمة المذبح",
          "subcategories": [
              {
                  "id": "candlesticks",
                  "name": "شمعدانات",
                  "subcategoryImage": "assets/optimized/products/gallery/taxonomy-candlesticks-image-20260705082220-aed05f.webp"
              },
              {
                  "id": "altar-crosses",
                  "name": "صلبان مذبح",
                  "subcategoryImage": "assets/optimized/products/processional-cross.webp"
              },
              {
                  "id": "censers",
                  "name": "شورية ومباخر",
                  "subcategoryImage": "assets/optimized/products/incense-chat.webp"
              },
              {
                  "id": "altar-vessels",
                  "name": "أواني المذبح",
                  "subcategoryImage": "assets/optimized/products/communion-set.webp"
              },
              {
                  "id": "relic-boxes",
                  "name": "ذخائر وعلب",
                  "subcategoryImage": "assets/optimized/products/reliquary-boxes.webp"
              },
              {
                  "id": "stands",
                  "name": "حوامل ومنجليات",
                  "subcategoryImage": "assets/optimized/products/brass-plate.webp"
              },
              {
                  "id": "service-tools",
                  "name": "أدوات خدمة",
                  "subcategoryImage": "assets/optimized/products/acrylic-reliquary.webp"
              }
          ]
      },
      {
          "id": "candles-incense",
          "name": "الشمع والبخور",
          "description": "شموع، بخور، فحم، أباركة ومستلزمات الشموع",
          "subcategories": [
              {
                  "id": "candles",
                  "name": "شموع",
                  "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
              },
              {
                  "id": "incense",
                  "name": "بخور",
                  "subcategoryImage": "assets/optimized/products/incense-chat-v2.webp"
              },
              {
                  "id": "charcoal",
                  "name": "فحم",
                  "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
              },
              {
                  "id": "aparaka",
                  "name": "أباركة",
                  "subcategoryImage": "assets/optimized/products/gallery/040-9762760196403-01.webp"
              },
              {
                  "id": "candle-supplies",
                  "name": "فتائل ومستلزمات الشموع",
                  "subcategoryImage": "assets/optimized/products/gallery/041-9762682011955-01.webp"
              },
              {
                  "id": "incense-sets",
                  "name": "أطقم بخور",
                  "subcategoryImage": "assets/optimized/products/incense-chat.webp"
              }
          ]
      },
      {
          "id": "church-vestments",
          "name": "الملابس الكنسية",
          "description": "تواني، بطرشيلات، ملابس كهنة وأطفال ومقاسات خاصة",
          "subcategories": [
              {
                  "id": "deacon-tonias",
                  "name": "تواني شمامسة",
                  "subcategoryImage": "assets/optimized/products/gallery/006-10121173303603-01.webp"
              },
              {
                  "id": "stoles",
                  "name": "بطرشيلات",
                  "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
              },
              {
                  "id": "priest-clothing",
                  "name": "ملابس كهنة",
                  "subcategoryImage": "assets/optimized/products/gallery/stole-black.webp"
              },
              {
                  "id": "children-clothing",
                  "name": "ملابس أطفال",
                  "subcategoryImage": "assets/optimized/products/gallery/007-10120837660979-01.webp"
              },
              {
                  "id": "custom-sizes",
                  "name": "مقاسات خاصة",
                  "subcategoryImage": "assets/optimized/products/gallery/stole-04.webp"
              }
          ]
      },
      {
          "id": "embroidery-textiles",
          "name": "المفارش والتطريز",
          "description": "مفارش مذبح، ستائر، أقمشة وتطريز حسب الطلب",
          "subcategories": [
              {
                  "id": "altar-cloths",
                  "name": "مفارش مذبح",
                  "subcategoryImage": "assets/optimized/products/gallery/012-10070727688499-01.webp"
              },
              {
                  "id": "curtains",
                  "name": "ستائر",
                  "subcategoryImage": "assets/optimized/products/gallery/013-10070727000371-01.webp"
              },
              {
                  "id": "church-fabrics",
                  "name": "أغطية وأقمشة كنسية",
                  "subcategoryImage": "assets/optimized/products/gallery/014-10070726574387-01.webp"
              },
              {
                  "id": "custom-embroidery",
                  "name": "تطريز حسب الطلب",
                  "subcategoryImage": "assets/optimized/products/gallery/015-10070704980275-01.webp"
              },
              {
                  "id": "complete-sets",
                  "name": "أطقم كاملة",
                  "subcategoryImage": "assets/optimized/products/gallery/016-10070671687987-01.webp"
              }
          ]
      },
      {
          "id": "books-rituals",
          "name": "الكتب والطقوس",
          "description": "أجبية، قطمارس، كتب طقسية وروحية وألحان وقبطي",
          "subcategories": [
              {
                  "id": "agpeya-prayers",
                  "name": "أجبية وصلوات",
                  "subcategoryImage": "assets/optimized/products/gallery/5amsin-araby.webp"
              },
              {
                  "id": "katameros",
                  "name": "قطمارس",
                  "subcategoryImage": "assets/optimized/products/gallery/ahad-araby.webp"
              },
              {
                  "id": "liturgical-books",
                  "name": "كتب طقسية",
                  "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
              },
              {
                  "id": "hymns-books",
                  "name": "كتب ألحان",
                  "subcategoryImage": "assets/optimized/products/gallery/ayam-sanawy-araby.webp"
              },
              {
                  "id": "spiritual-theology",
                  "name": "كتب روحية وعقيدة",
                  "subcategoryImage": "assets/optimized/products/gallery/som-araby.webp"
              },
              {
                  "id": "children-books",
                  "name": "كتب أطفال",
                  "subcategoryImage": "assets/optimized/products/gallery/5amsin-2epty.webp"
              },
              {
                  "id": "coptic-books",
                  "name": "كتب باللغة القبطية",
                  "subcategoryImage": "assets/optimized/products/gallery/ahad-epty.webp"
              }
          ]
      },
      {
          "id": "icons-frames",
          "name": "الأيقونات والبراويز",
          "description": "أيقونات خشب ومطبوعة، براويز، صور قديسين وأيقونات صغيرة",
          "subcategories": [
              {
                  "id": "wooden-icons",
                  "name": "أيقونات خشب",
                  "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
              },
              {
                  "id": "printed-icons",
                  "name": "أيقونات مطبوعة",
                  "subcategoryImage": "assets/optimized/products/gallery/031-9841769054515-01.webp"
              },
              {
                  "id": "frames",
                  "name": "براويز",
                  "subcategoryImage": "assets/optimized/products/gallery/032-9841765515571-01.webp"
              },
              {
                  "id": "saints-pictures",
                  "name": "صور قديسين",
                  "subcategoryImage": "assets/optimized/products/gallery/033-9841763516723-01.webp"
              },
              {
                  "id": "small-icons",
                  "name": "أيقونات صغيرة",
                  "subcategoryImage": "assets/optimized/products/gallery/madlia-iota-sada-1.webp"
              }
          ]
      },
      {
          "id": "crosses-gifts",
          "name": "الصلبان والهدايا",
          "description": "صلبان حائط ويد ومكتبية، ميداليات، هدايا وتوزيعات",
          "subcategories": [
              {
                  "id": "wall-crosses",
                  "name": "صلبان حائط",
                  "subcategoryImage": "assets/optimized/products/gallery/021-10068212646195-01.webp"
              },
              {
                  "id": "hand-crosses",
                  "name": "صلبان يد",
                  "subcategoryImage": "assets/optimized/products/gallery/product-1-7-20260702155122-9f46d4.webp"
              },
              {
                  "id": "desk-crosses",
                  "name": "صلبان مكتبية",
                  "subcategoryImage": "assets/optimized/products/gallery/023-10067690586419-01.webp"
              },
              {
                  "id": "medals",
                  "name": "ميداليات",
                  "subcategoryImage": "assets/optimized/products/gallery/madlia-iota-sada-1-v2.webp"
              },
              {
                  "id": "meeting-gifts",
                  "name": "هدايا اجتماعات",
                  "subcategoryImage": "assets/optimized/products/gallery/024-10067690225971-01.webp"
              },
              {
                  "id": "souvenirs",
                  "name": "توزيعات وتذكارات",
                  "subcategoryImage": "assets/optimized/products/gallery/025-10067689472307-01.webp"
              }
          ]
      },
      {
          "id": "atb3ho-products",
          "name": "منتجات أتبعه",
          "description": "جورنالينج، نوت بوك، كروت، بوك مارك، باكيدج ومنتجات روحية من أتبعه",
          "subcategories": [
              {
                  "id": "atb3ho-journaling",
                  "name": "جورنالينج",
                  "subcategoryImage": "assets/optimized/products/gallery/ahad-araby-1200.webp"
              },
              {
                  "id": "atb3ho-notebooks",
                  "name": "نوت بوك",
                  "subcategoryImage": "assets/optimized/products/gallery/som-araby-1200.webp"
              },
              {
                  "id": "atb3ho-cards",
                  "name": "كروت",
                  "subcategoryImage": "assets/optimized/products/gallery/baskha-araby-1200.webp"
              },
              {
                  "id": "atb3ho-bookmarks",
                  "name": "بوك مارك",
                  "subcategoryImage": "assets/optimized/products/gallery/ayam-sanawy-araby-1200.webp"
              },
              {
                  "id": "atb3ho-packages",
                  "name": "باكيدج",
                  "subcategoryImage": "assets/optimized/products/gallery/custom-1782306615168-copy-1782306883366-copy-1782307173548-copy-1782307256776-co-som-araby-20260628190546-06034a.webp"
              },
              {
                  "id": "atb3ho-bags",
                  "name": "شنط ومستلزمات روحية",
                  "subcategoryImage": "assets/optimized/products/gallery/product-1-image-20260702224955-5f0f3a.webp"
              }
          ]
      },
      {
          "id": "uncategorized",
          "name": "غير مصنف",
          "description": "منتجات تحتاج مراجعة قبل ظهورها في أقسام العملاء",
          "hiddenFromCustomerNav": true,
          "subcategories": [
              {
                  "id": "needs-review",
                  "name": "يحتاج مراجعة",
                  "subcategoryImage": "assets/optimized/hero-products-collage.webp"
              }
          ]
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
    ["مستلزمات المذبح", "altar-tools"],
    ["نحاسيات", "altar-tools"],
    ["شموع وبخور", "candles-incense"],
    ["شمع وبخور وأباركة", "candles-incense"],
    ["تواني وأقمشة", "church-vestments"],
    ["أقمشة ومفارش", "church-vestments"],
    ["أيقونات وهدايا", "icons-frames"],
    ["أيقونات", "icons-frames"],
    ["كتب وطقوس", "books-rituals"],
    ["صلبان وهدايا", "crosses-gifts"]
  ]);

  categoryAliases.forEach((categoryId, alias) => {
    const category = categoryById.get(categoryId);
    if (category) categoryByName.set(alias, category);
  });

  const subcategoryAliases = new Map([
    ["يوتا", "small-icons"],
    ["يوطا", "small-icons"],
    ["مادليات", "small-icons"],
    ["ميداليات", "medals"]
  ]);

  subcategoryAliases.forEach((subcategoryId, alias) => {
    const subcategory = subcategoryById.get(subcategoryId);
    if (subcategory) subcategoryByName.set(alias, subcategory);
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
