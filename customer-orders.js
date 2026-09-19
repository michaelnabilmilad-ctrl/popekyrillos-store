(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const money = value => value === null || value === undefined ? "غير مسجّل" : new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(value);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value)) : "غير مسجّل";
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  async function api(path, body) {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer", headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "تعذر تحميل الطلب حاليًا. حاول لاحقًا.");
    return data;
  }
  const lookup = $("[data-lookup]");
  if (lookup) lookup.addEventListener("submit", async event => {
    event.preventDefault();
    const button = lookup.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    $("[data-message]").textContent = "جارٍ البحث عن الطلب…";
    try {
      const data = await api("/api/customer-orders/lookup", Object.fromEntries(new FormData(lookup)));
      if (!/^\/order\/[a-f0-9]{64}$/.test(data.trackingUrl)) throw new Error("تعذر فتح الطلب حاليًا.");
      window.location.assign(data.trackingUrl);
    } catch (error) { $("[data-message]").textContent = error.message || "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى."; }
    finally { button.disabled = false; }
  });
  if (!$("[data-order-page]")) return;
  const token = window.location.pathname.match(/^\/order\/([a-f0-9]{64})$/)?.[1];
  const endpoint = `/api/customer-orders/${token}`;
  let currentOrder;
  let busy = false;
  const dialog = $("[data-confirm]");
  function rows(target, entries) {
    target.replaceChildren(...entries.map(([label, value]) => { const row = element("div"); row.append(element("dt", label), element("dd", value === "" || value === undefined || value === null ? "غير مسجّل" : String(value))); return row; }));
  }
  function render(order) {
    currentOrder = order;
    $("h1").textContent = `طلب رقم ${order.orderNumber}`;
    $("[data-status]").textContent = order.orderStatus || "الحالة غير مسجّلة";
    $("[data-created]").textContent = `تاريخ الطلب: ${date(order.createdAt)}`;
    rows($("[data-customer]"), [["الاسم", order.customerName], ["الموبايل", order.phone], ["طريقة الاستلام", order.deliveryType], ...(order.pickupBranch ? [["فرع الاستلام", order.pickupBranch]] : [["عنوان الشحن", order.address]]), ["ملاحظات الطلب", order.notes || "لا توجد ملاحظات"]]);
    rows($("[data-totals]"), [["حالة الدفع", order.paymentStatus], ["الشحن", order.shippingCost === null ? "يُحدّد عند تأكيد الشحن" : money(order.shippingCost)], ["الخصم المحفوظ", order.discount === null ? "غير مسجّل بشكل منفصل" : money(order.discount)], ["إجمالي الطلب المحفوظ", money(order.total)]]);
    $("[data-shipping-note]").textContent = order.shippingCost === null ? "تكلفة الشحن غير محفوظة في الطلب. يتم تأكيدها مع المكتبة؛ الإجمالي أعلاه هو المبلغ المسجّل." : "";
    $("[data-items]").replaceChildren(...order.items.map(item => {
      const article = element("article", undefined, "item");
      const fallback = element("div", "لا توجد صورة", "item-placeholder");
      if (item.productImage) { const img = element("img"); img.src = item.productImage; img.alt = item.productName; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.addEventListener("error", () => img.replaceWith(fallback), { once: true }); article.append(img); }
      else article.append(fallback);
      const detail = element("div");
      detail.append(element("h3", item.productName));
      if (item.option) detail.append(element("p", item.option));
      if (item.sku) detail.append(element("p", `SKU: ${item.sku}`));
      detail.append(element("p", `الكمية: ${item.quantity ?? "غير مسجّلة"} · سعر القطعة: ${money(item.unitPrice)}`), element("p", `الإجمالي: ${money(item.lineTotal)}`, "line-total"));
      article.append(detail); return article;
    }));
    if (!order.items.length) $("[data-items]").append(element("p", "تفاصيل المنتجات غير متاحة لهذا الطلب القديم. تواصل معنا للمساعدة."));
    $("[data-cancel]").hidden = !order.canCancel;
    $("[data-cancel-message]").textContent = order.orderStatus === "ملغي" ? "تم إلغاء الطلب" : order.canCancel ? "يمكنك إلغاء الطلب ما دام في مرحلة تسمح بالإلغاء." : "لا يمكن إلغاء هذا الطلب في حالته الحالية أو بعد بدء الشحن.";
    $("[data-history-panel]").hidden = !order.history?.length;
    $("[data-history]").replaceChildren(...(order.history || []).map(entry => { const li = element("li", `${entry.oldStatus || "إنشاء الطلب"} ← ${entry.newStatus}`); li.append(element("small", `${date(entry.changedAt)} · ${{ customer: "العميل", admin: "الإدارة", system: "النظام" }[entry.changedBy] || "النظام"}`)); return li; }));
    $("[data-order-content]").hidden = false;
  }
  async function load() {
    $("[data-retry]").hidden = true;
    $("[data-refresh]").disabled = true;
    $("[data-message]").textContent = "جارٍ تحديث الطلب…";
    try {
      if (!token) throw new Error("الطلب غير موجود أو بيانات الطلب غير صحيحة.");
      render((await api(endpoint)).order);
      $("[data-message]").textContent = "";
    } catch (error) {
      $("[data-message]").textContent = error.message || "تعذر الاتصال. حاول مرة أخرى.";
      $("[data-retry]").hidden = false;
      $("[data-cancel]").hidden = true;
      currentOrder = null;
    } finally { $("[data-refresh]").disabled = false; }
  }
  $("[data-refresh]").addEventListener("click", load);
  $("[data-retry]").addEventListener("click", load);
  $("[data-cancel]").addEventListener("click", () => { if (currentOrder?.canCancel && !busy) { $("[data-confirm-message]").textContent = ""; dialog.showModal(); } });
  $("[data-back]").addEventListener("click", () => { if (!busy) dialog.close(); });
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  $("[data-confirm-cancel]").addEventListener("click", async () => {
    if (busy || !currentOrder?.canCancel) return;
    busy = true;
    $("[data-confirm-cancel]").disabled = true;
    $("[data-back]").disabled = true;
    $("[data-confirm-message]").textContent = "جارٍ تأكيد الإلغاء…";
    let message;
    try { message = (await api(`${endpoint}/cancel`, {})).message; }
    catch (error) { message = error.message || "تعذر تأكيد الإلغاء. حدّث الحالة قبل المحاولة مرة أخرى."; }
    finally {
      busy = false; $("[data-confirm-cancel]").disabled = false; $("[data-back]").disabled = false; dialog.close();
      await load(); $("[data-message]").textContent = message;
    }
  });
  load();
})();
