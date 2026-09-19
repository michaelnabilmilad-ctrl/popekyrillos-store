import test from "node:test";
import assert from "node:assert/strict";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";

function eligibleFixture({ deducted = true, returned = false, quantity = 1 } = {}) {
  const fixture = airtableFixture();
  const order = fixture.record("ملغي");
  const detail = fixture.addDetail(order, deducted, returned);
  detail.fields["الكمية"] = quantity;
  fixture.stock = deducted ? 9 : 10;
  return { fixture, detail };
}

test("new cancellation movement restores stock once and marks the detail", () => {
  const { fixture, detail } = eligibleFixture();
  fixture.runReturnAutomation(detail);
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(fixture.movements[0].key, `cancel-return:${detail.id}`);
  assert.equal(detail.fields["تم إرجاع المخزون؟"], true);
});

test("existing movement with a false flag repairs only the flag", () => {
  const { fixture, detail } = eligibleFixture();
  const key = `cancel-return:${detail.id}`;
  fixture.movements.push({ key, type: "مرتجع عميل", quantity: 1 });
  fixture.stock = 10;
  fixture.runReturnAutomation(detail);
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(detail.fields["تم إرجاع المخزون؟"], true);
});

test("existing movement with a true flag performs no action", () => {
  const { fixture, detail } = eligibleFixture({ returned: true });
  fixture.movements.push({ key: `cancel-return:${detail.id}`, type: "مرتجع عميل", quantity: 1 });
  fixture.stock = 10;
  assert.equal(fixture.runReturnAutomation(detail), "already-returned");
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
});

test("movement success followed by flag failure is idempotent on retry", () => {
  const { fixture, detail } = eligibleFixture();
  fixture.runReturnAutomation(detail, { failFlagUpdate: true });
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(detail.fields["تم إرجاع المخزون؟"], false);
  fixture.runReturnAutomation(detail);
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(detail.fields["تم إرجاع المخزون؟"], true);
});

test("not deducted and zero quantity details create no return movement", () => {
  for (const options of [{ deducted: false }, { quantity: 0 }]) {
    const { fixture, detail } = eligibleFixture(options);
    assert.equal(fixture.runReturnAutomation(detail), "not-eligible");
    assert.equal(fixture.movements.length, 0);
    assert.equal(fixture.stock, options.deducted === false ? 10 : 9);
  }
});
