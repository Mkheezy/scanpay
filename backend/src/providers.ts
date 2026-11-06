import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DB, Row } from "./db.ts";
import { one } from "./db.ts";
import { AppError, requireThat } from "./domain.ts";
export interface Verified {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  domain: string;
}
export interface PaymentProvider {
  name: string;
  initialize(p: Row, email?: string): Promise<string>;
  verify(reference: string): Promise<Verified>;
}
export class MockProvider implements PaymentProvider {
  name = "mock";
  constructor(private db: DB) {}
  async initialize(p: Row) {
    await this.db.query(
      "INSERT INTO provider_mock(reference,status,amount_cents,currency) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [p.reference, "pending", p.amount_cents + p.tip_cents, "ZAR"],
    );
    return "/checkout.html?payment=" + p.id;
  }
  async verify(reference: string) {
    const r = await one(
      this.db,
      "SELECT * FROM provider_mock WHERE reference=$1",
      [reference],
    );
    requireThat(
      r,
      "PROVIDER_UNKNOWN",
      "Provider has not confirmed this reference.",
    );
    return {
      reference,
      amount: r.amount_cents,
      currency: r.currency,
      status: r.status,
      domain: "test",
    };
  }
}
const responseSchema = z.object({
  status: z.boolean(),
  data: z.unknown().optional(),
});
export class PaystackProvider implements PaymentProvider {
  name = "paystack";
  constructor(
    private key: string,
    private origin: string,
    private request: typeof fetch = fetch,
  ) {
    requireThat(
      key.startsWith("sk_test_"),
      "TEST_KEY_REQUIRED",
      "Only Paystack test keys are accepted by this build.",
      400,
    );
  }
  private async call(path: string, body?: unknown) {
    const res = await this.request("https://api.paystack.co" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + this.key,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw new AppError(
        502,
        "PROVIDER_UNAVAILABLE",
        "Paystack request could not be confirmed.",
      );
    const json = responseSchema.parse(await res.json());
    requireThat(
      json.status,
      "PROVIDER_REJECTED",
      "Paystack did not confirm the request.",
      502,
    );
    return json.data;
  }
  async initialize(p: Row, email?: string) {
    requireThat(
      email && z.email().safeParse(email).success,
      "EMAIL_REQUIRED",
      "An email is required for Paystack test checkout.",
      400,
    );
    const d = z
      .object({ authorization_url: z.url(), reference: z.string() })
      .parse(
        await this.call("/transaction/initialize", {
          email,
          amount: String(p.amount_cents + p.tip_cents),
          currency: "ZAR",
          reference: p.reference,
          callback_url: this.origin + "/?payment=" + p.id + "#demo",
        }),
      );
    const u = new URL(d.authorization_url);
    requireThat(
      u.protocol === "https:" &&
        u.hostname === "checkout.paystack.com" &&
        d.reference === p.reference,
      "PROVIDER_RESPONSE",
      "Unexpected checkout response.",
      502,
    );
    return d.authorization_url;
  }
  async verify(reference: string) {
    const d = z
      .object({
        reference: z.string(),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string(),
        domain: z.string(),
      })
      .parse(
        await this.call("/transaction/verify/" + encodeURIComponent(reference)),
      );
    return d;
  }
}
export function validSignature(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
  mode: "timestamped" | "legacy",
  now = Math.floor(Date.now() / 1000),
) {
  if (!signature || !secret) return false;
  if (mode === "legacy") {
    if (!/^[a-f0-9]{128}$/.test(signature)) return false;
    return timingSafeEqual(
      createHmac("sha512", secret).update(raw).digest(),
      Buffer.from(signature, "hex"),
    );
  }
  let ts: string | undefined;
  const signatures: string[] = [];
  for (const part of signature.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(),
      v = part.slice(i + 1).trim();
    if (k === "t") {
      if (ts !== undefined || !/^\d+$/.test(v)) return false;
      ts = v;
    } else if (k === "v1") {
      const j = v.indexOf(":");
      if (j > 0 && v.slice(0, j).startsWith("whk_"))
        signatures.push(v.slice(j + 1));
    }
  }
  if (
    !ts ||
    !Number.isSafeInteger(Number(ts)) ||
    Math.abs(now - Number(ts)) > 300
  )
    return false;
  const expected = createHmac("sha512", secret)
    .update(ts + ".")
    .update(raw)
    .digest();
  return signatures.some(
    (s) =>
      /^[a-f0-9]{128}$/.test(s) &&
      timingSafeEqual(expected, Buffer.from(s, "hex")),
  );
}
export interface PosAdapter {
  capabilities(): Record<string, boolean>;
  lookup(reference: string): Promise<Row | undefined>;
  post(p: Row): Promise<void>;
}
export class MockPos implements PosAdapter {
  constructor(private db: DB) {}
  capabilities() {
    return {
      readCheck: true,
      postExternalPayment: true,
      partialPayment: true,
      tips: true,
      ordering: false,
    };
  }
  lookup(reference: string) {
    return one(this.db, "SELECT * FROM pos_mock_posts WHERE reference=$1", [
      reference,
    ]);
  }
  async post(p: Row) {
    const provider = await one(
      this.db,
      "SELECT * FROM provider_mock WHERE reference=$1",
      [p.reference],
    );
    if (provider?.fault === "pos_down") throw Error("POS_UNAVAILABLE");
    await this.db.tx(async (q) => {
      const c = await one(q, "SELECT * FROM checks WHERE id=$1 FOR UPDATE", [
        p.check_id,
      ]);
      requireThat(
        c?.active &&
          c.visit_id === p.visit_id &&
          c.revision === p.check_revision,
        "VISIT_CLOSED",
        "Check no longer belongs to this visit.",
      );
      await q.query(
        "INSERT INTO pos_mock_posts(reference,venue_id,check_id,amount_cents,tip_cents,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          p.reference,
          p.venue_id,
          p.check_id,
          p.amount_cents,
          p.tip_cents,
          Date.now(),
        ],
      );
    });
    if (provider?.fault === "timeout_after_write")
      throw Error("POS_TIMEOUT_AFTER_WRITE");
  }
}
export class UnconfiguredPos implements PosAdapter {
  constructor(public vendor: "pilot" | "gaap") {}
  capabilities() {
    return {
      readCheck: false,
      postExternalPayment: false,
      partialPayment: false,
      tips: false,
      ordering: false,
    };
  }
  async lookup(): Promise<Row | undefined> {
    throw new AppError(
      503,
      "PARTNER_ACCESS_REQUIRED",
      `${this.vendor}: approved API documentation and sandbox access required.`,
    );
  }
  async post(): Promise<void> {
    await this.lookup();
  }
}
