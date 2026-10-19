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

  function savedCartItems() {
    let uid = "";
    let active = "";
    try {
      // Account cart only when the last Firebase-confirmed profile and Firebase's own
      // session record name the same uid (same rule as product-page.js).
      const confirmed = JSON.parse(localStorage.getItem("pope-kyrillos-auth:user") || "null");
      const recentlyConfirmed = Number(confirmed?.confirmedAt) > Date.now() - 14 * 24 * 60 * 60 * 1000;
      const confirmedUid = recentlyConfirmed ? String(confirmed?.uid || "") : "";
      let sessionUid = "";
      for (let index = 0; !sessionUid && index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        if (key.startsWith("firebase:authUser:")) sessionUid = String(JSON.parse(localStorage.getItem(key) || "null")?.uid || "");
      }
      uid = confirmedUid && confirmedUid === sessionUid ? confirmedUid : "";
      active = localStorage.getItem(activeKey) || "";
    } catch {
      // Storage can be unavailable in private browsing.
    }
    const userKey = uid ? `${userPrefix}${uid}` : "";
    const keys = [userKey, active === guestKey || (userKey && active === userKey) ? active : "", guestKey];
    const records = [...new Set(keys.filter(Boolean))].map(read).filter(Boolean);
    records.sort((a, b) => b.updatedAt - a.updatedAt);
    return records[0]?.items || [];
  }

  function update() {
    const count = savedCartItems().reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item?.qty) || 0)), 0);
    const text = new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-US" : "ar-EG").format(count);
    document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = text; });
  }

  update();
  window.addEventListener("storage", update);
  window.addEventListener("pageshow", (event) => { if (event.persisted) update(); });
})();
