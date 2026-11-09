import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { openDB, migrate, one, type DB, type Row } from "../src/db.ts";
import { Service } from "../src/service.ts";
import { MockProvider, MockPos } from "../src/providers.ts";
import { Orders } from "../src/orders.ts";
import { createApp } from "../src/app.ts";
import { id } from "../src/domain.ts";
let db: DB,
  service: Service,
  orders: Orders,
  folder: string,
  server: Server,
  origin: string;
let guest: Row,
  operator: Row,
  stranger: Row,
  guestCookie: string,
  operatorCookie: string;
const body = () => ({
  lines: [
    { itemId: "burger", modifiers: ["double"], quantity: 1 },
    { itemId: "lemonade", modifiers: [], quantity: 2 },
  ],
  note: "No onions",
  tipPercent: 12,
  paymentOutcome: "success",
});
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "groundwork-orders-"));
  db = await openDB(join(folder, "db"));
  await migrate(db);
  service = new Service(db, new MockProvider(db), new MockPos(db));
  await service.seed();
  orders = new Orders(db);
  const table = await one(db, "SELECT * FROM checks WHERE id='olive-7'");
  for (const role of ["guest", "demo_admin", "guest"]) {
    const claim = await service.claim(table.qr_code, role),
      s = await service.session(claim.raw);
    if (role === "demo_admin") {
      operator = s;
      operatorCookie = "gw_session=" + claim.raw;
    } else if (!guest) {
      guest = s;
      guestCookie = "gw_session=" + claim.raw;
    } else stranger = s;
  }
  const app = createApp(service, {
    origin: "http://localhost",
    demo: true,
    signatureMode: "timestamped",
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
  await rm(folder, { recursive: true, force: true });
});
async function api(
  path: string,
  method = "GET",
  cookie = "",
  payload?: unknown,
  key: string = id(),
) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Groundwork": "1",
      Cookie: cookie,
      "Idempotency-Key": key,
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return { status: r.status, data: (await r.json()) as any };
}
test("HTTP order journey saves authoritative prices, note and modifiers and advances kitchen status", async () => {
  const made = await api("/api/orders", "POST", guestCookie, body());
  assert.equal(made.status, 201);
  const r = made.data;
  assert.equal(r.principal, 33000);
  assert.equal(r.tip, 3960);
  assert.equal(r.total, 36960);
  assert.equal(r.note, "No onions");
  assert.equal(r.lines[0].modifiers[0].id, "double");
  assert.equal(r.storage, "database");
  const queue = await api("/api/merchant/orders", "GET", operatorCookie);
  assert.ok(queue.data.orders.some((o: any) => o.id === r.id));
  for (const status of ["PREPARING", "READY"]) {
    assert.equal(
      (
        await api(
          `/api/merchant/orders/${r.id}/status`,
          "POST",
          operatorCookie,
          { status },
        )
      ).data.status,
      status,
    );
    assert.equal(
      (await api(`/api/orders/${r.id}`, "GET", guestCookie)).data.status,
      status,
    );
  }
});
test("concurrent double submission creates one order; changed payload with same key is rejected", async () => {
  const key = id();
  const replies = await Promise.all(
    Array.from({ length: 8 }, () =>
      api("/api/orders", "POST", guestCookie, body(), key),
    ),
  );
  assert.ok(
    replies.every((r) => r.status === 201 && r.data.id === replies[0].data.id),
  );
  assert.equal(
    (
      await one(
        db,
        "SELECT count(*)::integer AS count FROM demo_orders WHERE idempotency_key=$1",
        [key],
      )
    ).count,
    1,
  );
  assert.equal(
    (
      await api(
        "/api/orders",
        "POST",
        guestCookie,
        { ...body(), note: "Different" },
        key,
      )
    ).status,
    409,
  );
});
test("failed payment stays out of kitchen states; repeat retries release exactly the same ticket once", async () => {
  const failed = await orders.create(guest, id(), {
    ...body(),
    paymentOutcome: "failed",
  });
  assert.equal(failed.status, "PAYMENT_FAILED");
  await assert.rejects(
    () => orders.transition(operator, failed.id, "PREPARING"),
    /Refresh the queue/,
  );
  const attempts = await Promise.all([
    orders.transition(guest, failed.id, "RECEIVED", true),
    orders.transition(guest, failed.id, "RECEIVED", true),
  ]);
  assert.ok(
    attempts.every((r) => r.id === failed.id && r.status === "RECEIVED"),
  );
  await orders.transition(operator, failed.id, "PREPARING");
  assert.equal(
    (await orders.transition(guest, failed.id, "RECEIVED", true)).status,
    "PREPARING",
  );
  assert.equal(
    (
      await one(
        db,
        "SELECT count(*)::integer AS count FROM audit WHERE event='DEMO_ORDER_PAYMENT_RETRIED' AND detail=$1",
        [failed.id + ":RECEIVED"],
      )
    ).count,
    1,
  );
});
test("orders require authentication and kitchen actions require merchant role", async () => {
  assert.equal((await api("/api/orders", "POST", "", body())).status, 401);
  const r = await orders.create(guest, id(), body());
  assert.equal(
    (await api("/api/merchant/orders", "GET", guestCookie)).status,
    403,
  );
  assert.equal(
    (
      await api(`/api/merchant/orders/${r.id}/status`, "POST", guestCookie, {
        status: "PREPARING",
      })
    ).status,
    403,
  );
  await assert.rejects(() => orders.get(stranger, r.id), /Order not found/);
  await assert.rejects(
    () => orders.get({ ...operator, venue_id: "other-venue" }, r.id),
    /Order not found/,
  );
  assert.deepEqual(
    await orders.list({ ...operator, venue_id: "other-venue" }),
    [],
  );
});
test("invalid prices, modifiers, excessive quantities, notes and keys are rejected", async () => {
  for (const payload of [
    { ...body(), total: 1 },
    {
      ...body(),
      lines: [{ itemId: "burger", modifiers: ["unknown"], quantity: 1 }],
    },
    {
      ...body(),
      lines: [
        { itemId: "burger", modifiers: ["double", "double"], quantity: 1 },
      ],
    },
    { ...body(), lines: [{ itemId: "burger", modifiers: [], quantity: 11 }] },
    {
      ...body(),
      lines: [
        { itemId: "burger", modifiers: [], quantity: 10 },
        { itemId: "bowl", modifiers: [], quantity: 10 },
        { itemId: "lemonade", modifiers: [], quantity: 1 },
      ],
    },
    { ...body(), note: "x".repeat(121) },
    { ...body(), tipPercent: 99 },
  ]) {
    assert.equal(
      (await api("/api/orders", "POST", guestCookie, payload)).status,
      400,
    );
  }
  assert.equal(
    (await api("/api/orders", "POST", guestCookie, body(), "bad")).status,
    400,
  );
});
test("kitchen cannot skip or reverse status; repeated identical action is idempotent", async () => {
  const r = await orders.create(guest, id(), body());
  await assert.rejects(
    () => orders.transition(operator, r.id, "READY"),
    /Refresh/,
  );
  await orders.transition(operator, r.id, "PREPARING");
  assert.equal(
    (await orders.transition(operator, r.id, "PREPARING")).status,
    "PREPARING",
  );
  await orders.transition(operator, r.id, "READY");
  await assert.rejects(
    () => orders.transition(operator, r.id, "PREPARING"),
    /Refresh/,
  );
});
test("stale visits cannot create orders and cross-origin mutations are denied", async () => {
  await assert.rejects(
    () => orders.create({ ...guest, visit_id: "expired" }, id(), body()),
    /visit has ended/,
  );
  const r = await fetch(origin + "/api/orders", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
      "X-Groundwork": "1",
      Cookie: guestCookie,
    },
    body: JSON.stringify(body()),
  });
  assert.equal(r.status, 403);
});
test("ordering fails closed when demo mode is disabled", async () => {
  const disabled = createApp(service, {
    origin: "http://localhost",
    demo: false,
    signatureMode: "timestamped",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => disabled.once("listening", r));
  try {
    const r = await fetch(
      "http://127.0.0.1:" +
        (disabled.address() as { port: number }).port +
        "/api/orders/" +
        id(),
      { headers: { Cookie: operatorCookie } },
    );
    assert.equal(r.status, 403);
  } finally {
    await new Promise<void>((r) => disabled.close(() => r()));
  }
});
test("receipts and kitchen status survive database shutdown and reopen", async () => {
  const saved = await orders.create(guest, id(), body());
  await orders.transition(operator, saved.id, "PREPARING");
  await db.close();
  db = await openDB(join(folder, "db"));
  await migrate(db);
  orders = new Orders(db);
  const restored = await orders.get(guest, saved.id);
  assert.equal(restored.status, "PREPARING");
  assert.equal(restored.total, 36960);
  assert.equal(restored.note, "No onions");
});
