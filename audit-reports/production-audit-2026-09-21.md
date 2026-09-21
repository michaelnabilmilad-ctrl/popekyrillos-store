# Pope Kyrillos Store production audit — 2026-09-21

## Scope and safety

- Audited `https://popekyrillos.store`, the storefront source, generated catalog, Cloudflare Worker, checkout/order code, Airtable integration code, sitemap, robots, and automated tests.
- No Airtable record, product, category, image, stock value, or production order was deleted or edited.
- The production browser test stopped before submitting customer data, creating an order, or opening/confirming a Paymob transaction.
- Fixes are implemented in the working tree and build output; they have not been deployed by this audit.

## A. Confirmed bugs

1. Production displayed the hard-coded `+120` metric although the generated catalog contains 115 records and 105 active/published/available storefront products.
2. Production displayed the zero-count `church-equipment` category, and the all-category filter exposed many zero-count subcategories.
3. The customer-facing taxonomy still contained `صلبان مواكب`.
4. `شنطه اتبعه` exists twice upstream with the same name, price, and image:
   - `atb3ho-10618130956453` — available, 120 EGP, no product SKU.
   - `atb3ho-10618127974565` — unavailable, 120 EGP, no product SKU.
   The current production catalog API rendered the available record once, but the data remains duplicated and exact duplicates were not defensively suppressed in every fallback path.
5. Two active product names contain the internal label `نسخة` (see manual approval section).
6. `تريانتو ستانلس` and `دف 18 سم نحاس ذهبي تقيل` are mapped to `المذبح والأواني المقدسة / service-tools`.
7. The pre-change sitemap contained all 115 product records, including ten unavailable records; it had 115 product URLs and only six category URLs.
8. Seven active Yota products shared the stale slug `صليب-يوتا-مادليه-موديل-7`, creating ambiguous canonical routing. The SEO generator now assigns unique stable slugs without changing product IDs.
9. Production category routes only received a canonical URL from the Worker; they did not receive category/subcategory-specific server-rendered titles, descriptions, OG metadata, or empty-route noindex directives.
10. Several secondary product/gallery/cart images used empty alternative text.

## B. Fixes made

- Empty main categories are hidden after authoritative counts load; zero-count subcategories are removed from category cards, navigation, and filters.
- Empty category/subcategory routes use `noindex, follow`; non-empty routes use `index, follow`.
- Sitemap generation now includes only active/published/available products, non-empty main categories, and non-empty subcategories.
- Renamed only the customer-facing taxonomy label to `صلبان الزفة`; retained `processional-crosses` and all product/category IDs.
- Replaced the homepage count with a live total derived from catalog counts.
- Added exact storefront deduplication: SKU when present, otherwise normalized name + price + primary image. No records are deleted.
- Added unique category/subcategory metadata and retained unique Product metadata/JSON-LD with EGP price, availability, image, canonical URL, and SKU/ID.
- Improved product/gallery/cart image alt text.
- Bumped the standalone product script cache key and rebuilt minified/static assets.
- Added a repeatable catalog audit script and regression tests.

Generated sitemap after the fix: 137 unique URLs = 7 static + 105 product + 25 non-empty category/subcategory URLs. Empty main categories are excluded.

## C. Files changed

Primary source:

- `category-taxonomy.js`
- `cloudflare-worker.js`
- `index.html`
- `script.js`
- `product-page.js`
- `scripts/build-taxonomy-v3.mjs`
- `scripts/generate-seo-assets.js`
- `scripts/audit-catalog.mjs` (new)
- `tests/main-category-visibility.test.cjs`
- `tests/catalog-audit-fixes.test.cjs` (new)
- `sitemap.xml`
- `script.min.js`

Generated HTML asset-version references were refreshed in admin, cart, checkout, payment/status, order-success, policy, and coloring pages. `dist/` was rebuilt.

Audit artifacts are in `audit-reports/`, including before/after catalog reports and Lighthouse JSON.

## D. Data issues requiring manual approval

Do not automatically delete or rename these records:

1. Duplicate `شنطه اتبعه`: decide whether the unavailable source record should be archived upstream. Both records lack a product-level SKU, so add stable unique SKUs before future imports.
2. Product-name cleanup:
   - `custom-1782306615168-copy-1782306883366-copy-1782307173548-copy-1782307256776-copy-1782307341493-copy-1782310276272-copy-1782310382795` — `قطمارس الصوم الكبير – عربي– دير الشهيد العظيم مارمينا العجائبي بمريوط - نسخة`
   - `custom-1782306615168` — `قطمارس الأيام السنوي – عربي – نسخة دير الشهيد العظيم مارمينا العجائبي بمريوط`
   The second use of `نسخة` may mean “edition,” so editorial confirmation is required.
3. Category mapping:
   - `old-10121340551475` — `تريانتو ستانلس`
   - `old-10121339568435` — `دف 18 سم نحاس ذهبي تقيل`
   Approve the intended destination category/subcategory before moving them.
4. Source-of-truth mismatch: the customer catalog is loaded from GitHub `products.json` (`products-data` branch) with deployed assets as fallback. Airtable is authoritative for orders/inventory and best-seller/order-detail relationships, not the primary storefront catalog. Any Airtable catalog reconciliation should be planned explicitly.

## E. Lighthouse baseline and preview

| Run | Score | FCP | LCP | CLS | TBT | Notes |
|---|---:|---:|---:|---:|---:|---|
| Production mobile before | 50 | 1.64 s | 4.05 s | 0.406 | 706 ms | Authoritative production baseline |
| Production desktop before | 100 | 0.45 s | 0.67 s | 0 | 32 ms | Authoritative production baseline |
| Local static preview after | 37 | 1.53 s | 8.70 s | 0.405 | 781 ms | Not directly comparable: Worker APIs returned 404, forcing the large `products.json` fallback; some generated image paths were unavailable |
| Local static preview desktop after | 97 | 0.38 s | 1.10 s | 0.00009 | 84 ms | Same preview limitation |

INP is unavailable in Lighthouse lab data. Baseline findings: mobile CLS is poor, about 22.7 KB of unused JS was reported on production, image savings were about 14.4 KB, lazy loading passed, and cache-TTL coverage was partial. No speculative performance optimization was made because a production-equivalent after run requires deployment/preview Worker infrastructure.

## Order-flow regression evidence

- Production UI: product → add to cart → cart → quantity 1→2→1; total recalculated 120→240→120 EGP.
- Production UI: checkout showed the correct product and both pickup and shipping modes; shipping fields appeared correctly.
- Automated tests passed for standalone/cart add behavior, variant/coloring line separation, Airtable detail rows, payment-failure cart preservation, and stock-return idempotency.
- A real Paymob success, Airtable production order creation, stock deduction, and post-success cart clearing were intentionally not executed because that would create a live order/payment and mutate stock.

## F. Remaining risks

- The working tree is not deployed, so production still shows the confirmed pre-change behavior.
- A true end-to-end Paymob success/callback test needs a sandbox/test merchant flow or explicit approval for a controlled live order plus cleanup procedure.
- The broader repository test suite contains unrelated pre-existing failures in taxonomy/coloring fixtures and two customer receipt tests; targeted audit/order regression tests pass, but those failures should be resolved before release.
- Production-equivalent mobile performance needs a Cloudflare preview or deployment; the local static after run is diagnostic only.
- Cloudflare returns `no-cache, must-revalidate` for HTML and `products.json` uses a 60-second browser cache with stale-while-revalidate. This is safe for freshness but should be rechecked after deployment for CDN hit behavior and invalidation timing.
