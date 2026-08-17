// Generates the customer-editable taxonomy data and safely migrates products.
// Run with: node scripts/build-taxonomy-v3.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(root, "backups", `pre-taxonomy-v3-${stamp}`);
fs.mkdirSync(backup, { recursive: true });
for (const file of ["category-taxonomy.js", "products.json", "admin.html", "admin.js", "index.html", "script.js", "styles.css"])
  fs.copyFileSync(path.join(root, file), path.join(backup, file));

const image = {
  altar: "assets/optimized/products/communion-set.webp",
  incense: "assets/optimized/products/incense-chat.webp",
  candle: "assets/optimized/products/gallery/sham3.iconat.webp",
  vestment: "assets/optimized/products/gallery/stole-01.webp",
  cross: "assets/optimized/products/processional-cross.webp",
  icon: "assets/optimized/products/gallery/030-9841770725683-01.webp",
  book: "assets/optimized/products/gallery/baskha-araby.webp",
  service: "assets/optimized/featured-service-bundle.webp",
  church: "assets/optimized/hero-products-collage.webp"
};
const c = (id, name, description, subcategoryImage, names) => ({ id, name, description, subcategoryImage, visible: true, homeVisible: true, subcategories: names.map(([sid, sname]) => ({ id: sid, name: sname, manualImage: "", representativeProductId: "" })) });
const categories = [
  c("altar-vessels", "المذبح والأواني المقدسة", "أواني المذبح والذخيرة وأدوات الخدمة المقدسة", image.altar, [["altar-sets","أطقم أواني المذبح"],["chalices","الكؤوس"],["trays-stars","الصواني والنجوم"],["mystir","المستير"],["water-wine-cruets","قوارير الماء والخمر"],["relic-boxes","حق الذخيرة"],["communion-bread-boxes","بيوت القربان"],["holy-oil-vessels","أواني الميرون والزيوت"],["laqan-vessels","أواني اللقان"],["service-plates","أطباق الخدمة"],["altar-vessel-crosses","صلبان المذبح"],["altar-candlesticks","شمعدانات المذبح"],["gospel-stands","حوامل الإنجيل والبشارة"],["vessel-cases","شنط وصناديق حفظ الأواني"]]),
  c("censers-incense", "الشوريات والبخور", "الشوريات والمباخر والبخور والفحم والعطور الكنسية", image.incense, [["brass-censers","شوريات نحاس"],["stainless-censers","شوريات ستانلس"],["silver-gold-censers","شوريات فضي وذهبي"],["deacon-censers","شوريات شماسية"],["home-censers","مباخر منزلية"],["incense-boxes","حق البخور"],["incense-spoons","ملاعق البخور"],["church-incense","بخور كنسي"],["greek-incense","بخور يوناني"],["natural-incense","لبان وبخور طبيعي"],["charcoal","الفحم"],["aparaka","الأباركة والعطور الكنسية"],["hanout","الحنوط"],["censer-parts","أدوات وقطع غيار الشوريات"]]),
  c("candles-lamps", "الشمع والقناديل", "شموع الكنيسة والقناديل وزيوتها وقطع غيارها", image.candle, [["church-candles","شمع الكنيسة"],["altar-candles","شمع المذبح"],["wedding-candles","شمع الإكليل"],["baptism-candles","شمع المعمودية"],["holy-week-candles","شمع أسبوع الآلام"],["resurrection-candles","شمع القيامة"],["beeswax-candles","شمع النحل"],["candlesticks","شمعدانات"],["candle-holders","حوامل شمع"],["hanging-lamps","قناديل معلقة"],["wall-lamps","قناديل حائط"],["altar-lamps","قناديل المذبح"],["lamp-glasses","كاسات القناديل"],["lamp-oil","زيت القناديل"],["wicks-floats","الفتائل والعوامات"],["lamp-parts","قطع غيار القناديل"]]),
  c("church-vestments", "الملابس والأقمشة الكنسية", "ملابس الكهنة والشمامسة ومفارش وأقمشة الهيكل", image.vestment, [["priest-clothing","ملابس الكهنة"],["priest-tonias","التوني الكهنوتية"],["stoles","البطرشيلات"],["copes","البرانس"],["sleeves-belts","الأكمام والأحزمة"],["bishop-clothing","ملابس الأساقفة"],["deacon-clothing","ملابس الشمامسة"],["adult-deacon-tonias","توني الشمامسة للكبار"],["children-deacon-tonias","توني الشمامسة للأطفال"],["choir-clothing","ملابس الكورال"],["baptism-clothing","ملابس المعمودية"],["sanctuary-curtains","ستر وستائر الهيكل"],["altar-cloths","مفارش المذبح"],["chalice-covers","أغطية الكأس والصينية"],["prospharine","الإبروسفارين"],["service-towels","مناديل الخدمة"],["gospel-covers","أغطية المنجليات وحوامل الإنجيل"],["flags-banners","الرايات والبيارق"],["custom-embroidery","تطريز وتنفيذ بالطلب"]]),
  c("crosses", "الصلبان", "صلبان اليد والصدر والمذبح والمواكب بخامات متعددة", image.cross, [["hand-crosses","صلبان يد"],["pectoral-crosses","صلبان صدر"],["priest-crosses","صلبان كهنة"],["deacon-crosses","صلبان شمامسة"],["altar-crosses","صلبان مذبح"],["processional-crosses","صلبان مواكب"],["wall-crosses","صلبان حائط"],["desk-crosses","صلبان مكتب"],["car-crosses","صلبان سيارات"],["wooden-crosses","صلبان خشب"],["brass-crosses","صلبان نحاس"],["stainless-crosses","صلبان ستانلس"],["silver-crosses","صلبان فضة"],["iota-crosses","صلبان فن اليوتا"],["colored-crosses","صلبان ملونة"],["personalized-crosses","صلبان محفورة بالاسم"],["giveaway-crosses","صلبان توزيعات"],["cross-boxes","علب وحوامل الصلبان"]]),
  c("icons-frames", "الأيقونات والبراويز", "أيقونات وبراويز للمنزل والكنيسة والهدايا", image.icon, [["christ-icons","أيقونات السيد المسيح"],["mary-icons","أيقونات السيدة العذراء"],["angel-icons","أيقونات الملائكة"],["apostle-icons","أيقونات الرسل"],["saint-icons","أيقونات القديسين"],["martyr-icons","أيقونات الشهداء"],["feast-icons","أيقونات الأعياد"],["holy-family-icons","أيقونات العائلة المقدسة"],["wooden-icons","أيقونات خشب"],["metal-icons","أيقونات معدن"],["glass-icons","أيقونات زجاج"],["wall-icons","أيقونات حائط"],["desk-icons","أيقونات مكتب"],["car-icons","أيقونات سيارة"],["giveaway-icons","أيقونات توزيعات"],["multi-icons","أيقونات ثنائية وثلاثية"],["frames","براويز"],["icon-stands","حوامل الأيقونات"],["icon-lamps","قناديل الأيقونات"],["custom-icons","أيقونات حسب الطلب"]]),
  c("books-rituals", "الكتب والطقوس", "الكتاب المقدس والكتب الطقسية والروحية وكتب الخدمة", image.book, [["bibles","الكتاب المقدس"],["new-testament","العهد الجديد"],["agpeya-prayers","الأجبية"],["kholagy","الخولاجي"],["katameros","القطمارس"],["synaxarium","السنكسار"],["psalmody","الإبصلمودية"],["liturgy-books","كتب القداس"],["tasbeha-books","كتب التسبحة"],["holy-week-books","كتب أسبوع الآلام"],["hymns-books","كتب الألحان"],["theology-books","كتب العقيدة واللاهوت"],["fathers-books","كتب الآباء"],["saints-lives","سير القديسين"],["children-books","كتب الأطفال"],["illustrated-stories","قصص مصورة"],["youth-ministry-books","كتب الشباب والخدمة"],["family-books","كتب الأسرة والزواج"],["prayer-books","كتب الصلاة والتأمل"],["english-books","كتب باللغة الإنجليزية"],["booklets","كتيبات وتوزيعات"],["book-accessories","فواصل وجرابات الكتب"],["book-stands","حوامل الكتب"]]),
  c("occasions-service", "المناسبات والخدمة", "المعمودية والإكليل ومدارس الأحد والمواسم والأعياد", image.service, [["baptism-supplies","مستلزمات المعمودية"],["wedding-supplies","مستلزمات الإكليل"],["sunday-school-gifts","هدايا مدارس الأحد"],["meeting-gifts","توتي باج وشنط"],["notebooks-planners","أجندات ونوت"],["cards-bookmarks","كروت وبوك مارك"],["medals-bracelets","ميداليات وأساور"],["christian-games","ألعاب مسيحية"],["crafts-coloring","تلوين وأشغال يدوية"],["conference-gifts","هدايا المؤتمرات"],["seasonal-products","المواسم والأعياد"],["personalized","منتجات مطبوعة ومخصصة"]]),
  c("church-equipment", "تجهيز الكنائس والطلبات الخاصة", "تجهيزات الكنائس والأثاث والإضاءة والتصنيع حسب الطلب", image.church, [["icon-gospel-stands","حوامل الأيقونات والإنجيل"],["lecterns","منجليات"],["clergy-chairs","كراسي الكهنة والأساقفة"],["deacon-seats","مقاعد الشمامسة"],["vessel-cabinets","دواليب حفظ الأواني"],["floor-candle-stands","حوامل الشمع الأرضية"],["donation-boxes","صناديق التبرعات"],["baptism-fonts","أجران المعمودية"],["bells","الأجراس"],["chandeliers","النجف والثريات"],["church-lighting","وحدات الإضاءة الكنسية"],["iconostasis","أبواب وأحجبة الهيكل"],["procession-flags","أعلام وبيارق المواكب"],["church-libraries","تجهيز مكتبات الكنائس"],["custom-woodwork","تصنيع خشب حسب الطلب"],["custom-metalwork","تصنيع معدن حسب الطلب"],["new-church-package","تجهيز كنيسة جديدة"],["quote-request","طلب عرض سعر"]]),
  { id:"uncategorized", name:"غير مصنف", description:"منتجات تحتاج مراجعة", hiddenFromCustomerNav:true, visible:false, homeVisible:false, subcategoryImage:image.church, subcategories:[{id:"needs-review",name:"يحتاج مراجعة",subcategoryImage:image.church}] }
];

const oldToNew = {
  "altar-tools":["altar-vessels","service-plates"], "candles-incense":["censers-incense","church-incense"],
  "church-vestments":["church-vestments","deacon-clothing"], "icons-frames":["icons-frames","saint-icons"],
  "crosses":["crosses","hand-crosses"], "books-rituals":["books-rituals","prayer-books"],
  "gifts-accessories":["occasions-service","meeting-gifts"], "uncategorized":["uncategorized","needs-review"]
};
const subMap = {
  "candlesticks":["candles-lamps","candlesticks"],"censers":["censers-incense","brass-censers"],"altar-vessels":["altar-vessels","altar-sets"],"relic-boxes":["altar-vessels","relic-boxes"],"stands":["church-equipment","icon-gospel-stands"],"service-tools":["altar-vessels","service-plates"],
  "candles":["candles-lamps","church-candles"],"incense":["censers-incense","church-incense"],"charcoal":["censers-incense","charcoal"],"aparaka":["censers-incense","aparaka"],"candle-supplies":["candles-lamps","wicks-floats"],"incense-sets":["censers-incense","church-incense"],
  "deacon-tonias":["church-vestments","adult-deacon-tonias"],"stoles":["church-vestments","stoles"],"priest-clothing":["church-vestments","priest-clothing"],"children-clothing":["church-vestments","children-deacon-tonias"],"altar-cloths":["church-vestments","altar-cloths"],"curtains":["church-vestments","sanctuary-curtains"],"church-fabrics":["church-vestments","altar-cloths"],"custom-embroidery":["church-vestments","custom-embroidery"],"complete-sets":["church-vestments","deacon-clothing"],
  "wooden-icons":["icons-frames","wooden-icons"],"printed-icons":["icons-frames","saint-icons"],"frames":["icons-frames","frames"],"saints-pictures":["icons-frames","saint-icons"],"small-icons":["icons-frames","giveaway-icons"],
  "hand-crosses":["crosses","hand-crosses"],"pectoral-crosses":["crosses","pectoral-crosses"],"wooden-crosses":["crosses","wooden-crosses"],"metal-crosses":["crosses","brass-crosses"],"altar-crosses":["crosses","altar-crosses"],"processional-crosses":["crosses","processional-crosses"],
  "agpeya-prayers":["books-rituals","agpeya-prayers"],"katameros":["books-rituals","katameros"],"liturgical-books":["books-rituals","liturgy-books"],"hymns-books":["books-rituals","hymns-books"],"spiritual-theology":["books-rituals","theology-books"],"children-books":["books-rituals","children-books"],"coptic-books":["books-rituals","prayer-books"],
  "tote-bags":["occasions-service","meeting-gifts"],"notebooks":["occasions-service","notebooks-planners"],"planners":["occasions-service","notebooks-planners"],"cards":["occasions-service","cards-bookmarks"],"bookmarks":["occasions-service","cards-bookmarks"],"meeting-games":["occasions-service","christian-games"],"personalized":["occasions-service","personalized"],"medals":["occasions-service","medals-bracelets"],"chains":["occasions-service","medals-bracelets"],"bracelets":["occasions-service","medals-bracelets"]
};

const productsSource = process.env.TAXONOMY_SOURCE_PRODUCTS || path.join(root,"products.json");
const products = JSON.parse(fs.readFileSync(productsSource,"utf8"));
const validCategory = new Map(categories.flatMap(category => (category.subcategories || []).map(subcategory => [subcategory.id, category.id])));
const before = products.map(p => ({ id:p.id, name:p.name, oldCategory:p.mainCategory || p.category, oldSubcategory:p.subcategory, price:JSON.stringify(p.price), images:JSON.stringify(p.images || p.image), slug:p.slug || "" }));
for (const p of products) {
  const currentSubcategory = p.subcategory || p.subCategory;
  const target = validCategory.get(currentSubcategory) === p.mainCategory
    ? [p.mainCategory, currentSubcategory]
    : subMap[currentSubcategory] || subMap[p.subCategory] || oldToNew[p.mainCategory] || ["uncategorized","needs-review"];
  p.mainCategory = target[0]; p.subcategory = target[1]; p.subCategory = target[1];
  p.tags = Array.isArray(p.tags) ? p.tags : [];
  p.collections = Array.isArray(p.collections) ? p.collections : [];
  p.searchKeywords = [...new Set([...(Array.isArray(p.searchKeywords)?p.searchKeywords:[]), p.material, p.saint, p.occasion].filter(Boolean))];
  if (p.customizable) p.collections.push("customizable");
  if (p.wholesale) p.collections.push("wholesale");
  p.collections = [...new Set(p.collections)];
}
const report = products.map((p,i)=>({ id:p.id,name:p.name,oldCategory:before[i].oldCategory,oldSubcategory:before[i].oldSubcategory,newMainCategory:p.mainCategory,newSubcategory:p.subcategory,tags:p.tags.join(" | "),needsReview:p.mainCategory==="uncategorized" }));
fs.writeFileSync(path.join(root,"products.json"),JSON.stringify(products,null,2)+"\n");
for (const target of ["dist/products.json","firebase-functions/products.json"]) fs.writeFileSync(path.join(root,target),JSON.stringify(products,null,2)+"\n");
fs.writeFileSync(path.join(root,"product-taxonomy-mapping.csv"),"id,name,oldCategory,oldSubcategory,newMainCategory,newSubcategory,tags,needsReview\n"+report.map(row=>Object.values(row).map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n")+"\n");

const source = `(function () {\n  const defaultCategories = ${JSON.stringify(categories,null,2)};\n  const stored = (() => { try { return JSON.parse(localStorage.getItem("pope-kyrillos-taxonomy") || "null"); } catch { return null; } })();\n  const categories = Array.isArray(stored) && stored.length ? stored : defaultCategories;\n  const categoryById = new Map(categories.map(c => [c.id,c]));\n  const categoryByName = new Map(categories.map(c => [c.name,c]));\n  const subcategoryById = new Map(), subcategoryByName = new Map();\n  categories.forEach(c => (c.subcategories||[]).forEach(s => { const entry={...s,mainId:c.id,mainName:c.name}; subcategoryById.set(s.id,entry); subcategoryByName.set(s.name,entry); }));\n  function customerCategories(){\n    const visibleCategories = categories.filter(c => !c.hiddenFromCustomerNav && c.visible !== false);\n    if (visibleCategories.length) return visibleCategories;\n    return defaultCategories.filter(c => !c.hiddenFromCustomerNav && c.visible !== false);\n  }\n  function categoryIdFromName(n){ return categoryByName.get(n)?.id || ""; } function categoryNameFromId(id){ return categoryById.get(id)?.name || ""; }\n  function subcategoryIdFromName(n){ return subcategoryByName.get(n)?.id || ""; } function subcategoryNameFromId(id){ return subcategoryById.get(id)?.name || ""; }\n  function getSubcategories(v){ return (categoryById.get(v)||categoryByName.get(v))?.subcategories||[]; }\n  window.POPE_KYRILLOS_TAXONOMY={categories,defaultCategories,customerCategories,categoryById,categoryByName,subcategoryById,subcategoryByName,categoryIdFromName,categoryNameFromId,subcategoryIdFromName,subcategoryNameFromId,getSubcategories};\n})();\n`;
const safeSource = source
  .replace(
    '  const stored = (() => { try { return JSON.parse(localStorage.getItem("pope-kyrillos-taxonomy") || "null"); } catch { return null; } })();',
    `  const TAXONOMY_STORAGE_KEY = "pope-kyrillos-taxonomy";
  const TAXONOMY_VERSION_STORAGE_KEY = "pope-kyrillos-taxonomy-version";
  const CURRENT_TAXONOMY_VERSION = 2026080801;
  const stored = (() => { try { const storedVersion=Number(localStorage.getItem(TAXONOMY_VERSION_STORAGE_KEY)||0); if(!Number.isFinite(storedVersion)||storedVersion<CURRENT_TAXONOMY_VERSION){ localStorage.setItem(TAXONOMY_STORAGE_KEY,JSON.stringify(defaultCategories)); localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY,String(CURRENT_TAXONOMY_VERSION)); return defaultCategories; } const parsed=JSON.parse(localStorage.getItem(TAXONOMY_STORAGE_KEY)||"null"); if(Array.isArray(parsed)) return parsed; localStorage.setItem(TAXONOMY_STORAGE_KEY,JSON.stringify(defaultCategories)); localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY,String(CURRENT_TAXONOMY_VERSION)); return defaultCategories; } catch { return null; } })();`
  )
  .replace(
    "  const categories = Array.isArray(stored) && stored.length ? stored : defaultCategories;",
    `  const storedCategories = Array.isArray(stored) ? stored : [];
  const mergeSubcategories = (defaults = [], overrides = []) => { const overridesById = new Map(overrides.filter(s => s?.id).map(s => [s.id,s])); const defaultIds = new Set(defaults.map(s => s.id)); return defaults.map(s => ({...s,...(overridesById.get(s.id)||{})})).concat(overrides.filter(s => s?.id && !defaultIds.has(s.id))); };
  const storedById = new Map(storedCategories.filter(c => c?.id).map(c => [c.id,c]));
  const categories = defaultCategories.map(c => { const override=storedById.get(c.id); return override ? {...c,...override,id:c.id,subcategories:mergeSubcategories(c.subcategories,override.subcategories)} : {...c,subcategories:mergeSubcategories(c.subcategories)}; });
  const defaultIds = new Set(defaultCategories.map(c => c.id)); categories.push(...storedCategories.filter(c => c?.id && !defaultIds.has(c.id)));`
  )
  .replace(
    /  function customerCategories\(\)\{[\s\S]*?\n  \}/,
    "  function customerCategories(){ return categories.filter(c => !c.hiddenFromCustomerNav && c.visible !== false); }"
  )
  .replace(
    "  window.POPE_KYRILLOS_TAXONOMY=",
    `  function categoryImage(category){ const value=category?.subcategoryImage||category?.imageUrl||category?.imageURL||category?.image_url||category?.image||category?.thumbnail||category?.thumbnailUrl||category?.cover||category?.categoryImage||""; if(typeof value!=="string"||!value.trim()||/^(?:javascript|data:text|blob):/i.test(value.trim())) return ""; return value.trim().replace(/^\\/public\\//,"/"); }
  window.POPE_KYRILLOS_TAXONOMY=`
  )
  .replace("window.POPE_KYRILLOS_TAXONOMY={categories,defaultCategories,", "window.POPE_KYRILLOS_TAXONOMY={categories,defaultCategories,CURRENT_TAXONOMY_VERSION,")
  .replace("getSubcategories};", "getSubcategories,categoryImage};");
fs.writeFileSync(path.join(root,"category-taxonomy.js"),safeSource);
console.log(JSON.stringify({backup,products:products.length,needsReview:report.filter(r=>r.needsReview).length,categories:9},null,2));
