(function () {
  const defaultCategories = [
  {
    "id": "altar-vessels",
    "name": "المذبح والأواني المقدسة",
    "description": "أواني المذبح والذخيرة وأدوات الخدمة المقدسة",
    "subcategoryImage": "assets/optimized/products/communion-set.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "altar-sets",
        "name": "أطقم أواني المذبح",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "chalices",
        "name": "الكؤوس",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "trays-stars",
        "name": "الصواني والنجوم",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "mystir",
        "name": "المستير",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "water-wine-cruets",
        "name": "قوارير الماء والخمر",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "relic-boxes",
        "name": "حق الذخيرة",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "communion-bread-boxes",
        "name": "بيوت القربان",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "holy-oil-vessels",
        "name": "أواني الميرون والزيوت",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "laqan-vessels",
        "name": "أواني اللقان",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "service-plates",
        "name": "أطباق الخدمة",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "altar-vessel-crosses",
        "name": "صلبان المذبح",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "altar-candlesticks",
        "name": "شمعدانات المذبح",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "gospel-stands",
        "name": "حوامل الإنجيل والبشارة",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      },
      {
        "id": "vessel-cases",
        "name": "شنط وصناديق حفظ الأواني",
        "subcategoryImage": "assets/optimized/products/communion-set.webp"
      }
    ]
  },
  {
    "id": "censers-incense",
    "name": "الشوريات والبخور",
    "description": "الشوريات والمباخر والبخور والفحم والعطور الكنسية",
    "subcategoryImage": "assets/optimized/products/incense-chat.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "brass-censers",
        "name": "شوريات نحاس",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "stainless-censers",
        "name": "شوريات ستانلس",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "silver-gold-censers",
        "name": "شوريات فضي وذهبي",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "deacon-censers",
        "name": "شوريات شماسية",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "home-censers",
        "name": "مباخر منزلية",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "incense-boxes",
        "name": "حق البخور",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "incense-spoons",
        "name": "ملاعق البخور",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "church-incense",
        "name": "بخور كنسي",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "greek-incense",
        "name": "بخور يوناني",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "natural-incense",
        "name": "لبان وبخور طبيعي",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "charcoal",
        "name": "الفحم",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "aparaka",
        "name": "الأباركة والعطور الكنسية",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "hanout",
        "name": "الحنوط",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      },
      {
        "id": "censer-parts",
        "name": "أدوات وقطع غيار الشوريات",
        "subcategoryImage": "assets/optimized/products/incense-chat.webp"
      }
    ]
  },
  {
    "id": "candles-lamps",
    "name": "الشمع والقناديل",
    "description": "شموع الكنيسة والقناديل وزيوتها وقطع غيارها",
    "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "church-candles",
        "name": "شمع الكنيسة",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "altar-candles",
        "name": "شمع المذبح",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "wedding-candles",
        "name": "شمع الإكليل",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "baptism-candles",
        "name": "شمع المعمودية",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "holy-week-candles",
        "name": "شمع أسبوع الآلام",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "resurrection-candles",
        "name": "شمع القيامة",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "beeswax-candles",
        "name": "شمع النحل",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "candlesticks",
        "name": "شمعدانات",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "candle-holders",
        "name": "حوامل شمع",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "hanging-lamps",
        "name": "قناديل معلقة",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "wall-lamps",
        "name": "قناديل حائط",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "altar-lamps",
        "name": "قناديل المذبح",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "lamp-glasses",
        "name": "كاسات القناديل",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "lamp-oil",
        "name": "زيت القناديل",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "wicks-floats",
        "name": "الفتائل والعوامات",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      },
      {
        "id": "lamp-parts",
        "name": "قطع غيار القناديل",
        "subcategoryImage": "assets/optimized/products/gallery/sham3.iconat.webp"
      }
    ]
  },
  {
    "id": "church-vestments",
    "name": "الملابس والأقمشة الكنسية",
    "description": "ملابس الكهنة والشمامسة ومفارش وأقمشة الهيكل",
    "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "priest-clothing",
        "name": "ملابس الكهنة",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "priest-tonias",
        "name": "التوني الكهنوتية",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "stoles",
        "name": "البطرشيلات",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "copes",
        "name": "البرانس",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "sleeves-belts",
        "name": "الأكمام والأحزمة",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "bishop-clothing",
        "name": "ملابس الأساقفة",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "deacon-clothing",
        "name": "ملابس الشمامسة",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "adult-deacon-tonias",
        "name": "توني الشمامسة للكبار",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "children-deacon-tonias",
        "name": "توني الشمامسة للأطفال",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "choir-clothing",
        "name": "ملابس الكورال",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "baptism-clothing",
        "name": "ملابس المعمودية",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "sanctuary-curtains",
        "name": "ستر وستائر الهيكل",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "altar-cloths",
        "name": "مفارش المذبح",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "chalice-covers",
        "name": "أغطية الكأس والصينية",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "prospharine",
        "name": "الإبروسفارين",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "service-towels",
        "name": "مناديل الخدمة",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "gospel-covers",
        "name": "أغطية المنجليات وحوامل الإنجيل",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "flags-banners",
        "name": "الرايات والبيارق",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      },
      {
        "id": "custom-embroidery",
        "name": "تطريز وتنفيذ بالطلب",
        "subcategoryImage": "assets/optimized/products/gallery/stole-01.webp"
      }
    ]
  },
  {
    "id": "crosses",
    "name": "الصلبان",
    "description": "صلبان اليد والصدر والمذبح والمواكب بخامات متعددة",
    "subcategoryImage": "assets/optimized/products/processional-cross.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "hand-crosses",
        "name": "صلبان يد",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "iota-plain-hand-crosses",
        "name": "صلبان يد يوتا سادة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "plain-cross-medals",
        "name": "صلبان ميداليات سادة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "pectoral-crosses",
        "name": "صلبان صدر",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "priest-crosses",
        "name": "صلبان كهنة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "deacon-crosses",
        "name": "صلبان شمامسة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "altar-crosses",
        "name": "صلبان مذبح",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "processional-crosses",
        "name": "صلبان مواكب",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "wall-crosses",
        "name": "صلبان حائط",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "desk-crosses",
        "name": "صلبان مكتب",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "car-crosses",
        "name": "صلبان سيارات",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "wooden-crosses",
        "name": "صلبان خشب",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "brass-crosses",
        "name": "صلبان نحاس",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "stainless-crosses",
        "name": "صلبان ستانلس",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "silver-crosses",
        "name": "صلبان فضة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "iota-crosses",
        "name": "صلبان فن اليوتا",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "colored-crosses",
        "name": "صلبان ملونة",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "personalized-crosses",
        "name": "صلبان محفورة بالاسم",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "giveaway-crosses",
        "name": "صلبان توزيعات",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      },
      {
        "id": "cross-boxes",
        "name": "علب وحوامل الصلبان",
        "subcategoryImage": "assets/optimized/products/processional-cross.webp"
      }
    ]
  },
  {
    "id": "icons-frames",
    "name": "الأيقونات والبراويز",
    "description": "أيقونات وبراويز للمنزل والكنيسة والهدايا",
    "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "christ-icons",
        "name": "أيقونات السيد المسيح",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "mary-icons",
        "name": "أيقونات السيدة العذراء",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "angel-icons",
        "name": "أيقونات الملائكة",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "apostle-icons",
        "name": "أيقونات الرسل",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "saint-icons",
        "name": "أيقونات القديسين",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "martyr-icons",
        "name": "أيقونات الشهداء",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "feast-icons",
        "name": "أيقونات الأعياد",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "holy-family-icons",
        "name": "أيقونات العائلة المقدسة",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "wooden-icons",
        "name": "أيقونات خشب",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "metal-icons",
        "name": "أيقونات معدن",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "glass-icons",
        "name": "أيقونات زجاج",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "wall-icons",
        "name": "أيقونات حائط",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "desk-icons",
        "name": "أيقونات مكتب",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "car-icons",
        "name": "أيقونات سيارة",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "giveaway-icons",
        "name": "أيقونات توزيعات",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "multi-icons",
        "name": "أيقونات ثنائية وثلاثية",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "frames",
        "name": "براويز",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "icon-stands",
        "name": "حوامل الأيقونات",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "icon-lamps",
        "name": "قناديل الأيقونات",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      },
      {
        "id": "custom-icons",
        "name": "أيقونات حسب الطلب",
        "subcategoryImage": "assets/optimized/products/gallery/030-9841770725683-01.webp"
      }
    ]
  },
  {
    "id": "books-rituals",
    "name": "الكتب والطقوس",
    "description": "الكتاب المقدس والكتب الطقسية والروحية وكتب الخدمة",
    "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "bibles",
        "name": "الكتاب المقدس",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "new-testament",
        "name": "العهد الجديد",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "agpeya-prayers",
        "name": "الأجبية",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "kholagy",
        "name": "الخولاجي",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "katameros",
        "name": "القطمارس",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "synaxarium",
        "name": "السنكسار",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "psalmody",
        "name": "الإبصلمودية",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "liturgy-books",
        "name": "كتب القداس",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "tasbeha-books",
        "name": "كتب التسبحة",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "holy-week-books",
        "name": "كتب أسبوع الآلام",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "hymns-books",
        "name": "كتب الألحان",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "theology-books",
        "name": "كتب العقيدة واللاهوت",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "fathers-books",
        "name": "كتب الآباء",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "saints-lives",
        "name": "سير القديسين",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "children-books",
        "name": "كتب الأطفال",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "illustrated-stories",
        "name": "قصص مصورة",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "youth-ministry-books",
        "name": "كتب الشباب والخدمة",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "family-books",
        "name": "كتب الأسرة والزواج",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "prayer-books",
        "name": "كتب الصلاة والتأمل",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "english-books",
        "name": "كتب باللغة الإنجليزية",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "booklets",
        "name": "كتيبات وتوزيعات",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "book-accessories",
        "name": "فواصل وجرابات الكتب",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      },
      {
        "id": "book-stands",
        "name": "حوامل الكتب",
        "subcategoryImage": "assets/optimized/products/gallery/baskha-araby.webp"
      }
    ]
  },
  {
    "id": "occasions-service",
    "name": "المناسبات والخدمة",
    "description": "المعمودية والإكليل ومدارس الأحد والمواسم والأعياد",
    "subcategoryImage": "assets/optimized/featured-service-bundle.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "baptism-supplies",
        "name": "مستلزمات المعمودية",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "wedding-supplies",
        "name": "مستلزمات الإكليل",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "sunday-school-gifts",
        "name": "هدايا مدارس الأحد",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "meeting-gifts",
        "name": "توتي باج وشنط",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "notebooks-planners",
        "name": "أجندات ونوت",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "cards-bookmarks",
        "name": "كروت وبوك مارك",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "medals-bracelets",
        "name": "ميداليات وأساور",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "christian-games",
        "name": "ألعاب مسيحية",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "crafts-coloring",
        "name": "تلوين وأشغال يدوية",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "conference-gifts",
        "name": "هدايا المؤتمرات",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "seasonal-products",
        "name": "المواسم والأعياد",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      },
      {
        "id": "personalized",
        "name": "منتجات مطبوعة ومخصصة",
        "subcategoryImage": "assets/optimized/featured-service-bundle.webp"
      }
    ]
  },
  {
    "id": "church-equipment",
    "name": "تجهيز الكنائس والطلبات الخاصة",
    "description": "تجهيزات الكنائس والأثاث والإضاءة والتصنيع حسب الطلب",
    "subcategoryImage": "assets/optimized/hero-products-collage.webp",
    "visible": true,
    "homeVisible": true,
    "subcategories": [
      {
        "id": "icon-gospel-stands",
        "name": "حوامل الأيقونات والإنجيل",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "lecterns",
        "name": "منجليات",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "clergy-chairs",
        "name": "كراسي الكهنة والأساقفة",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "deacon-seats",
        "name": "مقاعد الشمامسة",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "vessel-cabinets",
        "name": "دواليب حفظ الأواني",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "floor-candle-stands",
        "name": "حوامل الشمع الأرضية",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "donation-boxes",
        "name": "صناديق التبرعات",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "baptism-fonts",
        "name": "أجران المعمودية",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "bells",
        "name": "الأجراس",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "chandeliers",
        "name": "النجف والثريات",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "church-lighting",
        "name": "وحدات الإضاءة الكنسية",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "iconostasis",
        "name": "أبواب وأحجبة الهيكل",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "procession-flags",
        "name": "أعلام وبيارق المواكب",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "church-libraries",
        "name": "تجهيز مكتبات الكنائس",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "custom-woodwork",
        "name": "تصنيع خشب حسب الطلب",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "custom-metalwork",
        "name": "تصنيع معدن حسب الطلب",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "new-church-package",
        "name": "تجهيز كنيسة جديدة",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      },
      {
        "id": "quote-request",
        "name": "طلب عرض سعر",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      }
    ]
  },
  {
    "id": "uncategorized",
    "name": "غير مصنف",
    "description": "منتجات تحتاج مراجعة",
    "hiddenFromCustomerNav": true,
    "visible": false,
    "homeVisible": false,
    "subcategoryImage": "assets/optimized/hero-products-collage.webp",
    "subcategories": [
      {
        "id": "needs-review",
        "name": "يحتاج مراجعة",
        "subcategoryImage": "assets/optimized/hero-products-collage.webp"
      }
    ]
  }
];
  const TAXONOMY_STORAGE_KEY = "pope-kyrillos-taxonomy";
  const TAXONOMY_VERSION_STORAGE_KEY = "pope-kyrillos-taxonomy-version";
  const CURRENT_TAXONOMY_VERSION = 2026081701;
  const stored = (() => {
    try {
      const storedVersion = Number(localStorage.getItem(TAXONOMY_VERSION_STORAGE_KEY) || 0);
      if (!Number.isFinite(storedVersion) || storedVersion < CURRENT_TAXONOMY_VERSION) {
        localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(defaultCategories));
        localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY, String(CURRENT_TAXONOMY_VERSION));
        return defaultCategories;
      }
      const parsed = JSON.parse(localStorage.getItem(TAXONOMY_STORAGE_KEY) || "null");
      if (Array.isArray(parsed)) return parsed;
      localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(defaultCategories));
      localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY, String(CURRENT_TAXONOMY_VERSION));
      return defaultCategories;
    } catch {
      return null;
    }
  })();
  // The shipped taxonomy is canonical. Merge locally managed presentation fields
  // into it by stable ID so an old, partial browser cache can never hide categories
  // or subcategories added in a later release.
  const storedCategories = Array.isArray(stored) ? stored : [];
  const migrateStoredSubcategory = (categoryId, item) => {
    if (categoryId === "altar-vessels" && item?.id === "altar-crosses") {
      return { ...item, id: "altar-vessel-crosses" };
    }
    return item;
  };
  const mergeSubcategories = (categoryId, defaults = [], overrides = []) => {
    const migratedOverrides = overrides.map((item) => migrateStoredSubcategory(categoryId, item));
    const overridesById = new Map(migratedOverrides.filter((item) => item?.id).map((item) => [item.id, item]));
    const merged = defaults.map((item) => ({ ...item, ...(overridesById.get(item.id) || {}) }));
    const defaultIds = new Set(defaults.map((item) => item.id));
    return merged.concat(migratedOverrides.filter((item) => item?.id && !defaultIds.has(item.id)));
  };
  const storedById = new Map(storedCategories.filter((item) => item?.id).map((item) => [item.id, item]));
  const categories = defaultCategories.map((category) => {
    const override = storedById.get(category.id);
    return override
      ? { ...category, ...override, id: category.id, subcategories: mergeSubcategories(category.id, category.subcategories, override.subcategories) }
      : { ...category, subcategories: mergeSubcategories(category.id, category.subcategories) };
  });
  const defaultCategoryIds = new Set(defaultCategories.map((category) => category.id));
  categories.push(...storedCategories.filter((category) => category?.id && !defaultCategoryIds.has(category.id)));
  const categoryById = new Map(categories.map(c => [c.id,c]));
  const categoryByName = new Map(categories.map(c => [c.name,c]));
  const subcategoryById = new Map(), subcategoryByName = new Map();
  categories.forEach(c => (c.subcategories||[]).forEach(s => { const entry={...s,mainId:c.id,mainName:c.name}; subcategoryById.set(s.id,entry); subcategoryByName.set(s.name,entry); }));
  function customerCategories(){ return categories.filter(c => !c.hiddenFromCustomerNav && c.visible !== false); }
  function categoryIdFromName(n){ return categoryByName.get(n)?.id || ""; } function categoryNameFromId(id){ return categoryById.get(id)?.name || ""; }
  function subcategoryIdFromName(n){ return subcategoryByName.get(n)?.id || ""; } function subcategoryNameFromId(id){ return subcategoryById.get(id)?.name || ""; }
  function getSubcategories(v){ return (categoryById.get(v)||categoryByName.get(v))?.subcategories||[]; }
  function categoryImage(category){
    const value = category?.subcategoryImage || category?.imageUrl || category?.imageURL || category?.image_url || category?.image || category?.thumbnail || category?.thumbnailUrl || category?.cover || category?.categoryImage || "";
    if (typeof value !== "string" || !value.trim() || /^(?:javascript|data:text|blob):/i.test(value.trim())) return "";
    return value.trim().replace(/^\/public\//, "/");
  }
  window.POPE_KYRILLOS_TAXONOMY={categories,defaultCategories,CURRENT_TAXONOMY_VERSION,customerCategories,categoryById,categoryByName,subcategoryById,subcategoryByName,categoryIdFromName,categoryNameFromId,subcategoryIdFromName,subcategoryNameFromId,getSubcategories,categoryImage};
})();
