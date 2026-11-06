import test from "node:test";
import assert from "node:assert/strict";
import { DemoOrder } from "../public/order-model.mjs";
test("empty basket cannot submit", () => {
  const o = new DemoOrder();
  assert.throws(() => o.submit(), /Add an item/);
  assert.equal(o.receipt, null);
});
test("menu prices, modifiers, quantities and tip produce integer-cent totals", () => {
  const o = new DemoOrder();
  const key = o.add("burger", ["double", "truffle"]);
  o.quantity(key, 2);
  o.add("lemonade");
  o.setTip(12);
  assert.deepEqual(o.totals(), {
    principal: 61500,
    tip: 7380,
    total: 68880,
    count: 3,
  });
});
test("identical configurations merge regardless of modifier order, variants remain distinct", () => {
  const o = new DemoOrder();
  o.add("burger", ["double", "truffle"]);
  o.add("burger", ["truffle", "double"]);
  o.add("burger");
  assert.equal(o.lines.length, 2);
  assert.equal(o.lines[0].quantity, 2);
  assert.equal(o.totals().principal, 76500);
});
test("zero quantity removes a line, including its modifiers and tip contribution", () => {
  const o = new DemoOrder();
  const key = o.add("burger", ["double"]);
  o.add("lemonade");
  o.quantity(key, 0);
  assert.deepEqual(o.totals(), {
    principal: 3500,
    tip: 350,
    total: 3850,
    count: 1,
  });
});
test("invalid item and modifier combinations cannot alter basket", () => {
  const o = new DemoOrder();
  for (const args of [
    ["missing"],
    ["bowl", ["double"]],
    ["burger", ["double", "double"]],
  ])
    assert.throws(() => o.add(...args));
  assert.equal(o.totals().count, 0);
});
test("quantity limits reject invalid amounts without modifying existing basket", () => {
  const o = new DemoOrder();
  const key = o.add("burger");
  for (const n of [-1, 1.5, NaN, 11]) assert.throws(() => o.quantity(key, n));
  assert.equal(o.lines[0].quantity, 1);
  o.quantity(key, 10);
  assert.throws(() => o.add("burger"));
  o.quantity(o.add("bowl"), 10);
  assert.throws(() => o.add("lemonade"));
  assert.equal(o.totals().count, 20);
});
test("only listed tips accepted and no tip preserves principal", () => {
  const o = new DemoOrder();
  o.add("burger");
  o.setTip(0);
  assert.equal(o.totals().total, 18500);
  for (const n of [-1, 100, NaN]) assert.throws(() => o.setTip(n));
});
test("submission is idempotent and freezes the order, note and final totals", () => {
  const o = new DemoOrder();
  const key = o.add("burger", ["double"]);
  o.setNote("  No onions please  ");
  const receipt = o.submit();
  assert.strictEqual(o.submit(), receipt);
  assert.equal(receipt.note, "No onions please");
  assert.equal(receipt.total, 28600);
  assert.equal(receipt.simulated, true);
  assert.throws(() => o.quantity(key, 2));
  assert.throws(() => o.add("lemonade"));
  assert.throws(() => o.setTip(15));
  assert.throws(() => o.setNote("change"));
  assert.throws(() => (receipt.lines[0].quantity = 99));
});
test("callers cannot mutate the basket through exposed line objects", () => {
  const o = new DemoOrder();
  o.add("burger", ["double"]);
  const line = o.lines[0];
  line.quantity = 10;
  line.modifiers[0].cents = 1;
  assert.equal(o.totals().principal, 26000);
});
test("kitchen notes are bounded and a new order is independent", () => {
  const first = new DemoOrder();
  assert.throws(() => first.setNote("a".repeat(121)));
  first.add("burger");
  first.submit();
  const next = new DemoOrder();
  assert.equal(next.receipt, null);
  assert.equal(next.totals().count, 0);
});
