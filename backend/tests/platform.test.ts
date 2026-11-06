import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { openDB, migrate, one, type DB, type Row } from "../src/db.ts";
import { Service } from "../src/service.ts";
import {
  MockProvider,
  MockPos,
  PaystackProvider,
  UnconfiguredPos,
  validSignature,
} from "../src/providers.ts";
import { id, hash, split } from "../src/domain.ts";
import { createApp } from "../src/app.ts";
let db: DB, service: Service;
let table = 0;
let fixtureDir: string;
before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "groundwork-tests-"));
  db = await openDB(join(fixtureDir, "db"));
  await migrate(db);
  service = new Service(db, new MockProvider(db), new MockPos(db));
  await service.seed();
});
after(async () => {
  await db.close();
  await rm(fixtureDir, { recursive: true, force: true });
});
async function guest(check?: string, role = "guest"): Promise<Row> {
  const c = await one(db, "SELECT * FROM checks WHERE id=$1", [
    check || "olive-" + ++table,
  ]);
  const { raw } = await service.claim(c.qr_code, role);
  return { ...(await service.session(raw)), raw };
}
async function create(s: Row, amount = 10000, key = id()) {
  const b = await service.bill(s);
  return service.createPayment(s, key, {
    mode: "custom",
    amountCents: amount,
    tipPercent: 10,
    revision: b.revision,
  });
}
async function verified(p: Row, status = "success", extra = {}) {
  await service.applyVerified(p.id, {
    reference: p.reference,
    amount: p.amount_cents + p.tip_cents,
    currency: "ZAR",
    status,
    domain: "test",
    ...extra,
  });
}
async function drain() {
  for (let n = 0; n < 100 && (await service.tick()); n++) {}
}
test("equal shares preserve every cent", () => {
  assert.deepEqual(split(10001, 3), [3334, 3334, 3333]);
  for (let n = 2; n < 13; n++)
    assert.equal(
      split(42500, n).reduce((a, b) => a + b),
      42500,
    );
});
test("idempotent checkout returns one intent and rejects changed payload", async () => {
  const s = await guest(),
    key = id(),
    p = await create(s, 25000, key),
    same = await create(s, 25000, key);
  assert.equal(p.id, same.id);
  assert.equal(p.tip_cents, 2500);
  await assert.rejects(() => create(s, 20000, key), /different details/);
  assert.equal((await service.bill(s)).available_cents, 17500);
  await verified(p, "failed");
});
test("two concurrent guests cannot reserve more than the remaining bill", async () => {
  const a = await guest(),
    b = await guest(a.check_id);
  const result = await Promise.allSettled([create(a, 30000), create(b, 30000)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await service.bill(a)).available_cents, 12500);
  for (const r of result)
    if (r.status === "fulfilled") await verified(r.value, "failed");
});
test("duplicate events are recorded once and stale pending cannot downgrade verified funds", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query(
    "UPDATE provider_mock SET status='success' WHERE reference=$1",
    [p.reference],
  );
  for (let n = 0; n < 3; n++)
    await service.ingest("event-" + p.id, p.reference, "mock", "same-hash");
  await drain();
  await verified(p, "pending");
  const now = await service.payment(s, p.id);
  assert.equal(now.funds_state, "VERIFIED");
  assert.equal(now.pos_state, "POSTED");
  const rows = (
    await db.query("SELECT * FROM pos_mock_posts WHERE reference=$1", [
      p.reference,
    ])
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(
    (
      await one(
        db,
        "SELECT deliveries FROM webhook_events WHERE event_key=$1",
        ["event-" + p.id],
      )
    ).deliveries,
    3,
  );
});
test("POS offline retains verified funds and repair posts exactly once", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query(
    "UPDATE provider_mock SET status='success',fault='pos_down' WHERE reference=$1",
    [p.reference],
  );
  await verified(p);
  await drain();
  let now = await service.payment(s, p.id);
  assert.equal(now.funds_state, "VERIFIED");
  assert.equal(now.pos_state, "RETRY");
  await db.query("UPDATE provider_mock SET fault='none' WHERE reference=$1", [
    p.reference,
  ]);
  await service.retry(s, p.id);
  await drain();
  now = await service.payment(s, p.id);
  assert.equal(now.pos_state, "POSTED");
});
test("timeout after POS write uses read-back before retry", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query(
    "UPDATE provider_mock SET status='success',fault='timeout_after_write' WHERE reference=$1",
    [p.reference],
  );
  await verified(p);
  await drain();
  assert.equal((await service.payment(s, p.id)).pos_state, "RETRY");
  await service.retry(s, p.id);
  await drain();
  assert.equal((await service.payment(s, p.id)).pos_state, "POSTED");
  assert.equal(
    (
      await db.query("SELECT * FROM pos_mock_posts WHERE reference=$1", [
        p.reference,
      ])
    ).rows.length,
    1,
  );
});
test("mismatched amount stays reserved and cannot post", async () => {
  const s = await guest(),
    p = await create(s);
  await verified(p, "success", { amount: 1 });
  const now = await service.payment(s, p.id);
  assert.equal(now.review_reason, "PROVIDER_MISMATCH");
  assert.equal(now.funds_state, "PENDING");
  assert.equal((await service.bill(s)).available_cents, 32500);
  await assert.rejects(() => service.retry(s, p.id), /investigation/);
  await verified(p, "failed");
});
test("bill changed after checkout causes review instead of POS posting", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query(
    "UPDATE checks SET revision=revision+1,total_cents=45000 WHERE id=$1",
    [s.check_id],
  );
  await verified(p);
  const now = await service.payment(s, p.id);
  assert.equal(now.funds_state, "VERIFIED");
  assert.equal(now.pos_state, "REVIEW");
  assert.equal(now.review_reason, "BILL_CHANGED");
});
test("timer expiry does not release unknown funds; confirmed failure releases once; late success requires review", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query("UPDATE payments SET expires_at=0 WHERE id=$1", [p.id]);
  await verified(p, "pending");
  assert.equal((await service.bill(s)).available_cents, 32500);
  assert.equal(
    (await service.payment(s, p.id)).review_reason,
    "CONFIRMATION_OVERDUE",
  );
  await verified(p, "failed");
  await verified(p, "failed");
  assert.equal((await service.bill(s)).available_cents, 42500);
  await verified(p, "success");
  assert.equal(
    (await service.payment(s, p.id)).review_reason,
    "LATE_SUCCESS_AFTER_RELEASE",
  );
});
test("guest payment access and tenant dashboard are isolated", async () => {
  const a = await guest(),
    b = await guest("cedar-1"),
    p = await create(a);
  await assert.rejects(() => service.payment(b, p.id), /not found/);
  assert.equal((await service.dashboard(b)).payments.length, 0);
  const sameTable = await guest(a.check_id);
  await assert.rejects(() => service.payment(sameTable, p.id), /not found/);
  await verified(p, "failed");
});
test("QR rotation revokes old scans and new visits reject old guest bills", async () => {
  const s = await guest(),
    c = await one(db, "SELECT * FROM checks WHERE id=$1", [s.check_id]);
  await db.query("UPDATE checks SET qr_code=$1,visit_id=$2 WHERE id=$3", [
    id(),
    id(),
    s.check_id,
  ]);
  await assert.rejects(() => service.claim(c.qr_code), /unavailable/);
  await assert.rejects(() => service.bill(s), /ended/);
});
test("refund requests remain distinct from completed refunds", async () => {
  const s = await guest(),
    p = await create(s);
  await verified(p);
  await service.refundRequest(s, p.id, "Guest requested review");
  await service.refundRequest(s, p.id, "Repeated request");
  assert.equal(
    (await db.query("SELECT * FROM refunds WHERE payment_id=$1", [p.id])).rows
      .length,
    1,
  );
  assert.equal((await service.payment(s, p.id)).refunded_state, "REQUESTED");
  assert.equal((await service.payment(s, p.id)).funds_state, "VERIFIED");
});
test("durable jobs and reservations survive closing and reopening database", async () => {
  const s = await guest(),
    p = await create(s);
  await db.query(
    "UPDATE provider_mock SET status='success' WHERE reference=$1",
    [p.reference],
  );
  await db.close();
  db = await openDB(join(fixtureDir, "db"));
  service = new Service(db, new MockProvider(db), new MockPos(db));
  assert.equal((await service.bill(s)).available_cents, 32500);
  await drain();
  assert.equal((await service.payment(s, p.id)).pos_state, "POSTED");
});
test("Paystack raw-body signatures reject tampering, stale timestamps and invalid legacy hex", () => {
  const raw = Buffer.from('{"event":"charge.success"}'),
    secret = "whsec_test",
    now = 1760000000;
  const sig = createHmac("sha512", secret)
    .update(now + ".")
    .update(raw)
    .digest("hex");
  const header = `t=${now},v1=whk_test:${sig}`;
  assert.equal(validSignature(raw, header, secret, "timestamped", now), true);
  assert.equal(
    validSignature(Buffer.from("{}"), header, secret, "timestamped", now),
    false,
  );
  assert.equal(
    validSignature(raw, header, secret, "timestamped", now + 301),
    false,
  );
  assert.equal(
    validSignature(
      raw,
      `t=${now},t=${now},v1=whk_test:${sig}`,
      secret,
      "timestamped",
      now,
    ),
    false,
  );
  assert.equal(validSignature(raw, "bad", secret, "legacy"), false);
  const old = createHmac("sha512", "sk_test_key").update(raw).digest("hex");
  assert.equal(validSignature(raw, old, "sk_test_key", "legacy"), true);
});
test("Paystack test adapter constructs official requests and refuses live keys", async () => {
  assert.throws(
    () => new PaystackProvider("sk_live_not_allowed", "https://example.com"),
    /test keys/,
  );
  const calls: { url: string; body: any; headers: any }[] = [];
  const transport = (async (url: any, options: any) => {
    calls.push({
      url,
      body: options.body ? JSON.parse(options.body) : null,
      headers: options.headers,
    });
    return new Response(
      JSON.stringify({
        status: true,
        data:
          options.method === "POST"
            ? {
                authorization_url: "https://checkout.paystack.com/demo",
                reference: "gw-test",
              }
            : {
                reference: "gw-test",
                amount: 27500,
                currency: "ZAR",
                status: "success",
                domain: "test",
              },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const p = new PaystackProvider(
    "sk_test_contract",
    "https://example.com",
    transport,
  );
  await p.initialize(
    { id: "test", reference: "gw-test", amount_cents: 25000, tip_cents: 2500 },
    "guest@example.com",
  );
  const v = await p.verify("gw-test");
  assert.equal(calls[0].url, "https://api.paystack.co/transaction/initialize");
  assert.equal(calls[0].body.amount, "27500");
  assert.equal(calls[0].body.currency, "ZAR");
  assert.equal(
    calls[0].body.callback_url,
    "https://example.com/?payment=test#demo",
  );
  assert.equal(
    calls[1].url,
    "https://api.paystack.co/transaction/verify/gw-test",
  );
  assert.equal(v.domain, "test");
});
test("unapproved POS adapters fail closed", async () => {
  for (const name of ["pilot", "gaap"] as const) {
    const p = new UnconfiguredPos(name);
    assert.equal(p.capabilities().postExternalPayment, false);
    await assert.rejects(() => p.post(), /approved API/);
  }
});
test("HTTP session, origin, merchant authorization and fresh quote checks", async () => {
  const app = createApp(service, {
    origin: "http://127.0.0.1",
    demo: true,
    signatureMode: "timestamped",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port,
    base = "http://127.0.0.1:" + port;
  try {
    let r = await fetch(base + "/api/bill");
    assert.equal(r.status, 401);
    r = await fetch(base + "/api/demo/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/demo/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Groundwork": "1" },
      body: "{}",
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    r = await fetch(base + "/api/merchant/dashboard", { headers: { cookie } });
    assert.equal(r.status, 200);
    const c = await one(db, "SELECT qr_code FROM checks WHERE id='cedar-2'");
    r = await fetch(base + "/api/tables/" + c.qr_code + "/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Groundwork": "1" },
      body: "{}",
    });
    const guestCookie = r.headers.get("set-cookie")!.split(";")[0];
    r = await fetch(base + "/api/merchant/dashboard", {
      headers: { cookie: guestCookie },
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/payments", {
      method: "POST",
      headers: {
        cookie: guestCookie,
        "Content-Type": "application/json",
        "X-Groundwork": "1",
        "Idempotency-Key": id(),
      },
      body: JSON.stringify({ mode: "full", tipPercent: 0, revision: 999 }),
    });
    assert.equal(r.status, 409);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
