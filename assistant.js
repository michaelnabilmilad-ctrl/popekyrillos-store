(() => {
  "use strict";
  let config, panel, launcher, log, form, input, status, send, widgetId, turnstileToken = "", conversationToken = "", busy = false;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  function url(value, external = false) {
    try {
      const result = new URL(value, location.origin);
      return [location.origin, ...(external ? ["https://popekyrillos.store"] : [])].includes(result.origin) && ["http:", "https:"].includes(result.protocol) && !result.username && !result.password ? result.href : "";
    } catch { return ""; }
  }
  function addMessage(text, role) {
    const node = element("div", `pk-assistant-message pk-assistant-${role}`);
    node.append(element("strong", "pk-assistant-speaker", role === "user" ? "أنت" : "مساعد المكتبة"), element("p", "", text));
    log.append(node); log.scrollTop = log.scrollHeight;
    return node;
  }
  function setStatus(text) { status.textContent = text; }
  function ready() { send.disabled = busy || !turnstileToken; }
  function close() { panel.hidden = true; launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
  function resetVerification() {
    turnstileToken = "";
    if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
    ready();
  }
  let verificationLoading;
  async function loadVerification() {
    if (verificationLoading) return verificationLoading;
    verificationLoading = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = element("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    }).then(() => {
      widgetId = window.turnstile.render(panel.querySelector(".pk-assistant-verification"), {
        sitekey: config.siteKey, action: "library-assistant", theme: "light", size: "flexible",
        callback(token) { turnstileToken = token; ready(); if (!busy) setStatus(""); },
        "expired-callback"() { turnstileToken = ""; ready(); setStatus("أكمل التحقق لإرسال سؤالك."); },
        "error-callback"() { turnstileToken = ""; ready(); setStatus("تعذر التحقق. أغلق المساعد وافتحه للمحاولة مجددًا."); return true; }
      });
    }).catch(() => { verificationLoading = null; setStatus("تعذر تحميل التحقق. تقدر تتواصل مع المكتبة من الرابط بالأسفل."); });
    return verificationLoading;
  }
  function productCard(product) {
    const href = url(product.url, true);
    if (!href) return null;
    const card = element("a", "pk-assistant-card"); card.href = href;
    const image = url(product.image, true);
    if (image) { const img = element("img"); img.src = image; img.alt = ""; img.loading = "lazy"; img.width = 68; img.height = 68; card.append(img); }
    const copy = element("div"); copy.append(element("strong", "", product.name));
    const price = typeof product.price === "number" && Number.isFinite(product.price) ? `${product.priceFrom ? "يبدأ من " : ""}${new Intl.NumberFormat("ar-EG").format(product.price)} ج.م` : "السعر يحتاج تأكيد";
    copy.append(element("span", "pk-assistant-price", price));
    copy.append(element("small", "", product.availability === "available" ? "متاح حسب الكتالوج" : product.availability === "unavailable" ? "غير متاح حاليًا" : "التوافر يحتاج تأكيد"));
    card.append(copy); return card;
  }
  async function submit(event) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy || !turnstileToken) return;
    busy = true; ready(); input.disabled = true; form.setAttribute("aria-busy", "true");
    addMessage(message, "user"); setStatus("براجع سؤالك…");
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(50000),
        body: JSON.stringify({ message, turnstileToken, conversationToken })
      });
      const data = await response.json();
      if (!response.ok) { if (response.status === 400 && conversationToken) conversationToken = ""; throw new Error(data.message || "تعذر الرد حاليًا."); }
      if (typeof data.reply !== "string") throw new Error("تعذر الرد حاليًا.");
      conversationToken = data.conversationToken || "";
      const node = addMessage(data.reply, "assistant");
      const cards = element("div", "pk-assistant-cards");
      for (const product of (Array.isArray(data.products) ? data.products.slice(0, 6) : [])) { const card = productCard(product); if (card) cards.append(card); }
      node.append(cards);
      for (const link of (Array.isArray(data.links) ? data.links : [])) {
        const href = url(link.url, true); if (!href) continue;
        const a = element("a", "pk-assistant-link", link.label); a.href = href; node.append(a);
      }
      input.value = ""; setStatus(""); log.scrollTop = log.scrollHeight;
    } catch (error) { setStatus(error.name === "TimeoutError" ? "الرد أخد وقت طويل. حاول تاني أو تواصل مع المكتبة." : error.message || "تعذر الاتصال. حاول تاني."); }
    finally { busy = false; input.disabled = false; form.setAttribute("aria-busy", "false"); resetVerification(); if (!panel.hidden) input.focus(); }
  }
  function build() {
    const css = element("link"); css.rel = "stylesheet"; css.href = "/assistant.css?v=1"; document.head.append(css);
    launcher = element("button", "pk-assistant-launcher", "اسأل مساعد المكتبة"); launcher.type = "button";
    launcher.setAttribute("aria-expanded", "false"); launcher.setAttribute("aria-controls", "pk-assistant-panel");
    panel = element("section", "pk-assistant-panel"); panel.id = "pk-assistant-panel"; panel.dir = "rtl"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "pk-assistant-title");
    const header = element("header", "pk-assistant-header");
    const title = element("h2", "", "مساعد المكتبة"); title.id = "pk-assistant-title";
    const x = element("button", "pk-assistant-close", "×"); x.type = "button"; x.setAttribute("aria-label", "إغلاق المحادثة"); x.addEventListener("click", close);
    header.append(title, x);
    log = element("div", "pk-assistant-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite"); log.setAttribute("aria-relevant", "additions");
    form = element("form", "pk-assistant-form");
    const label = element("label", "", "سؤالك"); label.htmlFor = "pk-assistant-input";
    input = element("textarea"); input.id = "pk-assistant-input"; input.maxLength = 1000; input.rows = 2; input.placeholder = "مثلًا: عايز صليب صدر يوناني";
    send = element("button", "pk-assistant-send", "إرسال"); send.type = "submit"; send.disabled = true;
    status = element("p", "pk-assistant-status"); status.setAttribute("role", "status");
    const verify = element("div", "pk-assistant-verification");
    const help = element("nav", "pk-assistant-help"); help.setAttribute("aria-label", "مساعدة إضافية");
    for (const [text, href] of [["متابعة طلبك", "/track-order"], ["تواصل مع موظف", "/contact"]]) { const a = element("a", "", text); a.href = href; help.append(a); }
    form.append(label, input, send, verify, status); form.addEventListener("submit", submit);
    panel.append(header, log, form, help); document.body.append(launcher, panel);
    addMessage("أهلًا بيك! أنا المساعد الافتراضي للمكتبة. أقدر أساعدك في المنتجات والأسعار وسياسات المتجر. خلي بيانات طلبك الشخصية في صفحة متابعة الطلب.", "assistant");
    launcher.addEventListener("click", () => {
      if (!panel.hidden) return close();
      panel.hidden = false; launcher.setAttribute("aria-expanded", "true"); input.focus();
      if (!busy) {
        setStatus("أكمل التحقق لإرسال سؤالك.");
        if (widgetId !== undefined) resetVerification(); else loadVerification();
      }
    });
    panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); close(); } });
  }
  fetch("/api/assistant/config", { credentials: "same-origin", signal: AbortSignal.timeout(8000) })
    .then(response => response.ok ? response.json() : null)
    .then(data => { if (data?.enabled && data.siteKey) { config = data; build(); } }).catch(() => {});
})();
