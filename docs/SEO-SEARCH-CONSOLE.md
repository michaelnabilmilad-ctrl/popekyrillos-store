# متابعة SEO عبر Google Search Console — مكتبة البابا كيرلس

دليل تشغيل للمالك. كل الأدوات المذكورة مجانية. Claude لا يملك صلاحية دخول حساب Search Console؛ أي بيانات مطلوبة يصدّرها المالك ويرسلها.

## 1. الـSitemap

- العنوان الثابت: `https://popekyrillos.store/sitemap.xml` (نفس العنوان قبل وبعد التحديث).
- الآن (قبل نشر المرحلة الأولى): أضفه من **Sitemaps → Add a new sitemap**. النسخة الحالية ثابتة وفيها 143 منتجًا.
- بعد النشر: يصبح ديناميكيًا من بيانات products-data، فيه كل منتج متاح له سعر وصورة (162 حاليًا) والأقسام التي بها منتجات. لا حاجة لإعادة رفعه عند إضافة منتجات؛ Google يعيد قراءته دوريًا. يُفضَّل الضغط على **Resubmit** مرة واحدة بعد النشر.
- ما يجب أن تراه في تقرير Sitemaps: `Status: Success` و`Discovered URLs` قريب من عدد الروابط (حوالي 207).
- ما لا يدخل الـsitemap عمدًا: المنتجات "غير متاح حاليا"، والمنتجات بلا سعر أو بلا صورة، وقسم "غير مصنف"، وصفحات السلة والدفع والإدارة.

## 2. اختبار الفهرسة بـ URL Inspection

اختبر هذه الروابط (الصقها في شريط البحث أعلى Search Console):

| الرابط | السبب |
|---|---|
| `https://popekyrillos.store/` | الصفحة الرئيسية |
| `https://popekyrillos.store/products` | فهرس كل المنتجات |
| `https://popekyrillos.store/category/altar-vessels` | قسم رئيسي |
| `https://popekyrillos.store/category/altar-vessels/censers` | قسم فرعي |
| `https://popekyrillos.store/products/شوريه-نحاس-يوناني-صغيره` | منتج جديد لم يكن في الـsitemap |
| `https://popekyrillos.store/products/قلم-يوتا` | منتج جديد |
| `https://popekyrillos.store/products/طقم-صلبان-يد-وصدر-كوريان-موديل-1` | منتج قديم مفهرس |

### قبل النشر (لقياس نقطة البداية)
1. افتح كل رابط وسجّل الحالة: `URL is on Google` أو `URL is not on Google` والسبب في **Page indexing**.
2. صوّر الشاشة أو انسخ النتيجة وأرسلها.

### بعد النشر
1. افتح الرابط ← **Test live URL**.
2. **View tested page → HTML**: ابحث عن اسم المنتج داخل `<h1>` وعن السعر وعن `product-json-ld`.
3. **Screenshot**: يجب أن تظهر الصورة والاسم والسعر.
4. **More info → Page resources**: لا يجب أن يكون `/api/catalog` ضمن الموارد المحجوبة.
5. في قسم **Enhancements** للاختبار يجب أن يظهر: `Product snippets` و`Merchant listings` و`Breadcrumbs` بدون أخطاء. المنتجات ذات الاختيارات تظهر كـ `ProductGroup` وكل اختيار كعنصر Merchant listing مستقل بسعره. الملاحظات الاختيارية المتوقعة: `aggregateRating` و`review` (لا توجد تقييمات حقيقية بعد)، و`shippingDetails` و`hasMerchantReturnPolicy` (تُضبط من إعدادات الشحن والإرجاع، انظر القسم 6).
6. افتح رابط اختيار (مثل `?variant=...` من البيانات المنظمة) وتأكد أن الصفحة تعرض نفس الاختيار ونفس السعر.
7. اضغط **Request indexing** للروابط المهمة فقط (الحد اليومي صغير، حوالي 10). المنتجات الباقية يكتشفها Google من الـsitemap والروابط الداخلية.

اختبار مستقل بدون حساب: [Rich Results Test](https://search.google.com/test/rich-results) — الصق رابط المنتج بعد النشر.

## 3. التقارير التي نتابعها

### Performance → Search results
- الفترة: **Compare → Last 28 days vs Previous period**، ومرة شهريًا **Last 3 months**.
- المقاييس: Clicks, Impressions, CTR, Average position (فعّل الأربعة).
- **بحث باسم المكتبة**: Query → Custom (regex) → `Matches regex`:
  `البابا|كيرلس|popek|kyrillos`
- **بحث عام عن المنتجات**: نفس الفلتر لكن `Doesn't match regex`.
- **صفحات المنتجات فقط**: Page → `URLs containing` → `/products/`.
- **صفحات الأقسام**: Page → `URLs containing` → `/category/`.

### Indexing → Pages
- راقب الرقمين: Indexed و Not indexed.
- أسباب نتوقعها وطبيعية: `Excluded by noindex` (المنتجات بلا سعر وصفحات الأقسام الفارغة)، `Alternate page with proper canonical` (روابط السياسات البديلة و`/category/all`)، `Not found (404)` (روابط قديمة لمنتجات محذوفة).
- أسباب تستحق التدخل: `Discovered – currently not indexed` أو `Crawled – currently not indexed` لمنتجات مهمة. أرسل القائمة (Export) لنراجع محتواها.

### Indexing → Sitemaps
- Status و Discovered URLs وتاريخ Last read.

### Enhancements / Shopping
- **Product snippets** و **Merchant listings** و **Breadcrumbs**: عدد العناصر الصالحة والأخطاء.

### Security & Manual Actions
- **Security issues** و **Manual actions**: الحالة الطبيعية "No issues detected".

## 4. المراقبة الأمنية المجانية (Safe Browsing + Search Console)

1. **تنبيهات البريد**: Search Console يرسل بريدًا تلقائيًا لمالكي الموقع عند أي Security issue أو Manual action. تأكد من: ⚙️ Settings → **Email preferences** → مفعّلة، وأن بريدك مسجل كـ Owner في **Users and permissions**.
2. **فحص أسبوعي (دقيقتان)**:
   - [Google Safe Browsing](https://transparencyreport.google.com/safe-browsing/search?url=popekyrillos.store) — المطلوب: "No unsafe content found".
   - Search Console → Security issues و Manual actions.
   - [Sucuri SiteCheck](https://sitecheck.sucuri.net/results/popekyrillos.store) — المطلوب: لا malware ولا blacklist.
3. **Bing Webmaster Tools** (مجاني): **Import from Google Search Console** يربط الموقع في دقيقة، ويرسل تنبيهات malware من Bing أيضًا، ويمكن رفع نفس الـsitemap.
4. اختياري: مهمة مجدولة أسبوعية في تطبيق Claude تفتح الصفحات السابقة وتنبه عند أي تغيير (بموافقتك).

إذا ظهر تحذير "May be suspicious" مرة أخرى: صوّر نتيجة Google، وسجّل التاريخ والجهاز والمتصفح، وافحص فورًا الروابط الثلاثة في البند 2 قبل أي تعديل.

## 5. قياس الكلمات والنقرات والترتيب مجانًا

**الطريقة الأساسية (بيانات حقيقية):**
- Performance → **Export → Google Sheets** أسبوعيًا (Queries و Pages)، وتسمية الملف بالتاريخ. هذا يبني سجلًا تاريخيًا يتجاوز حد الـ16 شهرًا.
- مجموعات الكلمات للمتابعة (فلتر Query → regex):

| المجموعة | regex |
|---|---|
| يوتا (صلبان وأقلام وألوان) | `يوتا|يوطا|iota|yota` |
| الشوريات والبخور | `شوري|شورية|مبخر|بخور` |
| القناديل | `قنديل|قناديل` |
| الصلبان | `صليب|صلبان` |
| أواني المذبح وكرسي الكأس | `المذبح|كرسي ك|كأس|كاس|صينية|ابريق|إبريق` |
| البشارة | `بشار` |
| الشمامسة | `شماس|شمامس|تونيه|تونية` |
| الكتب الطقسية | `ابصلمودية|إبصلمودية|تسبحة|خولاجي|أجبية|اجبية` |
| هدايا مدارس الأحد | `مدارس الأحد|مدارس الاحد|هدايا` |

**لوحة تقارير بدون برمجة (موصى بها الآن):** [Looker Studio](https://lookerstudio.google.com) مجاني، وفيه موصل رسمي **Search Console** يقرأ البيانات الحقيقية مباشرة (جدولا *Site Impression* و *URL Impression*). يمكن بناء لوحة: النقرات والظهور والترتيب أسبوعيًا، بحث الاسم مقابل البحث العام، أفضل المنتجات، والمجموعات السابقة.

**لاحقًا: لوحة SEO داخل /admin:** ممكنة مجانًا عبر Search Console API. تحتاج من المالك: مشروع Google Cloud مجاني، تفعيل *Google Search Console API*، إنشاء Service Account، إضافة بريده كـ *Restricted user* في Search Console، وحفظ مفتاحه كـ Secret في Cloudflare. هذه مرحلة منفصلة بموافقة مستقلة.

## 6. المطلوب من المالك الآن

1. إضافة الـsitemap في Search Console (البند 1).
2. نتائج URL Inspection للروابط السبعة قبل النشر (البند 2).
3. تصدير Performance لآخر 3 أشهر (Queries + Pages) إلى Google Sheets أو CSV.
4. تصدير **Pages → Not indexed** (قائمة الأسباب والروابط).
5. تأكيد تفعيل تنبيهات البريد.
6. اختياري لتحسين Merchant listings: في Search Console ← **Settings → Shopping → Shipping and returns** أضف سياسة الإرجاع (14 يومًا، مع الاستثناءات المذكورة في صفحة السياسات) وتكلفة الشحن داخل مصر. هذا يغني عن وضع `shippingDetails` و`hasMerchantReturnPolicy` على كل منتج، ويحترم استثناءات المنتجات المخصصة والبخور والشموع.
7. عنوان المكتبة إن كان لها فرع يستقبل العملاء (لبيانات LocalBusiness و Google Business Profile).
8. تصحيح بيانات اختيارين: "لون تلوين اليوتا" فيه اختيار اسمه "اختيار 2"، والمنتج التجريبي "منتج جديد" بسعر صفر وبدون صورة.
