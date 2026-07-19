(function () {
  const paymentStatuses = ["غير مدفوع", "تحويل للمراجعة", "مدفوع", "دفع عند الاستلام"];
  const orderStatuses = ["جديد", "انتظار بيانات", "انتظار الدفع", "قيد التجهيز", "جاهز للاستلام / الشحن", "تم التسليم", "ملغي"];
  const state = { orders: [], selectedId: "", search: "", payment: "all", status: "all", delivery: "all", loaded: false };
  const els = {
    refresh: document.querySelector("[data-orders-refresh]"),
    stats: document.querySelector("[data-order-stats]"),
    search: document.querySelector("[data-orders-search]"),
    payment: document.querySelector("[data-orders-payment-filter]"),
    status: document.querySelector("[data-orders-status-filter]"),
    delivery: document.querySelector("[data-orders-delivery-filter]"),
    count: document.querySelector("[data-orders-count]"),
    updated: document.querySelector("[data-orders-updated]"),
    list: document.querySelector("[data-orders-list]"),
    details: document.querySelector("[data-order-details]")
  };

  if (!els.list) return;
  els.refresh.addEventListener("click", loadOrders);
  els.search.addEventListener("input", (event) => { state.search = event.target.value.trim().toLowerCase(); renderList(); });
  els.payment.addEventListener("change", (event) => { state.payment = event.target.value; renderList(); });
  els.status.addEventListener("change", (event) => { state.status = event.target.value; renderList(); });
  els.delivery.addEventListener("change", (event) => { state.delivery = event.target.value; renderList(); });
  els.list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-order-id]");
    if (!card) return;
    state.selectedId = card.dataset.orderId;
    renderList();
    renderDetails();
  });
  els.details.addEventListener("submit", saveOrder);

  loadOrders();

  async function loadOrders() {
    setLoading(true);
    try {
      const response = await fetch("/admin/api/orders", { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تحميل الأوردرات.");
      state.orders = Array.isArray(data.orders) ? data.orders : [];
      state.loaded = true;
      if (state.selectedId && !state.orders.some((order) => order.id === state.selectedId)) state.selectedId = "";
      els.updated.textContent = `آخر تحديث: ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
      renderAll();
    } catch (error) {
      els.list.innerHTML = `<div class="empty-state order-error">${escapeHtml(error.message)}</div>`;
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    els.refresh.disabled = loading;
    els.refresh.textContent = loading ? "جارٍ التحميل..." : "تحديث البيانات";
  }

  function filteredOrders() {
    return state.orders.filter((order) => {
      const haystack = [order.orderId, order.customerName, order.phone, order.products, order.paymentMethod].join(" ").toLowerCase();
      return (!state.search || haystack.includes(state.search)) &&
        (state.payment === "all" || order.paymentStatus === state.payment) &&
        (state.status === "all" || order.orderStatus === state.status) &&
        (state.delivery === "all" || order.deliveryType === state.delivery);
    });
  }

  function renderAll() { renderStats(); renderList(); renderDetails(); }

  function renderStats() {
    const today = new Date().toISOString().slice(0, 10);
    const cards = [
      ["إجمالي الأوردرات", state.orders.length, "all"],
      ["تحويلات للمراجعة", countBy("paymentStatus", "تحويل للمراجعة"), "review"],
      ["قيد التجهيز", countBy("orderStatus", "قيد التجهيز"), "preparing"],
      ["جاهز", countBy("orderStatus", "جاهز للاستلام / الشحن"), "ready"],
      ["استلام اليوم", state.orders.filter((order) => order.pickupDate === today).length, "today"]
    ];
    els.stats.innerHTML = cards.map(([label, value, tone]) => `<article class="order-stat order-stat-${tone}"><span>${label}</span><strong>${formatNumber(value)}</strong></article>`).join("");
  }

  function countBy(field, value) { return state.orders.filter((order) => order[field] === value).length; }

  function renderList() {
    const orders = filteredOrders();
    els.count.textContent = `${formatNumber(orders.length)} أوردر`;
    if (!orders.length) {
      els.list.innerHTML = '<div class="empty-state">لا توجد أوردرات مطابقة للفلاتر الحالية.</div>';
      return;
    }
    els.list.innerHTML = orders.map((order) => `
      <button type="button" class="order-card ${order.id === state.selectedId ? "is-selected" : ""}" data-order-id="${escapeAttr(order.id)}">
        <span class="order-card-head"><strong>#${escapeHtml(order.orderId || "—")} · ${escapeHtml(order.customerName || "بدون اسم")}</strong><span>${formatMoney(order.total)}</span></span>
        <span class="order-card-meta"><span>${escapeHtml(order.phone || "بدون موبايل")}</span><span>${escapeHtml(order.deliveryType || "غير محدد")}</span></span>
        <span class="order-card-statuses"><span class="status-pill">${escapeHtml(order.paymentStatus || "غير محدد")}</span><span class="status-pill">${escapeHtml(order.orderStatus || "غير محدد")}</span></span>
        <span class="order-card-date">${order.pickupDate ? `الاستلام: ${formatDate(order.pickupDate)}` : "ميعاد الاستلام غير محدد"}</span>
      </button>`).join("");
  }

  function renderDetails() {
    const order = state.orders.find((item) => item.id === state.selectedId);
    if (!order) { els.details.innerHTML = '<div class="empty-state">اختر أوردر لعرض التفاصيل وتحديث حالته.</div>'; return; }
    els.details.innerHTML = `
      <form class="order-details-form" data-order-form data-record-id="${escapeAttr(order.id)}">
        <div class="order-details-head"><div><p class="eyebrow">أوردر #${escapeHtml(order.orderId || "—")}</p><h3>${escapeHtml(order.customerName || "بدون اسم")}</h3></div><strong>${formatMoney(order.total)}</strong></div>
        <dl class="order-info">
          <div><dt>الموبايل</dt><dd dir="ltr">${escapeHtml(order.phone || "—")}</dd></div>
          <div><dt>المصدر</dt><dd>${escapeHtml(order.source || "—")}</dd></div>
          <div><dt>طريقة الدفع</dt><dd>${escapeHtml(order.paymentMethod || "—")}</dd></div>
          <div><dt>طريقة الاستلام</dt><dd>${escapeHtml(order.deliveryType || "—")}</dd></div>
        </dl>
        <section class="order-products"><h4>المنتجات</h4><p>${escapeHtml(order.products || "لا توجد تفاصيل").replaceAll("\n", "<br>")}</p></section>
        <div class="order-edit-grid">
          <label><span>حالة الدفع</span><select name="paymentStatus">${options(paymentStatuses, order.paymentStatus)}</select></label>
          <label><span>حالة الأوردر</span><select name="orderStatus">${options(orderStatuses, order.orderStatus)}</select></label>
          <label><span>ميعاد الاستلام</span><input type="date" name="pickupDate" value="${escapeAttr(order.pickupDate)}"></label>
          <label class="order-notes"><span>ملاحظات</span><textarea name="notes" rows="5">${escapeHtml(order.notes)}</textarea></label>
        </div>
        ${order.missingInfo && order.missingInfo !== "لا يوجد" ? `<p class="order-warning"><strong>بيانات ناقصة:</strong> ${escapeHtml(order.missingInfo)}</p>` : ""}
        <div class="order-save-row"><span data-order-save-state></span><button class="button" type="submit">حفظ التعديلات</button></div>
      </form>`;
  }

  async function saveOrder(event) {
    event.preventDefault();
    const form = event.target.closest("[data-order-form]");
    if (!form) return;
    const button = form.querySelector("button[type='submit']");
    const status = form.querySelector("[data-order-save-state]");
    const body = Object.fromEntries(new FormData(form).entries());
    button.disabled = true; status.textContent = "جارٍ الحفظ...";
    try {
      const response = await fetch(`/admin/api/orders/${encodeURIComponent(form.dataset.recordId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر حفظ التعديلات.");
      const index = state.orders.findIndex((order) => order.id === data.order.id);
      if (index >= 0) state.orders[index] = data.order;
      status.textContent = "تم الحفظ";
      renderStats(); renderList();
      window.setTimeout(() => { if (status.isConnected) status.textContent = ""; }, 2500);
    } catch (error) { status.textContent = error.message; status.classList.add("is-error"); }
    finally { button.disabled = false; }
  }

  function options(values, selected) { return values.map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); }
  function formatNumber(value) { return new Intl.NumberFormat("ar-EG").format(value || 0); }
  function formatMoney(value) { return `${new Intl.NumberFormat("ar-EG").format(value || 0)} ج.م`; }
  function formatDate(value) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function escapeAttr(value) { return escapeHtml(value).replaceAll("\n", " "); }
})();
