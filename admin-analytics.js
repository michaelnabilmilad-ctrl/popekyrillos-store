(function () {
  "use strict";

  const refreshButton = document.querySelector("[data-analytics-refresh]");
  const rangeSelect = document.querySelector("[data-analytics-days]");
  const updated = document.querySelector("[data-analytics-updated]");
  const kpiRoot = document.querySelector("[data-analytics-kpis]");
  const number = new Intl.NumberFormat("ar-EG");
  const percent = new Intl.NumberFormat("ar-EG", { style: "percent", maximumFractionDigits: 1 });

  const kpiLabels = [
    ["visitorsToday", "زوار اليوم"], ["visitorsWeek", "زوار هذا الأسبوع"], ["orders", "عدد الطلبات"],
    ["addToCart", "إضافة للسلة"], ["beginCheckout", "بدء Checkout"], ["successfulOrders", "طلبات ناجحة"],
    ["conversionRate", "Conversion Rate", "percent"]
  ];

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function empty(message = "لا توجد بيانات بعد") {
    return `<p class="analytics-empty">${escapeHtml(message)}</p>`;
  }

  function renderKpis(metrics = {}) {
    kpiRoot.innerHTML = kpiLabels.map(([key, label, type]) => {
      const raw = Number(metrics[key] || 0);
      const value = type === "percent" ? percent.format(raw) : number.format(raw);
      return `<article class="analytics-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
    }).join("");
  }

  function renderList(key, rows = []) {
    const root = document.querySelector(`[data-analytics-list="${key}"]`);
    if (!root) return;
    if (!rows.length) { root.innerHTML = empty(); return; }
    const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
    root.innerHTML = `<ol class="analytics-ranked">${rows.map((row) => `
      <li><div><strong>${escapeHtml(row.label || "غير محدد")}</strong><span>${number.format(Number(row.value || 0))}</span></div><i style="--bar:${Math.max(4, Math.round((Number(row.value || 0) / max) * 100))}%"></i></li>
    `).join("")}</ol>`;
  }

  function renderErrors(type, rows = []) {
    const root = document.querySelector(`[data-analytics-errors="${type}"]`);
    if (!root) return;
    if (!rows.length) { root.innerHTML = empty("لا توجد أخطاء مسجلة"); return; }
    root.innerHTML = `<div class="analytics-errors">${rows.map((row) => `
      <article><div><strong>${escapeHtml(row.message || "خطأ غير محدد")}</strong><time>${escapeHtml(new Date(row.occurredAt).toLocaleString("ar-EG"))}</time></div><span>${escapeHtml(row.page || "/")}${row.statusCode ? ` · HTTP ${escapeHtml(row.statusCode)}` : ""}</span></article>
    `).join("")}</div>`;
  }

  async function loadAnalytics() {
    refreshButton.disabled = true;
    updated.textContent = "جارٍ تحديث البيانات...";
    try {
      const response = await fetch(`/admin/api/analytics?days=${encodeURIComponent(rangeSelect.value)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تحميل Analytics");
      renderKpis(data.metrics);
      Object.entries(data.lists || {}).forEach(([key, rows]) => renderList(key, rows));
      ["javascript", "api", "checkout", "worker"].forEach((type) => renderErrors(type, data.errors?.[type] || []));
      updated.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG")}`;
    } catch (error) {
      updated.textContent = error.message || "تعذر تحميل Analytics";
      renderKpis({});
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", loadAnalytics);
  rangeSelect.addEventListener("change", loadAnalytics);
  loadAnalytics();
}());
