import { z } from "zod";
import type { DB, SQL, Row } from "./db.ts";
import { one } from "./db.ts";
import { id, token, hash, quote, requireThat } from "./domain.ts";
import type { PaymentProvider, PosAdapter, Verified } from "./providers.ts";
export const paymentInput = z
  .object({
    mode: z.enum(["full", "equal", "custom"]),
    amountCents: z.number().int().positive().max(100000000).optional(),
    people: z.number().int().min(2).max(12).optional(),
    tipPercent: z.union([
      z.literal(0),
      z.literal(10),
      z.literal(12),
      z.literal(15),
    ]),
    revision: z.number().int(),
    email: z.email().optional(),
  })
  .strict();
export async function audit(
  q: SQL,
  venue: string,
  payment: string | null,
  event: string,
  detail: string,
) {
  await q.query(
    "INSERT INTO audit(id,venue_id,payment_id,event,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)",
    [id(), venue, payment, event, detail, Date.now()],
  );
}
async function enqueue(q: SQL, payment: string, kind: string) {
  await q.query(
    "INSERT INTO jobs(id,payment_id,kind,due_at) VALUES($1,$2,$3,$4) ON CONFLICT(payment_id,kind) DO UPDATE SET status=CASE WHEN jobs.status='DONE' THEN 'READY' ELSE jobs.status END,due_at=$4",
    [id(), payment, kind, Date.now()],
  );
}
export class Service {
  constructor(
    public db: DB,
    public provider: PaymentProvider,
    public pos: PosAdapter,
  ) {}
  async seed() {
    await this.db.tx(async (q) => {
      for (const [venue, name] of [
        ["olive", "The Olive Room"],
        ["cedar", "Cedar Kitchen"],
      ]) {
        await q.query(
          "INSERT INTO venues(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [venue, name],
        );
        for (let n = 1; n <= 12; n++) {
          await q.query(
            "INSERT INTO checks(id,venue_id,table_label,qr_code,visit_id,total_cents,lines) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",
            [
              venue + "-" + n,
              venue,
              String(n).padStart(2, "0"),
              token(),
              id(),
              42500,
              JSON.stringify([
                { name: "Wood-fired burger", quantity: 1, cents: 16500 },
                { name: "Roasted vegetable bowl", quantity: 1, cents: 14500 },
                { name: "House lemonade", quantity: 2, cents: 3500 },
                { name: "Flat white", quantity: 1, cents: 4500 },
              ]),
            ],
          );
        }
      }
    });
  }
  async claim(code: string, role = "guest") {
    return this.db.tx(async (q) => {
      const c = await one(
        q,
        "SELECT * FROM checks WHERE qr_code=$1 AND active=TRUE",
        [code],
      );
      requireThat(
        c,
        "TABLE_UNAVAILABLE",
        "This table code is unavailable.",
        404,
      );
      const raw = token(),
        sessionHash = hash(raw);
      await q.query(
        "INSERT INTO sessions(token_hash,venue_id,check_id,visit_id,role,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          sessionHash,
          c.venue_id,
          c.id,
          c.visit_id,
          role,
          Date.now() + 8 * 3600000,
        ],
      );
      return { raw, sessionHash };
    });
  }
  async session(raw: string) {
    const s = await one(
      this.db,
      "SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>$2",
      [hash(raw), Date.now()],
    );
    requireThat(
      s,
      "SESSION_REQUIRED",
      "Open an active table to continue.",
      401,
    );
    return s;
  }
  async bill(s: Row, q: SQL = this.db): Promise<Row> {
    requireThat(
      this.pos.capabilities().readCheck,
      "PARTNER_ACCESS_REQUIRED",
      "An approved POS read-check adapter is required.",
      503,
    );
    const c = await one(
      q,
      "SELECT c.*,v.name FROM checks c JOIN venues v ON v.id=c.venue_id WHERE c.id=$1 AND c.venue_id=$2",
      [s.check_id, s.venue_id],
    );
    requireThat(
      c && c.visit_id === s.visit_id && c.active,
      "VISIT_EXPIRED",
      "This table visit has ended.",
      403,
    );
    const r = await one(
      q,
      "SELECT COALESCE(SUM(amount_cents),0)::integer AS reserved FROM payments WHERE check_id=$1 AND visit_id=$2 AND reservation=TRUE",
      [c.id, c.visit_id],
    );
    return {
      ...c,
      available_cents: Math.max(
        0,
        c.total_cents - c.external_paid_cents - r.reserved,
      ),
      reserved_cents: r.reserved,
    };
  }
  async createPayment(s: Row, key: string, body: unknown) {
    const input = paymentInput.parse(body);
    requireThat(
      /^[a-zA-Z0-9-]{8,100}$/.test(key),
      "IDEMPOTENCY_KEY",
      "A unique request key is required.",
      400,
    );
    requireThat(
      this.pos.capabilities().postExternalPayment,
      "CAPABILITY_UNAVAILABLE",
      "POS payment posting is not enabled.",
      503,
    );
    if (this.provider.name === "paystack")
      requireThat(
        input.email,
        "EMAIL_REQUIRED",
        "Email is required for the provider sandbox.",
        400,
      );
    const fingerprint = hash(JSON.stringify(input));
    const created = await this.db.tx(async (q) => {
      await q.query("SELECT id FROM checks WHERE id=$1 FOR UPDATE", [
        s.check_id,
      ]);
      const old = await one(
        q,
        "SELECT * FROM payments WHERE session_hash=$1 AND idempotency_key=$2",
        [s.token_hash, key],
      );
      if (old) {
        requireThat(
          old.request_hash === fingerprint,
          "KEY_REUSED",
          "This request key was used for different details.",
        );
        return { payment: old, fresh: false };
      }
      const b = await this.bill(s, q);
      requireThat(
        b.revision === input.revision,
        "STALE_BILL",
        "The bill changed. Refresh before paying.",
      );
      const value = quote(
          b.available_cents,
          input.mode,
          input.amountCents,
          input.people,
          input.tipPercent,
        ),
        pid = id(),
        ref = "gw-" + pid;
      const payment = await one(
        q,
        "INSERT INTO payments(id,venue_id,check_id,visit_id,session_hash,idempotency_key,request_hash,check_revision,amount_cents,tip_cents,currency,provider,reference,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ZAR',$11,$12,$13,$14) RETURNING *",
        [
          pid,
          s.venue_id,
          s.check_id,
          s.visit_id,
          s.token_hash,
          key,
          fingerprint,
          b.revision,
          value.amount,
          value.tip,
          this.provider.name,
          ref,
          Date.now(),
          Date.now() + 15 * 60000,
        ],
      );
      await enqueue(q, pid, "VERIFY");
      await q.query("UPDATE jobs SET due_at=$1 WHERE payment_id=$2", [
        Date.now() + 15000,
        pid,
      ]);
      await audit(
        q,
        s.venue_id,
        pid,
        "RESERVED",
        "Bill share reserved before checkout",
      );
      return { payment, fresh: true };
    });
    if (created.fresh) {
      try {
        const url = await this.provider.initialize(
          created.payment,
          input.email,
        );
        await this.db.query("UPDATE payments SET checkout_url=$1 WHERE id=$2", [
          url,
          created.payment.id,
        ]);
      } catch {
        await this.db.query(
          "UPDATE payments SET review_reason=$1 WHERE id=$2",
          ["CHECKOUT_INIT_UNCERTAIN", created.payment.id],
        );
      }
      await this.db.tx((q) => enqueue(q, created.payment.id, "VERIFY"));
    }
    return this.payment(s, created.payment.id);
  }
  async payment(s: Row, pid: string) {
    const p = await one(
      this.db,
      "SELECT * FROM payments WHERE id=$1 AND venue_id=$2 AND session_hash=$3",
      [pid, s.venue_id, s.token_hash],
    );
    requireThat(p, "PAYMENT_NOT_FOUND", "Payment not found.", 404);
    const { session_hash, request_hash, idempotency_key, ...publicPayment } = p;
    return publicPayment;
  }
  async ingest(
    eventKey: string,
    reference: string,
    provider: string,
    payloadHash: string,
  ) {
    return this.db.tx(async (q) => {
      const p = await one(
        q,
        "SELECT * FROM payments WHERE reference=$1 AND provider=$2",
        [reference, provider],
      );
      if (!p) return { ignored: true };
      const old = await one(
        q,
        "SELECT * FROM webhook_events WHERE event_key=$1",
        [eventKey],
      );
      if (old) {
        requireThat(
          old.reference === reference && old.payload_hash === payloadHash,
          "EVENT_COLLISION",
          "Event identifier was reused for a different payload.",
          400,
        );
        await q.query(
          "UPDATE webhook_events SET deliveries=deliveries+1 WHERE event_key=$1",
          [eventKey],
        );
        return { duplicate: true };
      }
      await q.query(
        "INSERT INTO webhook_events(event_key,provider,reference,payload_hash,created_at) VALUES($1,$2,$3,$4,$5)",
        [eventKey, provider, reference, payloadHash, Date.now()],
      );
      await enqueue(q, p.id, "VERIFY");
      await audit(
        q,
        p.venue_id,
        p.id,
        "EVENT_RECEIVED",
        "Provider event stored; server verification queued",
      );
      return { duplicate: false };
    });
  }
  async applyVerified(pid: string, v: Verified) {
    await this.db.tx(async (q) => {
      const initial = await one(
        q,
        "SELECT check_id FROM payments WHERE id=$1",
        [pid],
      );
      if (!initial) return;
      await q.query("SELECT id FROM checks WHERE id=$1 FOR UPDATE", [
        initial.check_id,
      ]);
      const p = await one(q, "SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
        pid,
      ]);
      if (
        v.reference !== p.reference ||
        v.amount !== p.amount_cents + p.tip_cents ||
        v.currency !== "ZAR" ||
        v.domain !== "test"
      ) {
        await q.query(
          "UPDATE payments SET review_reason='PROVIDER_MISMATCH' WHERE id=$1",
          [pid],
        );
        await audit(
          q,
          p.venue_id,
          pid,
          "MANUAL_REVIEW",
          "Provider reference, amount, currency or environment mismatch",
        );
        return;
      }
      if (v.status === "reversed") {
        await q.query(
          "UPDATE payments SET funds_state='REVERSED',review_reason='REVERSAL_REVIEW' WHERE id=$1",
          [pid],
        );
        await audit(
          q,
          p.venue_id,
          pid,
          "REVERSAL_REVIEW",
          "Provider reversal requires POS reconciliation; reservation retained",
        );
        return;
      }
      if (p.funds_state === "VERIFIED" || p.funds_state === "REVERSED") return;
      if (v.status === "success") {
        const c = await one(q, "SELECT * FROM checks WHERE id=$1", [
          p.check_id,
        ]);
        const released = !p.reservation;
        const changed = c.revision !== p.check_revision;
        await q.query(
          "UPDATE payments SET funds_state='VERIFIED',reservation=TRUE,pos_state=$2,review_reason=$3 WHERE id=$1",
          [
            pid,
            released || changed || !c.active || c.visit_id !== p.visit_id
              ? "REVIEW"
              : "QUEUED",
            released
              ? "LATE_SUCCESS_AFTER_RELEASE"
              : changed
                ? "BILL_CHANGED"
                : !c.active || c.visit_id !== p.visit_id
                  ? "VISIT_CHANGED"
                  : null,
          ],
        );
        await audit(
          q,
          p.venue_id,
          pid,
          "FUNDS_VERIFIED",
          "Reference, amount, currency and test environment matched",
        );
        if (!released && !changed && c.active && c.visit_id === p.visit_id)
          await enqueue(q, pid, "POST_POS");
      } else if (v.status === "failed") {
        await q.query(
          "UPDATE payments SET funds_state='FAILED',reservation=FALSE,review_reason=NULL WHERE id=$1",
          [pid],
        );
        await audit(
          q,
          p.venue_id,
          pid,
          "PAYMENT_FAILED",
          "Provider confirmed failure; reservation released",
        );
      } else if (Date.now() > Number(p.expires_at)) {
        await q.query(
          "UPDATE payments SET review_reason='CONFIRMATION_OVERDUE' WHERE id=$1",
          [pid],
        );
      } // An elapsed timer alone is not proof that no funds arrived.
    });
  }
  async tick() {
    const job: Row | undefined = await this.db.tx(async (q) => {
      const j = await one(
        q,
        "SELECT * FROM jobs WHERE status IN ('READY','RUNNING') AND due_at<=$1 AND locked_until<=$1 ORDER BY due_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        [Date.now()],
      );
      if (!j) return;
      const lease = id();
      await q.query(
        "UPDATE jobs SET status='RUNNING',locked_until=$1,lease=$2 WHERE id=$3",
        [Date.now() + 30000, lease, j.id],
      );
      return { ...j, lease };
    });
    if (!job) return false;
    try {
      const p = await one(this.db, "SELECT * FROM payments WHERE id=$1", [
        job.payment_id,
      ]);
      if (job.kind === "VERIFY") {
        const v = await this.provider.verify(p.reference);
        await this.applyVerified(p.id, v);
        if (!["success", "failed", "reversed"].includes(v.status)) {
          await this.db.query(
            "UPDATE jobs SET status='READY',due_at=$1,locked_until=0 WHERE id=$2 AND lease=$3",
            [Date.now() + 5000, job.id, job.lease],
          );
          return true;
        }
      } else if (p.funds_state === "VERIFIED" && p.pos_state !== "REVIEW") {
        let recorded = await this.pos.lookup(p.reference);
        if (!recorded) {
          await this.pos.post(p);
          recorded = await this.pos.lookup(p.reference);
        }
        requireThat(
          recorded &&
            recorded.venue_id === p.venue_id &&
            recorded.check_id === p.check_id &&
            recorded.amount_cents === p.amount_cents &&
            recorded.tip_cents === p.tip_cents,
          "POS_MISMATCH",
          "POS confirmation does not match.",
        );
        await this.db.tx(async (q) => {
          const changed = await q.query(
            "UPDATE payments SET pos_state='POSTED',review_reason=NULL WHERE id=$1 AND pos_state<>'POSTED' RETURNING id",
            [p.id],
          );
          if (changed.rows.length)
            await audit(
              q,
              p.venue_id,
              p.id,
              "POS_POSTED",
              "One external payment confirmed in the POS",
            );
        });
      }
      await this.db.query(
        "UPDATE jobs SET status='DONE',locked_until=0 WHERE id=$1 AND lease=$2",
        [job.id, job.lease],
      );
    } catch (e) {
      const attempts = job.attempts + 1,
        dead = attempts >= 5;
      await this.db.tx(async (q) => {
        await q.query(
          "UPDATE jobs SET status=$1,attempts=$2,due_at=$3,locked_until=0,last_error=$4 WHERE id=$5 AND lease=$6",
          [
            dead ? "DEAD" : "READY",
            attempts,
            Date.now() + Math.min(60000, 1000 * 2 ** attempts),
            e instanceof Error ? e.message.slice(0, 120) : "Worker error",
            job.id,
            job.lease,
          ],
        );
        const p = await one(q, "SELECT * FROM payments WHERE id=$1", [
          job.payment_id,
        ]);
        if (job.kind === "POST_POS")
          await q.query(
            "UPDATE payments SET pos_state=$1,review_reason='POS_SYNC_PENDING' WHERE id=$2 AND pos_state<>'POSTED'",
            [dead ? "REVIEW" : "RETRY", p.id],
          );
        else if (dead)
          await q.query(
            "UPDATE payments SET review_reason='PROVIDER_UNAVAILABLE' WHERE id=$1",
            [p.id],
          );
        await audit(
          q,
          p.venue_id,
          p.id,
          dead ? "JOB_REVIEW" : "JOB_RETRY",
          job.kind + " could not be confirmed; no second charge attempted",
        );
      });
    }
    return true;
  }
  async retry(s: Row, pid: string) {
    return this.db.tx(async (q) => {
      const p = await one(
        q,
        "SELECT * FROM payments WHERE id=$1 AND venue_id=$2",
        [pid, s.venue_id],
      );
      requireThat(p, "NOT_FOUND", "Payment not found.", 404);
      requireThat(
        ![
          "LATE_SUCCESS_AFTER_RELEASE",
          "PROVIDER_MISMATCH",
          "VISIT_CHANGED",
          "REVERSAL_REVIEW",
          "BILL_CHANGED",
        ].includes(p.review_reason),
        "REVIEW_REQUIRED",
        "This mismatch requires investigation; automatic retry disabled.",
      );
      await q.query(
        "UPDATE jobs SET status='READY',attempts=0,due_at=$1,locked_until=0 WHERE payment_id=$2 AND status<>'RUNNING'",
        [Date.now(), pid],
      );
      await q.query(
        "UPDATE payments SET pos_state=CASE WHEN funds_state='VERIFIED' AND pos_state<>'POSTED' THEN 'QUEUED' ELSE pos_state END WHERE id=$1",
        [pid],
      );
      await audit(
        q,
        s.venue_id,
        pid,
        "RETRY_REQUESTED",
        "Merchant requested reconciliation retry",
      );
    });
  }
  async dashboard(s: Row) {
    const payments = (
      await this.db.query(
        "SELECT id,check_id,reference,amount_cents,tip_cents,funds_state,pos_state,review_reason,refunded_state,created_at FROM payments WHERE venue_id=$1 ORDER BY created_at DESC",
        [s.venue_id],
      )
    ).rows;
    const events = (
      await this.db.query(
        "SELECT * FROM audit WHERE venue_id=$1 ORDER BY created_at DESC LIMIT 40",
        [s.venue_id],
      )
    ).rows;
    const jobs = (
      await this.db.query(
        "SELECT j.kind,j.status,j.attempts,j.last_error,j.payment_id FROM jobs j JOIN payments p ON p.id=j.payment_id WHERE p.venue_id=$1",
        [s.venue_id],
      )
    ).rows;
    return {
      payments,
      events,
      jobs,
      verifiedCents: payments
        .filter((p) => p.funds_state === "VERIFIED")
        .reduce((s, p) => s + p.amount_cents, 0),
      postedCents: payments
        .filter((p) => p.pos_state === "POSTED")
        .reduce((s, p) => s + p.amount_cents, 0),
      tipCents: payments
        .filter((p) => p.funds_state === "VERIFIED")
        .reduce((s, p) => s + p.tip_cents, 0),
      exceptions: payments.filter(
        (p) =>
          p.review_reason ||
          p.pos_state === "RETRY" ||
          p.pos_state === "REVIEW",
      ).length,
    };
  }
  async refundRequest(s: Row, pid: string, reason: string) {
    await this.db.tx(async (q) => {
      const p = await one(
        q,
        "SELECT * FROM payments WHERE id=$1 AND venue_id=$2",
        [pid, s.venue_id],
      );
      requireThat(
        p?.funds_state === "VERIFIED",
        "NOT_REFUNDABLE",
        "A verified payment is required.",
      );
      await q.query(
        "INSERT INTO refunds(id,payment_id,venue_id,reason,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(payment_id) DO NOTHING",
        [id(), pid, s.venue_id, reason, Date.now()],
      );
      await q.query(
        "UPDATE payments SET refunded_state='REQUESTED' WHERE id=$1",
        [pid],
      );
      await audit(
        q,
        s.venue_id,
        pid,
        "REFUND_REQUESTED",
        "Request recorded for authorised provider handling; no refund executed",
      );
    });
  }
}
