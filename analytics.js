(function () {
  "use strict";

  const config = window.POPE_KYRILLOS_ANALYTICS_CONFIG || {};
  const endpoint = "/api/analytics/events";
  const allowedEvents = new Set([
    "page_view", "view_category", "view_product", "search", "add_to_cart", "remove_from_cart",
    "view_cart", "begin_checkout", "select_delivery", "select_payment_method", "place_order",
    "order_success", "order_failed", "open_whatsapp", "click_phone", "click_facebook", "click_instagram",
    "javascript_error", "api_error", "checkout_error"
  ]);
  const piiKeyPattern = /(name|phone|mobile|email|address|customer|payment|card|authorization|token|secret|password|notes|body|payload)/i;
  const analyticsState = { ready: false, queue: [], pageViewSent: false };

  function configured(value, placeholder) {
    return Boolean(value && value !== placeholder && !/^(G-X+|CLARITY_|SENTRY_)/.test(value));
  }

  function cleanText(value, max = 160) {
    return String(value == null ? "" : value)
      .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
      .replace(/(?:\+?20)?01\d{9}/g, "[phone]")
      .replace(/\b\d{12,19}\b/g, "[number]")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, max);
  }

  function cleanPage(value = window.location.pathname) {
    try {
      const url = new URL(value, window.location.origin);
      return (url.pathname || "/").slice(0, 180);
    } catch {
      return cleanText(String(value).split(/[?#]/)[0] || "/", 180);
    }
  }

  function cleanIdentifier(value, max = 100) {
    return String(value == null ? "" : value).trim().replace(/[^A-Za-z0-9._:-]/g, "").slice(0, max);
  }

  function trafficSource() {
    const params = new URLSearchParams(window.location.search);
    const campaign = cleanText(params.get("utm_source") || "", 40).toLowerCase();
    const referrer = String(document.referrer || "").toLowerCase();
    const value = `${campaign} ${referrer}`;
    if (/google/.test(value)) return "Google";
    if (/facebook|fb\.com|fbclid/.test(value)) return "Facebook";
    if (/whatsapp|wa\.me/.test(value)) return "WhatsApp";
    if (/instagram|ig\.me/.test(value)) return "Instagram";
    if (!campaign && (!referrer || referrer.includes(window.location.hostname))) return "Direct";
    return cleanText(campaign || "Other", 40) || "Other";
  }

  function visitorId() {
    const key = "pk_analytics_visitor";
    try {
      let value = localStorage.getItem(key);
      if (!value) {
        value = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, value);
      }
      return value;
    } catch {
      return window.crypto?.randomUUID?.() || `session-${Date.now()}`;
    }
  }

  function deviceType() {
    const width = window.innerWidth || 0;
    if (width < 768) return "Mobile";
    if (width < 1100) return "Tablet";
    return "Desktop";
  }

  function browserName() {
    const ua = navigator.userAgent || "";
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Other";
  }

  function sanitizePayload(name, input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const number = (value) => value == null || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
    return {
      event: allowedEvents.has(name) ? name : "",
      eventId: cleanIdentifier(source.eventId, 100),
      visitorId: visitorId(),
      page: cleanPage(source.page),
      productId: cleanIdentifier(source.productId, 100),
      productName: cleanText(source.productName, 160),
      category: cleanText(source.category, 100),
      price: number(source.price),
      quantity: number(source.quantity),
      currency: /^[A-Z]{3}$/.test(String(source.currency || "EGP")) ? String(source.currency || "EGP") : "EGP",
      source: cleanText(source.source || trafficSource(), 40),
      searchTerm: name === "search" ? cleanText(source.searchTerm || source.query, 80) : "",
      device: deviceType(),
      browser: browserName(),
      errorType: cleanText(source.errorType, 40),
      errorMessage: cleanText(source.errorMessage, 500),
      statusCode: number(source.statusCode)
    };
  }

  function gaPayload(payload) {
    const item = payload.productId || payload.productName ? {
      item_id: payload.productId,
      item_name: payload.productName,
      item_category: payload.category,
      price: payload.price,
      quantity: payload.quantity || 1
    } : null;
    return {
      page: payload.page,
      productId: payload.productId,
      productName: payload.productName,
      category: payload.category,
      price: payload.price,
      quantity: payload.quantity,
      currency: payload.currency,
      source: payload.source,
      search_term: payload.searchTerm || undefined,
      value: payload.price == null ? undefined : payload.price * (payload.quantity || 1),
      items: item ? [item] : undefined,
      send_to: config.ga4MeasurementId
    };
  }

  function sendFirstParty(payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
    window.fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  }

  function track(name, input = {}) {
    const payload = sanitizePayload(name, input);
    if (!payload.event) return;
    sendFirstParty(payload);
    if (typeof window.gtag === "function" && configured(config.ga4MeasurementId, "G-XXXXXXXXXX")) {
      window.gtag("event", name, gaPayload(payload));
    }
    if (typeof window.clarity === "function" && !name.endsWith("_error")) {
      window.clarity("event", name);
    }
  }

  function sanitizeSentryObject(value, depth = 0) {
    if (depth > 5 || value == null) return value;
    if (typeof value === "string") return cleanText(value, 500);
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeSentryObject(item, depth + 1));
    if (typeof value !== "object") return value;
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (piiKeyPattern.test(key)) return;
      output[key] = sanitizeSentryObject(item, depth + 1);
    });
    return output;
  }

  function loadScript(src, attributes = {}) {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
    document.head.appendChild(script);
    return script;
  }

  function initGa4() {
    if (!configured(config.ga4MeasurementId, "G-XXXXXXXXXX")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", config.ga4MeasurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: "SameSite=Lax;Secure"
    });
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4MeasurementId)}`);
  }

  function initClarity() {
    if (!configured(config.clarityProjectId, "CLARITY_PROJECT_ID")) return;
    document.querySelectorAll("form, [data-checkout-form], [data-payment-page], .order-details, .admin-layout, .orders-dashboard")
      .forEach((node) => node.setAttribute("data-clarity-mask", "true"));
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    loadScript(`https://www.clarity.ms/tag/${encodeURIComponent(config.clarityProjectId)}`);
  }

  function initSentry() {
    if (!configured(config.sentryDsn, "SENTRY_DSN")) return;
    const loader = loadScript("https://browser.sentry-cdn.com/8.47.0/bundle.tracing.min.js", { crossorigin: "anonymous" });
    loader.addEventListener("load", () => {
      if (!window.Sentry) return;
      window.Sentry.init({
        dsn: config.sentryDsn,
        environment: cleanText(config.sentryEnvironment || "production", 40),
        sendDefaultPii: false,
        tracesSampleRate: Math.min(1, Math.max(0, Number(config.sentryTracesSampleRate) || 0.1)),
        beforeSend(event) {
          const sanitized = sanitizeSentryObject(event);
          if (sanitized.request) {
            sanitized.request.url = cleanPage(sanitized.request.url);
            delete sanitized.request.headers;
            delete sanitized.request.cookies;
            delete sanitized.request.data;
          }
          delete sanitized.user;
          return sanitized;
        },
        beforeSendTransaction(event) {
          const sanitized = sanitizeSentryObject(event);
          if (sanitized.transaction) sanitized.transaction = cleanPage(sanitized.transaction);
          return sanitized;
        }
      });
    });
  }

  function installErrorTracking() {
    window.addEventListener("error", (event) => {
      track("javascript_error", { errorType: "javascript", errorMessage: event.message || "JavaScript error" });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "Unhandled promise rejection");
      track("javascript_error", { errorType: "promise", errorMessage: reason });
    });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function analyticsFetch(input, init) {
      const requestUrl = typeof input === "string" ? input : input?.url || "";
      try {
        const response = await nativeFetch(input, init);
        if (!response.ok && !String(requestUrl).includes(endpoint)) {
          const message = `${cleanPage(requestUrl)} returned HTTP ${response.status}`;
          track("api_error", { errorType: "http", errorMessage: message, statusCode: response.status });
          window.Sentry?.captureMessage?.(message, "error");
        }
        return response;
      } catch (error) {
        if (!String(requestUrl).includes(endpoint)) {
          track("api_error", { errorType: "network", errorMessage: `${cleanPage(requestUrl)}: ${error?.message || "Network error"}` });
          window.Sentry?.captureException?.(error);
        }
        throw error;
      }
    };
  }

  function installClickTracking() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const href = String(link.getAttribute("href") || "").toLowerCase();
      if (/wa\.me|whatsapp/.test(href)) track("open_whatsapp");
      else if (href.startsWith("tel:")) track("click_phone");
      else if (/facebook\.com|fb\.com/.test(href)) track("click_facebook");
      else if (/instagram\.com|ig\.me/.test(href)) track("click_instagram");
    }, { capture: true });
  }

  window.StoreAnalytics = Object.freeze({ track, cleanPage });
  initGa4();
  initClarity();
  initSentry();
  installErrorTracking();
  installClickTracking();
  track("page_view");
  if (/^\/payment-success\/?$/.test(window.location.pathname)) track("order_success");
  if (/^\/payment-failed\/?$/.test(window.location.pathname)) track("order_failed", { errorType: "checkout", errorMessage: "Payment failed page" });
}());
