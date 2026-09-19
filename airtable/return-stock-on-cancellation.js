// Airtable automation: إرجاع المخزون عند إلغاء الأوردر
// Input variable: recordId = Airtable record ID from the trigger record.
const { recordId } = input.config();
if (!recordId) throw new Error("Missing triggering order-detail record ID");

const detailsTable = base.getTable("تفاصيل الطلبات");
const movementsTable = base.getTable("حركات المخزون");
const detail = await detailsTable.selectRecordAsync(recordId);
if (!detail) throw new Error(`Order detail not found: ${recordId}`);

const deducted = detail.getCellValue("تم خصم المخزون؟") === true;
const returned = detail.getCellValue("تم إرجاع المخزون؟") === true;
const quantity = Number(detail.getCellValue("الكمية") || 0);
const productLinks = detail.getCellValue("المنتج") || [];
const orderLinks = detail.getCellValue("رقم الأوردر") || [];

if (returned || !deducted || quantity <= 0 || productLinks.length === 0) {
  output.set("result", returned ? "already-returned" : "not-eligible");
} else {
  const key = `cancel-return:${recordId}`;
  const movementQuery = await movementsTable.selectRecordsAsync({ fields: ["مفتاح عدم التكرار"] });
  const existing = movementQuery.records.find(record =>
    record.getCellValue("مفتاح عدم التكرار") === key
  );

  if (!existing) {
    await movementsTable.createRecordAsync({
      "نوع الحركة": { name: "مرتجع عميل" },
      "الكمية": quantity,
      "رقم الأوردر": orderLinks.map(link => ({ id: link.id })),
      "المنتج": productLinks.map(link => ({ id: link.id })),
      "ملاحظات": "إرجاع تلقائي للمخزون بسبب إلغاء الأوردر",
      "مفتاح عدم التكرار": key
    });
  }

  await detailsTable.updateRecordAsync(recordId, { "تم إرجاع المخزون؟": true });
  output.set("result", existing ? "repaired-returned-flag" : "created-return-movement");
  output.set("idempotencyKey", key);
}
