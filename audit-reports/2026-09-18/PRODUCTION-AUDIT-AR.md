# OVERALL WEBSITE HEALTH

تاريخ القياس: 2026-09-18 (Production). نطاق العمل: تحليل واختبار فقط، دون تعديل الكود أو Cloudflare أو بيانات المنتجات، ودون إنشاء طلب أو عملية دفع.

- Performance: **جيد عمومًا، لكن Checkout mobile ضعيف وCategory desktop يعاني CLS شديد**. الصفحة الرئيسية نفسها سريعة حسابيًا، لكن مورد صورة مفقود يدخل في حلقة طلبات 404 متكررة جدًا.
- Functionality: **متوسط/عالي المخاطر**. البحث والفلاتر وQuick View وروابط المنتجات تعمل، لكن حفظ السلة أظهر تذبذبًا بين الانتقال الفوري وإعادة التحميل. لم يُنشأ أي Order ولم تُرسل أي عملية Paymob.
- Mobile: **جيد بصريًا** في 360×800 و390×844 و768×1024؛ لم يظهر horizontal overflow في الصفحات المختبرة. Checkout mobile بطيء رغم سلامة التخطيط.
- Accessibility: **جيد جدًا** (100 غالبًا، 96 لصفحة المنتج mobile). يوجد contrast 2.71:1 في اسم التصنيف، واسم accessible غير مطابق لنص رابط السلة.
- SEO: **قوي للـHomepage/Product (100)**، Category = 92 بسبب canonical غير صالح/مفقود، Cart/Checkout = 63 لأنهما noindex (مقبول وظيفيًا لصفحات المعاملة). صفحات المنتجات مستقلة وقابلة للفهرسة، مع Product/Offer JSON-LD؛ Breadcrumb/Organization schema غير موجودين في عينة المنتج.
- Network/Cache: **مختلط**. الصور مخزنة جيدًا، لكن CSS/JS versioned ما زالا `no-cache, must-revalidate`. `/api/catalog` له CDN TTL 600s + SWR 300s، وهي نافذة stale محتملة للأسعار/المخزون. لا يوجد Service Worker قديم فعال؛ الكود يلغي registrations القديمة.

## Lighthouse median (3 runs)

الأزمنة بالمللي ثانية، Transfer بالحجم المنقول. Lab data فقط؛ لم تتوفر CrUX/PSI field data موثوقة بدون API quota، لذلك لا توجد أرقام INP field ولا تم خلطها بنتائج Lighthouse.

| Page | Device | Perf / A11y / BP / SEO | FCP | LCP | TBT | CLS | Speed Index | TTFB | Requests | Transfer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Homepage | Mobile | 97 / 100 / 77 / 100 | 1530 | 1800 | 80 | 0.086 | 1788 | 56 | 2239* | 427 KB |
| Homepage | Desktop | 100 / 100 / 77 / 100 | 431 | 700 | 0 | 0 | 596 | 66 | 2255* | 714 KB |
| Category censers | Mobile | 97 / 100 / 77 / 92 | 1602 | 2269 | 102 | 0 | 2475 | 58 | 28 | 818 KB |
| Category censers | Desktop | 75 / 100 / 77 / 92 | 517 | 747 | 11 | **0.887** | 974 | 65 | 29 | 1097 KB |
| Product | Mobile | 98 / 96 / 77 / 100 | 1612 | 2169 | 83 | 0 | 1860 | 435 | 18 | 179 KB |
| Product | Desktop | 100 / 100 / 77 / 100 | 494 | 591 | 22 | 0 | 869 | 649 | 18 | 178 KB |
| Yota product | Mobile | 98 / 100 / 77 / 100 | 1604 | 2024 | 22 | 0 | 2362 | 783 | 14 | 135 KB |
| Yota product | Desktop | 100 / 100 / 77 / 100 | 502 | 512 | 0 | 0 | 788 | 626 | 14 | 134 KB |
| Cart | Mobile | 99 / 100 / 77 / 63 | 1632 | 1632 | 18 | 0.014 | 1674 | 102 | 25 | 570 KB |
| Cart | Desktop | 100 / 100 / 77 / 63 | 510 | 510 | 0 | 0 | 510 | 57 | 19 | 435 KB |
| Checkout | Mobile | **57** / 100 / 77 / 63 | **4405** | **6158** | **261** | 0 | 4405 | 65 | 45 | 610 KB |
| Checkout | Desktop | 97 / 100 / 77 / 63 | 762 | 1231 | 8 | 0 | 762 | 51 | 33 | 470 KB |

\* Homepage request count ليس طبيعيًا: نفس thumbnail المفقود طُلب 2240 مرة في تشغيل واحد، وهو دليل المشكلة الأساسية وليس حملًا مشروعًا.

أحجام النوع (median): Homepage mobile JS 77 KB / CSS 18 KB / images 296 KB؛ Category desktop JS 77 KB / CSS 18 KB / images 972 KB؛ Product mobile JS 34 KB / CSS 22 KB / images 103 KB؛ Cart mobile JS 331 KB / CSS 18 KB / images 174 KB.

## Cold cache vs warm cache (Mobile, persistent browser profile)

| Page | Mode | Perf | FCP | LCP | TBT | TTFB | Requests | Transfer |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Homepage | Cold | 82 | 1617 | 1617 | 684 | 93 | 441* | 39 KB |
| Homepage | Warm | 80 | 1633 | 1645 | 784 | 54 | 431* | 34 KB |
| Category | Cold | 89 | 2222 | 2446 | 304 | 110 | 22 | 403 KB |
| Category | Warm | 84 | 1715 | 1756 | 583 | 53 | 20 | 142 KB |
| Product | Cold | 95 | 1738 | 2145 | 167 | 744 | 16 | 164 KB |
| Product | Warm | 99 | 1692 | 1692 | 0 | 754 | 12 | 7 KB |

الاستنتاج: Product/Category يستفيدان بوضوح من cache في bytes وLCP، لكن الموقع لا يعتمد على cache لإخفاء Server TTFB؛ TTFB المنتج بقي ~0.75s دافئًا. Homepage لا يتحسن فعليًا بسبب حلقة الـ404 والـmain-thread work.

# TOP BOTTLENECKS

### P0 — حلقة طلبات 404 لصورة thumbnail على Homepage

- الدليل: 2240 طلبًا لنفس `assets/thumbnails/480/custom-...webp` في تشغيل واحد؛ console يسجل 404 متكررًا. توجد أيضًا 404 لـ`hero-papa-kyrillos-products-mobile.webp`.
- الصفحة: Homepage (ويحتمل أي مكان يستخدم نفس fallback handler).
- السبب المرجح: `img.onerror` يعيد تعيين المصدر إلى URL مفقود/نفس المصدر، فينشئ retry loop.
- Estimated impact: ضغط غير ضروري على browser/Cloudflare، ضوضاء console، استهلاك CPU واتصالات، وعدم استقرار نتائج الأداء.
- الإصلاح المقترح: اجعل fallback أحادي المحاولة (`onerror=null` قبل استبدال src)، أصلح manifest/thumbnail، وأضف placeholder نهائي موجود.
- Risk of fix: منخفض إذا حُصر في image fallback؛ متوسط إن كان manifest مولّدًا من pipeline.

### P1 — Checkout mobile بطيء

- الدليل: median Performance 57، FCP 4.4s، LCP 6.16s، TBT 261ms. Long tasks: 905ms unattributable، 300/210ms من Google API، 283ms من `checkout-flow.min.js`. Main thread: 1.19s script evaluation + 366ms parse/compile.
- الصفحة: `/checkout` mobile.
- السبب المرجح: Firebase Auth/Firestore + Google iframe/API مبكرًا، ثم checkout bundle والعمل غير الضروري قبل interaction.
- Estimated impact: تأخير كبير عند أهم خطوة تحويل، وخطر ارتداد المستخدم.
- الإصلاح المقترح: lazy-load Firebase/Auth بعد intent أو idle، فصل checkout core عن login/account sync، defer Google iframe، وتقليل initialization.
- Risk of fix: متوسط/عالٍ بسبب حساسية السلة والدفع؛ يلزم regression suite كاملة.

### P1 — CLS شديد على Category desktop

- الدليل: CLS median 0.887؛ Lighthouse ينسب 0.886 إلى `section#catalog`. Forced reflow 123.7ms من `script.min.js` قرب column 210155.
- الصفحة: `/category/altar-vessels/censers#catalog` desktop.
- السبب المرجح: استبدال skeleton/قائمة المنتجات أو نقل catalog بعد وصول البيانات دون حجز ارتفاع ثابت.
- Estimated impact: قفزة بصرية كبيرة، أخطاء click، Core Web Vitals سيئ رغم LCP سريع.
- الإصلاح المقترح: reserve layout space، ثبّت hero/catalog positions، استخدم skeleton بنفس الأبعاد، وتجنب القراءة/الكتابة المتداخلة للـlayout.
- Risk of fix: متوسط.

### P1 — تذبذب حفظ السلة عبر التنقل/التحديث

- الدليل: بعد toast “تمت إضافة المنتج إلى السلة” ظهرت `/cart` فارغة في أول انتقال، ثم ظهر عنصر بعد تحميلات لاحقة؛ responsive sweep أظهر count يتغير 2→1→0/1 بين الصفحات قبل أن تستقر. تم حذف آخر عنصر اختبار وتأكيد السلة فارغة.
- الصفحات: Homepage، Cart، Checkout.
- السبب المرجح: race بين guest cart وFirebase/account cart و`activeCartStorageKey`، أو كتابة local storage متأخرة/إعادة تحميل cart record قديم.
- Estimated impact: فقدان ثقة/مبيعات إذا ظن المستخدم أن المنتج اختفى.
- الإصلاح المقترح: write-through synchronous local cart قبل toast/navigation، ثم merge server asynchronously مع timestamp/version واضح؛ اختبارات E2E للانتقال الفوري وrefresh/back/forward.
- Risk of fix: عالٍ نسبيًا لأن cart sync حساس.

### P2 — سياسة cache غير مثالية للـversioned CSS/JS وAPI catalog

- الدليل: `script.min.js?v=hash` و`styles.min.css?v=hash` يرجعان `no-cache, must-revalidate` رغم versioning. Images: 30 يوم + SWR. `/api/catalog`: CDN 600s + SWR 300s؛ `products.json`: 60s + SWR 300s.
- السبب المرجح: headers عامة أو route policy لا تفرق بين immutable assets والبيانات الديناميكية.
- Estimated impact: revalidation زائد للأصول؛ واحتمال stale catalog حتى 15 دقيقة في edge/SWR.
- الإصلاح المقترح: hashed assets `public,max-age=31536000,immutable`; catalog بمدة أقصر أو purge/version عند تغير السعر/المخزون.
- Risk of fix: منخفض للأصول؛ متوسط/عالٍ للـcatalog.

### P2 — الصور/التحميل الشبكي

- الدليل: Category desktop ~972 KB images؛ أكبر الموارد: logo JPEG 174 KB، hero 179 KB، product images 127/122/106/100/62 KB. يتم تحميل logo JPEG وWebP معًا في بعض الصفحات.
- الإصلاح المقترح: إزالة duplicate logo preload/source، ضبط `srcset/sizes`، thumbnail 480/640 حقيقية، lazy-load تحت fold، وعدم إضافة timestamp query لكل صورة إذا كانت content-addressed.
- Risk: منخفض/متوسط.

### P2 — Best Practices ثابت 77 وconsole errors

- الدليل: كل الصفحات 77؛ Lighthouse يسجل failed resources و3 deprecated API warnings. Cloudflare beacon فشل DNS داخل بيئة القياس (قد يكون بيئيًا)، بينما صور الموقع 404 حقيقية.
- الإصلاح المقترح: معالجة 404 أولًا، ثم تحديد deprecations من trace. لا تعتبر Cloudflare beacon وحده عطلًا مؤكدًا للمستخدمين.
- Risk: منخفض.

### P2 — SEO Category وSchemas ناقصة

- الدليل: Category SEO 92 بسبب canonical؛ عينة Product بها canonical وOG/Twitter وProduct/Offer schema، لكنها بلا BreadcrumbList/Organization. Sitemap وrobots يعيدان 200.
- الإصلاح المقترح: canonical كامل لكل category/subcategory، BreadcrumbList للمنتج، Organization مرة عامة، والتحقق من duplicate titles.
- Risk: منخفض.

### P2 — Accessibility على Product mobile

- الدليل: contrast 2.71:1 (`#c69245` على `#fffdf7`) مقابل المطلوب 4.5:1؛ رابط السلة نصه المرئي لا يطابق accessible name.
- الإصلاح المقترح: لون أغمق، وaria-label يتضمن النص المرئي/العدد. Quick View يدعم ESC واسترجاع focus URL behavior بصورة صحيحة في الاختبار.
- Risk: منخفض.

### P3 — Security headers إضافية

- الموجود: HTTPS، HSTS، `nosniff`، `strict-origin-when-cross-origin`، gzip. لا mixed content ظاهر.
- المفقود في العينات: CSP وPermissions-Policy. لم يظهر secret خاص واضح؛ Firebase public config ليس secret بحد ذاته. Analytics masking موجود في الكود قبل Clarity، لكن يلزم تحقق دوري من payloads.
- Risk: متوسط عند إدخال CSP؛ ابدأ Report-Only.

## Network — أكبر 20 موردًا ممثلًا

1. Original logo JPEG — 174 KB
2. Hero product image — 179 KB (Category desktop)
3. Product gallery image — 127 KB
4. Product gallery image — 122 KB
5. Firebase Firestore — 110.5 KB
6. Product gallery image — 106 KB
7. Product gallery image — 100 KB
8. Firebase auth iframe — 92.5 KB
9. Product gallery image — 62 KB
10. `script.min.js` — 57 KB transferred (~221 KB raw local bundle)
11. Optimized logo WebP — 40.7 KB
12. Firebase Auth — 39.1 KB
13. Google API iframe script — 34.5 KB
14. `products.json` — 28.8 KB compressed (~328 KB raw local snapshot)
15. Product thumbnail 640 — 25.9 KB
16. Firebase App — 22.7 KB
17. `product-page.js` — 22.6 KB
18. Product thumbnail 640 — 21.7 KB
19. `styles.min.css` — 17.5 KB transferred (~81 KB raw local file)
20. GE SS font WOFF2 — 12.5 KB

Render blocking غير كبير في الصفحات العامة؛ أكبر مشكلة main-thread في Checkout هي third-party Firebase/Google initialization. لم يظهر GA/Clarity/Sentry كحمل رئيسي في التشغيلات؛ analytics endpoint موجود ويعمل first-party. لا توجد service worker registrations قديمة متوقعة لأن التطبيق يستدعي unregister صراحة.

## Functional / Routing / Responsive results

- Homepage، التنقل، البحث، الأقسام، الفلاتر، sort/reset/show-more: الواجهة متاحة وتعمل؛ لم تظهر رسالة “تعذر تحميل الأقسام”.
- Category route يحافظ على main/subcategory filters. الروابط النسبية للسياسات داخل category ظهرت كـ`/category/altar-vessels/policies.html#...` في accessibility tree؛ يلزم فحص/إصلاح لأنها مرشحة 404 (يجب أن تكون root-relative).
- Product direct URL وrefresh يعرضان Product Details كاملة، لا ProductCard منفردًا.
- `?quickview=<id>` فتح Quick View بعد refresh، وظل modal، ثم ESC أغلقه وأزال query من URL. رابط المشاركة يشير إلى `/products/<slug>`.
- Back/forward والـdirect routes لم يحولا ProductCard إلى صفحة مستقلة.
- Cart quantity/remove/total ظاهر؛ عنصر الاختبار حُذف نهائيًا. لم يُرسل checkout form ولم يُنشأ Order/Paymob transaction.
- Checkout pickup/shipping والحقول المطلوبة ظاهرة responsive؛ لم تُنفذ خطوة confirmation النهائية.
- 360×800، 390×844، 768×1024، 1440×900: لا horizontal scrolling في Homepage/Category/Product/Cart/Checkout. لا layout bug بصري حاسم استدعى screenshot منفصل؛ مشكلة CLS موثقة في Lighthouse trace.

# QUICK WINS

1. أوقف image `onerror` retry loop وأضف fallback موجودًا.
2. انشر الـmobile hero المفقود أو أزل مرجعه.
3. اجعل hashed CSS/JS immutable لسنة.
4. أصلح canonical للـCategory والروابط النسبية للسياسات.
5. حسّن contrast وaccessible name في Product header.
6. لا تحمل Firebase/Google Auth في Checkout إلا عند الحاجة.
7. احجز أبعاد/ارتفاع catalog قبل وصول البيانات لمنع CLS.

# DO NOT TOUCH

- Paymob/order creation/webhooks أو Bosta integration قبل وجود staging واختبارات idempotency.
- منطق أسعار/مخزون `/api/catalog` أو TTL الخاص به دون purge/version strategy واختبار stale-data.
- Cart account merge/Firebase sync بتعديل واسع دفعة واحدة؛ عالجه باختبارات E2E أولًا.
- Cloudflare HTML cache rules العامة دون التأكد من عدم تقديم HTML قديم. HTML حاليًا `no-cache, must-revalidate` مع CF HIT، ولا يوجد دليل مباشر على mismatch.
- Product structured data الحالي الذي يجتاز SEO؛ أضف schemas الناقصة دون استبدال Product/Offer العامل.

# Recommended Optimization Plan

1. Hotfix image loop + missing assets، ثم إعادة Lighthouse Homepage والتحقق أن requests < 50.
2. تثبيت cart persistence باختبارات: add→cart فورًا، refresh، back/forward، tabs، guest/account merge.
3. إصلاح Category CLS وحجز الأبعاد.
4. Split/lazy-load Checkout Firebase/Google، وقياس mobile حتى LCP ≤2.5s وTBT ≤200ms.
5. ضبط immutable asset caching وcatalog invalidation.
6. SEO/A11y quick wins، ثم CSP Report-Only.
7. إعادة audit كامل 3-run median + field data عندما تتوفر CrUX عينة كافية.

# الخلاصة

- أسرع صفحة: **Cart desktop** حسب LCP/FCP ≈ 510ms (ومن صفحات المحتوى: Yota desktop LCP ≈ 512ms).
- أبطأ صفحة: **Checkout mobile**، LCP median ≈ 6.16s.
- أكبر bottleneck حاليًا: **حلقة 404 للصورة على Homepage** من حيث السلوك الشبكي، و**Firebase/Google + checkout initialization** من حيث conversion performance.
- التشخيص العام: **خليط من Images/JavaScript/Third-party scripts وrace في Cart/API caching**؛ Server/Cloudflare ليسا السبب الرئيسي، رغم أن TTFB صفحات المنتج ~0.4–0.8s ويمكن تحسينه.

