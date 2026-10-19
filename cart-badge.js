// Cart badge for pages that load no cart code (e.g. policies.html). It picks the
// saved cart the same way as script.js and checkout-flow.js (the newest of the
// signed-in account cart, the active cart and the guest cart) and counts it with
// the shared rule: the sum of every line's whole, positive quantity.
(() => {
  const guestKey = "pope-kyrillos-cart:guest";
  const userPrefix = "pope-kyrillos-cart:user:";
  const activeKey = "pope-kyrillos-cart:active";

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      return { items, updatedAt: Date.parse(data.updatedAt || "") || 0 };
    } catch {
      return null;
    }
  }

  // A customer may be signed in on this device (this page cannot confirm it).
  function hasSessionHint() {
    try {
      if (JSON.parse(localStorage.getItem("pope-kyrillos-auth:user") || "null")?.uid) return true;
      for (let index = 0; index < localStorage.length; index += 1) {
        if ((localStorage.key(index) || "").startsWith("firebase:authUser:")) return true;
      }
    } catch {
      // Storage can be unavailable in private browsing.
    }
    return false;
  }

  // Never an account cart on this page: only the guest cart (what was added on this
  // device without a confirmed session).
  function savedCartItems() {
    return read(guestKey)?.items || [];
  }

  function update() {
    const count = savedCartItems().reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item?.qty) || 0)), 0);
    const text = hasSessionHint() && !count ? "" : new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-US" : "ar-EG").format(count);
    document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = text; });
  }

  update();
  window.addEventListener("storage", update);
  window.addEventListener("pageshow", (event) => { if (event.persisted) update(); });
})();
