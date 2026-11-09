import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoOrder } from "../site/order-model.mjs";
import {
  OrderStore,
  restoreBasket,
  basketPayload,
} from "../site/order-store.mjs";
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
};
const basket = () => {
  const b = new DemoOrder();
  b.add("burger", ["double"]);
  b.add("lemonade");
  b.add("lemonade");
  b.setTip(12);
  b.setNote("No onions");
  return b;
};
const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
test("basket and device-only order survive a fresh client instance", async () => {
  const disk = storage(),
    a = new OrderStore({ storage: disk });
  await a.init(true);
  a.draft(basket());
  const b = new OrderStore({ storage: disk });
  assert.deepEqual(restoreBasket(b.state.draft).totals(), {
    principal: 33000,
    tip: 3960,
    total: 36960,
    count: 3,
  });
  await b.init(true);
  const saved = await b.submit(restoreBasket(b.state.draft));
  assert.equal(saved.storage, "device");
  const c = new OrderStore({ storage: disk });
  await c.init(true);
  assert.equal(c.state.receipt.id, saved.id);
  assert.equal((await c.queue()).length, 1);
});
test("lost server response and reload replay the original idempotency key and payload", async () => {
  const disk = storage(),
    seen = [];
  let responseLost = true;
  const request = async (path, options) => {
    if (path === "/api/health") return json({ demo: true, provider: "mock" });
    if (path === "/api/merchant/orders") return json({ orders: [] });
    seen.push({ key: options.headers["Idempotency-Key"], body: options.body });
    if (responseLost) {
      responseLost = false;
      throw Error("lost response");
    }
    return json({
      id: "server-order",
      status: "RECEIVED",
      storage: "database",
    });
  };
  const a = new OrderStore({ storage: disk, request });
  await a.init();
  await assert.rejects(() => a.submit(basket()), /Connection interrupted/);
  const b = new OrderStore({ storage: disk, request });
  await b.init();
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
  assert.equal(b.state.receipt.id, "server-order");
  assert.equal(b.state.pending, null);
});
test("rapid duplicate clicks issue one request", async () => {
  const disk = storage();
  let finish,
    calls = 0;
  const request = async () => {
    calls++;
    return new Promise((r) => {
      finish = () => r(json({ id: "one", status: "RECEIVED" }));
    });
  };
  const a = new OrderStore({ storage: disk, request });
  a.mode = "database";
  const first = a.submit(basket());
  assert.equal(await a.submit(basket()), null);
  finish();
  await first;
  assert.equal(calls, 1);
});
test("database outage never silently switches a previously connected client to preview", async () => {
  const disk = storage(),
    a = new OrderStore({ storage: disk, request: async () => json({}, 404) });
  a.state.mode = "database";
  a.save();
  await assert.rejects(() => a.init(), /unavailable/);
  assert.notEqual(a.mode, "preview");
  await assert.rejects(() => a.submit(basket()), /connection/);
});
test("failure retry reuses the ticket and cannot regress a ready order", async () => {
  const a = new OrderStore({ storage: storage() });
  await a.init(true);
  const r = await a.submit(basket(), "failed");
  assert.equal(r.status, "PAYMENT_FAILED");
  await assert.rejects(() => a.update(r.id, "PREPARING"), /Refresh/);
  await a.update(r.id, "RECEIVED", true);
  await a.update(r.id, "PREPARING");
  await a.update(r.id, "READY");
  await a.update(r.id, "RECEIVED", true);
  assert.equal(a.state.receipt.status, "READY");
  assert.equal((await a.queue()).length, 1);
});
test("blocked storage prevents the request from reaching the server", async () => {
  let calls = 0;
  const a = new OrderStore({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error("blocked");
      },
    },
    request: async () => {
      calls++;
    },
  });
  a.mode = "database";
  await assert.rejects(() => a.submit(basket()), /save this order safely/);
  assert.equal(calls, 0);
});
test("checkout payload includes item IDs and quantities, never client prices", () => {
  const data = basketPayload(basket());
  assert.equal(data.lines[0].quantity, 1);
  assert.equal(data.lines[0].itemId, "burger");
  assert.equal(Object.hasOwn(data, "total"), false);
  assert.equal(Object.hasOwn(data.lines[0], "unitCents"), false);
});
test("separate tabs keep drafts isolated while sharing the preview restaurant queue", async () => {
  const sharedQueue = storage(),
    guestDisk = storage(),
    kitchenDisk = storage();
  const guest = new OrderStore({
    storage: guestDisk,
    queueStorage: sharedQueue,
  });
  const kitchen = new OrderStore({
    storage: kitchenDisk,
    queueStorage: sharedQueue,
  });
  await guest.init(true);
  await kitchen.init(true);
  guest.draft(basket());
  const saved = await guest.submit(basket());
  assert.equal((await kitchen.queue())[0].id, saved.id);
  await kitchen.update(saved.id, "PREPARING");
  kitchen.newOrder();
  const refreshed = new OrderStore({
    storage: guestDisk,
    queueStorage: sharedQueue,
  });
  await refreshed.init(true);
  assert.equal(refreshed.state.draft.note, "No onions");
  assert.equal((await refreshed.queue())[0].status, "PREPARING");
});
