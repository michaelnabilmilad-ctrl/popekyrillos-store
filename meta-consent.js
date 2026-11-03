// Marketing consent + Meta Conversions API events (browser side).
// No Meta script is loaded and no request goes to Meta from the browser: events go to
// the site's own /api/meta-events, only after the visitor accepted marketing cookies.
// The browser never sends product names or ids, search terms, page URLs or customer data.
// DRAFT TEXTS: the banner wording below is pending Michael's review (not final).
(function () {
  "use strict";
  if (window.PKMetaConsent) return;

  const CONSENT_COOKIE = "pk_mkt_consent";
  const ENDPOINT = "/api/meta-events";
  const SENT_PURCHASES_KEY = "pk_meta_purchases";
  const CHECKOUT_KEY = "pk_meta_checkout";
  const CONSENT_DAYS = 180;
  const FBC_DAYS = 90;
  const SEARCH_IDLE_MS = 1500;
  const isEnglish = (document.documentElement.lang || "").toLowerCase().startsWith("en");

  const TEXT = isEnglish ? {
    body: "Only if you accept, our server sends Meta (Facebook and Instagram) limited events to measure our ads: page visits, product views, searches (without the search words), add to cart, checkout start and order placed, with the amount in EGP, the number of items, your browser type and the ad click identifier if you came from an ad. We never send your name, phone, email, address, product names or search words, and no Meta software is loaded on your device.",
    accept: "Accept",
    reject: "Reject",
    more: "Details in our privacy policy"
  } : {
    body: "بعد موافقتك فقط، يرسل خادم موقعنا إلى Meta (فيسبوك وإنستجرام) أحداثًا محدودة لقياس نتائج إعلاناتنا: زيارة الصفحات، عرض منتج، البحث (بدون كلمة البحث)، الإضافة للسلة، بدء إتمام الطلب، وتسجيل الطلب، مع قيمة المبلغ بالجنيه وعدد القطع ونوع المتصفح ومعرّف النقر على الإعلان إن وصلت من إعلان. لا نرسل اسمك أو رقم هاتفك أو بريدك أو عنوانك أو أسماء المنتجات أو كلمات البحث، ولا يتم تحميل أي برنامج من Meta على جهازك.",
    accept: "موافق",
    reject: "رفض",
    more: "التفاصيل في سياسة الخصوصية"
  };

  function readCookie(name) {
    return document.cookie.split(";").map((part) => part.trim()).reduce((found, part) => {
      const index = part.indexOf("=");
      return !found && index > 0 && part.slice(0, index) === name ? decodeURIComponent(part.slice(index + 1)) : found;
    }, "");
  }

  function writeCookie(name, value, days) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${Math.round(days * 86400)}; Path=/; SameSite=Lax${secure}`;
  }

  function deleteCookie(name) {
    const host = window.location.hostname;
    const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
    domains.forEach((domain) => {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    });
  }

  function safeStorage(kind) {
    try { return window[kind]; } catch { return null; }
  }

  function consentState() {
    const value = readCookie(CONSENT_COOKIE);
    return value === "granted" || value === "denied" ? value : "";
  }

  const granted = () => consentState() === "granted";

  // fbclid is kept in memory only; it becomes the _fbc cookie only after consent.
  const landingFbclid = (() => {
    try {
      const value = new URLSearchParams(window.location.search).get("fbclid") || "";
      return /^[A-Za-z0-9_-]{10,500}$/.test(value) ? value : "";
    } catch { return ""; }
  })();

  function storeClickId() {
    if (!landingFbclid || !granted()) return;
    const current = readCookie("_fbc");
    if (current && current.endsWith(`.${landingFbclid}`)) return;
    writeCookie("_fbc", `fb.1.${Date.now()}.${landingFbclid}`, FBC_DAYS);
  }

  function send(body) {
    if (!granted()) return;
    try {
      window.fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, consent: true })
      }).catch(() => {});
    } catch {}
  }

  function money(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  }

  function wholeQuantity(value) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 1 ? Math.min(number, 200) : 1;
  }

  // PageView: once per real page (pathname). Query/hash changes (filters, search, scroll
  // state) are not new pages.
  let lastPath = "";
  function pageView() {
    const path = window.location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    send({ event: "PageView" });
  }

  function viewContentFromPage() {
    const node = document.getElementById("product-data");
    if (!node) return;
    try {
      const product = JSON.parse(node.textContent || "{}");
      const variant = Array.isArray(product.variants) && product.variants.length ? product.variants[0] : null;
      const value = money(variant?.price ?? product.price);
      if (value !== null) send({ event: "ViewContent", value });
    } catch {}
  }

  const searchedTerms = new Set();
  let searchTimer = 0;
  let pendingTerm = "";
  function searchEvent(term) {
    pendingTerm = String(term || "").trim().toLowerCase();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      // The term never leaves this page: it only stops repeats of the same search.
      if (pendingTerm.length < 2 || searchedTerms.has(pendingTerm)) return;
      searchedTerms.add(pendingTerm);
      send({ event: "Search" });
    }, SEARCH_IDLE_MS);
  }

  function initiateCheckout(input) {
    const value = money(input?.price);
    if (value === null || value <= 0) return;
    const numItems = wholeQuantity(input?.quantity);
    const fingerprint = `${value}|${numItems}`;
    const session = safeStorage("sessionStorage");
    try { if (session?.getItem(CHECKOUT_KEY) === fingerprint) return; } catch {}
    try { session?.setItem(CHECKOUT_KEY, fingerprint); } catch {}
    send({ event: "InitiateCheckout", value, numItems });
  }

  // Receives the site's existing analytics events (analytics.js) and product-page adds.
  function onStoreEvent(name, input = {}) {
    if (!granted()) return;
    if (name === "view_product") {
      const value = money(input.price);
      if (value !== null) send({ event: "ViewContent", value });
    } else if (name === "add_to_cart") {
      const numItems = wholeQuantity(input.quantity);
      const unit = money(input.price);
      if (unit !== null) send({ event: "AddToCart", value: Math.round(unit * numItems * 100) / 100, numItems });
    } else if (name === "search") {
      searchEvent(input.searchTerm);
    } else if (name === "begin_checkout") {
      initiateCheckout(input);
    }
  }

  async function shortHash(text) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Purchase: only on the confirmation page, with the order's private token from the
  // URL hash. The server checks the order really exists, takes the value from the stored
  // order and sends each order once. This local list only avoids needless repeats.
  async function purchaseFromConfirmation() {
    if (!/^\/order-success\/?$/.test(window.location.pathname) || !granted()) return;
    const token = String(window.location.hash || "").replace(/^#/, "");
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const local = safeStorage("localStorage");
    let sent = [];
    try { sent = JSON.parse(local?.getItem(SENT_PURCHASES_KEY) || "[]"); } catch {}
    if (!Array.isArray(sent)) sent = [];
    let key = "";
    try { key = await shortHash(`purchase:${token}`); } catch { return; }
    if (sent.includes(key)) return;
    send({ event: "Purchase", token });
    try { local?.setItem(SENT_PURCHASES_KEY, JSON.stringify([...sent, key].slice(-20))); } catch {}
  }

  function startTracking() {
    storeClickId();
    pageView();
    viewContentFromPage();
    void purchaseFromConfirmation();
  }

  function clearMarketingData() {
    deleteCookie("_fbc");
    deleteCookie("_fbp");
    try { safeStorage("localStorage")?.removeItem(SENT_PURCHASES_KEY); } catch {}
    try { safeStorage("sessionStorage")?.removeItem(CHECKOUT_KEY); } catch {}
    window.clearTimeout(searchTimer);
    searchedTerms.clear();
  }

  function decide(choice) {
    writeCookie(CONSENT_COOKIE, choice, CONSENT_DAYS);
    hideBanner();
    if (choice === "granted") startTracking();
    else clearMarketingData();
  }

  let banner = null;
  function hideBanner() {
    banner?.remove();
    banner = null;
  }

  function showBanner() {
    if (banner || !document.body) return;
    if (!document.getElementById("pk-consent-style")) {
      const style = document.createElement("style");
      style.id = "pk-consent-style";
      style.textContent = ".pk-consent{position:fixed;inset:auto 12px 12px 12px;z-index:2147483000;max-width:640px;margin:0 auto;background:#fff;color:#222;border:1px solid #d9cfc0;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:14px 16px;font:14px/1.6 inherit}.pk-consent p{margin:0 0 10px}.pk-consent-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pk-consent button{flex:1 1 120px;min-height:42px;border-radius:8px;border:1px solid #7a5a2b;font:inherit;font-weight:700;cursor:pointer;background:#fff;color:#5a3f17}.pk-consent button[data-consent=granted]{background:#7a5a2b;color:#fff}.pk-consent a{color:#5a3f17;flex:1 1 100%;text-align:center}";
      document.head.appendChild(style);
    }
    banner = document.createElement("div");
    banner.className = "pk-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", isEnglish ? "Cookie settings" : "إعدادات الكوكيز");
    banner.dir = isEnglish ? "ltr" : "rtl";
    const text = document.createElement("p");
    text.textContent = TEXT.body;
    const actions = document.createElement("div");
    actions.className = "pk-consent-actions";
    [["granted", TEXT.accept], ["denied", TEXT.reject]].forEach(([choice, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.consent = choice;
      button.textContent = label;
      button.addEventListener("click", () => decide(choice));
      actions.appendChild(button);
    });
    const link = document.createElement("a");
    link.href = "/policies.html#analytics-policy";
    link.textContent = TEXT.more;
    actions.appendChild(link);
    banner.append(text, actions);
    document.body.appendChild(banner);
  }

  function watchNavigation() {
    ["pushState", "replaceState"].forEach((method) => {
      const original = window.history[method];
      if (typeof original !== "function") return;
      window.history[method] = function patchedHistory(...args) {
        const result = original.apply(this, args);
        try { if (granted()) pageView(); } catch {}
        return result;
      };
    });
    window.addEventListener("popstate", () => { if (granted()) pageView(); });
  }

  window.PKMetaConsent = Object.freeze({
    onStoreEvent,
    openSettings: showBanner,
    revoke: () => decide("denied"),
    state: consentState
  });

  watchNavigation();
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-cookie-settings]");
    if (!trigger) return;
    event.preventDefault();
    showBanner();
  });

  const init = () => {
    const state = consentState();
    if (state === "granted") startTracking();
    else if (!state && !/^\/(admin|track-order|order\/)/.test(window.location.pathname)) showBanner();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}());
