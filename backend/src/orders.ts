import { z } from "zod";
import { DemoOrder } from "../public/order-model.mjs";
import { one, type DB, type Row } from "./db.ts";
import { hash, id, requireThat } from "./domain.ts";
import { audit } from "./service.ts";

const input = z
  .object({
    lines: z
      .array(
        z
          .object({
            itemId: z.string().max(40),
            modifiers: z.array(z.string().max(40)).max(4),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    note: z.string().max(120),
    tipPercent: z.union([
      z.literal(0),
      z.literal(10),
      z.literal(12),
      z.literal(15),
    ]),
    paymentOutcome: z.enum(["success", "failed"]),
  })
  .strict();
const view = (r: Row) => ({
  ...r.receipt,
  id: r.id,
  status: r.status,
  paymentStatus: r.status === "PAYMENT_FAILED" ? "FAILED" : "SIMULATED_PAID",
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  storage: "database",
});
const canRead = (s: Row, r: Row) =>
  r &&
  r.venue_id === s.venue_id &&
  (r.session_hash === s.token_hash ||
    ["merchant", "demo_admin"].includes(s.role));

export class Orders {
  constructor(private db: DB) {}
  async create(s: Row, key: string, body: unknown) {
    requireThat(
      /^[a-zA-Z0-9_-]{16,100}$/.test(key),
      "INVALID_KEY",
      "A valid order reference is required.",
      400,
    );
    const data = input.parse(body);
    const model = new DemoOrder();
    try {
      for (const line of data.lines)
        for (let n = 0; n < line.quantity; n++)
          model.add(line.itemId, line.modifiers);
      model.setNote(data.note);
      model.setTip(data.tipPercent);
    } catch (e) {
      requireThat(false, "INVALID_ORDER", (e as Error).message, 400);
    }
    const requestHash = hash(JSON.stringify(data));
    return this.db.tx(async (q) => {
      // Serialise against both duplicate requests and table visit rotation.
      const table = await one(
        q,
        "SELECT * FROM checks WHERE id=$1 AND venue_id=$2 FOR UPDATE",
        [s.check_id, s.venue_id],
      );
      requireThat(
        table && table.active && table.visit_id === s.visit_id,
        "VISIT_EXPIRED",
        "This table visit has ended.",
        403,
      );
      const existing = await one(
        q,
        "SELECT * FROM demo_orders WHERE venue_id=$1 AND idempotency_key=$2",
        [s.venue_id, key],
      );
      if (existing) {
        requireThat(canRead(s, existing), "NOT_FOUND", "Order not found.", 404);
        requireThat(
          existing.request_hash === requestHash,
          "ORDER_CONFLICT",
          "This request was already used with different details.",
        );
        return view(existing);
      }
      const orderId = id(),
        now = Date.now();
      const receipt = {
        ...model.totals(),
        lines: model.lines,
        note: model.note,
        simulated: true,
        reference: "GW-" + orderId.slice(0, 8).toUpperCase(),
        table: table.table_label,
      };
      const r = await one(
        q,
        `INSERT INTO demo_orders(id,venue_id,check_id,visit_id,session_hash,idempotency_key,request_hash,receipt,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
        [
          orderId,
          s.venue_id,
          s.check_id,
          s.visit_id,
          s.token_hash,
          key,
          requestHash,
          JSON.stringify(receipt),
          data.paymentOutcome === "failed" ? "PAYMENT_FAILED" : "RECEIVED",
          now,
        ],
      );
      await audit(q, s.venue_id, null, "DEMO_ORDER_CREATED", orderId);
      return view(r);
    });
  }
  async get(s: Row, orderId: string) {
    const r = await one(this.db, "SELECT * FROM demo_orders WHERE id=$1", [
      orderId,
    ]);
    requireThat(canRead(s, r), "NOT_FOUND", "Order not found.", 404);
    return view(r);
  }
  async list(s: Row) {
    const rows = (
      await this.db.query(
        "SELECT * FROM demo_orders WHERE venue_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [s.venue_id],
      )
    ).rows;
    return rows.map(view);
  }
  async transition(s: Row, orderId: string, target: string, retry = false) {
    return this.db.tx(async (q) => {
      const r = await one(
        q,
        "SELECT * FROM demo_orders WHERE id=$1 FOR UPDATE",
        [orderId],
      );
      requireThat(canRead(s, r), "NOT_FOUND", "Order not found.", 404);
      if (retry) {
        if (r.status !== "PAYMENT_FAILED") return view(r); // Replay never regresses a kitchen ticket.
        target = "RECEIVED";
      } else {
        requireThat(
          ["merchant", "demo_admin"].includes(s.role),
          "MERCHANT_REQUIRED",
          "Merchant access required.",
          403,
        );
        if (r.status === target) return view(r);
        requireThat(
          (r.status === "RECEIVED" && target === "PREPARING") ||
            (r.status === "PREPARING" && target === "READY"),
          "INVALID_TRANSITION",
          "Refresh the queue before updating this order.",
        );
      }
      const updated = await one(
        q,
        "UPDATE demo_orders SET status=$1,updated_at=$2 WHERE id=$3 RETURNING *",
        [target, Date.now(), orderId],
      );
      await audit(
        q,
        s.venue_id,
        null,
        retry ? "DEMO_ORDER_PAYMENT_RETRIED" : "DEMO_ORDER_STATUS_CHANGED",
        orderId + ":" + target,
      );
      return view(updated);
    });
  }
}
