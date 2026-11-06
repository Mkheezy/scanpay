import express from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { fileURLToPath } from "node:url";
import { Service, audit } from "./service.ts";
import { one } from "./db.ts";
import { AppError, requireThat, hash, id, token } from "./domain.ts";
import { validSignature } from "./providers.ts";
export type Config = {
  origin: string;
  demo: boolean;
  accessKey?: string;
  webhookSecret?: string;
  paystackKey?: string;
  signatureMode: "timestamped" | "legacy";
};
export function createApp(service: Service, config: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://images.unsplash.com https://placehold.co; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.paystack.com",
    );
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  const buckets = new Map<string, { count: number; time: number }>();
  app.use("/api", (req, res, next) => {
    const now = Date.now(),
      key = req.ip || "local";
    if (buckets.size > 10000) buckets.clear();
    let b = buckets.get(key);
    if (!b || now - b.time > 60000) {
      b = { count: 0, time: now };
      buckets.set(key, b);
    }
    if (++b.count > 300)
      return res
        .status(429)
        .json({ code: "RATE_LIMIT", message: "Please wait a moment." });
    next();
  });
  app.post(
    "/api/webhooks/paystack",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      requireThat(
        service.provider.name === "paystack",
        "PROVIDER_DISABLED",
        "Paystack is not configured.",
        503,
      );
      const modern = config.signatureMode === "timestamped",
        secret = modern ? config.webhookSecret : config.paystackKey;
      requireThat(
        Buffer.isBuffer(req.body) &&
          validSignature(
            req.body,
            req.get(modern ? "paystack-signature" : "x-paystack-signature"),
            secret || "",
            config.signatureMode,
          ),
        "INVALID_SIGNATURE",
        "Invalid webhook signature.",
        401,
      );
      const payload = z
        .object({
          event: z.string(),
          data: z.object({
            reference: z.string(),
            id: z.union([z.string(), z.number()]).optional(),
          }),
        })
        .parse(JSON.parse(req.body.toString()));
      const key = hash(
        "paystack:" +
          payload.event +
          ":" +
          payload.data.reference +
          ":" +
          String(payload.data.id || ""),
      );
      await service.ingest(
        key,
        payload.data.reference,
        "paystack",
        hash(req.body),
      );
      res.json({ received: true });
    },
  );
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.get("origin");
      if (
        (origin && origin !== config.origin) ||
        req.get("x-groundwork") !== "1"
      )
        return res
          .status(403)
          .json({
            code: "ORIGIN_DENIED",
            message: "Use the same-origin application.",
          });
    }
    next();
  });
  const getSession = async (req: Request) => {
    const cookies = req.headers.cookie || "";
    const value = cookies
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("gw_session="))
      ?.slice(11);
    return service.session(value || "");
  };
  const merchant = async (req: Request) => {
    const s = await getSession(req);
    requireThat(
      ["merchant", "demo_admin"].includes(s.role),
      "MERCHANT_REQUIRED",
      "Merchant access required.",
      403,
    );
    return s;
  };
  const cookie = (res: Response, raw: string) =>
    res.cookie("gw_session", raw, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.origin.startsWith("https:"),
      maxAge: 8 * 3600000,
      path: "/",
    });
  app.get("/api/health", async (_req, res) => {
    await service.db.query("SELECT 1");
    res.json({
      ok: true,
      database: service.db.kind,
      provider: service.provider.name,
      demo: config.demo,
      livePayments: false,
    });
  });
  app.get("/api/capabilities", (_req, res) =>
    res.json({
      mock: service.pos.capabilities(),
      paystack: {
        configured: service.provider.name === "paystack",
        mode: "test-only",
        contractTests: true,
        liveSandboxVerified: false,
      },
      pilot: {
        enabled: false,
        reason:
          "Requires approved API docs, sandbox credentials, external-payment permissions and fee agreement.",
      },
      gaap: {
        enabled: false,
        reason:
          "Requires authorised API family, sandbox, certification and payment-posting contract.",
      },
    }),
  );
  app.post("/api/demo/start", async (req, res) => {
    requireThat(
      config.demo && service.provider.name === "mock",
      "DEMO_DISABLED",
      "Demo controls are disabled.",
      403,
    );
    if (config.accessKey)
      requireThat(
        hash(String(req.body?.accessKey || "")) === hash(config.accessKey),
        "DEMO_KEY_REQUIRED",
        "Enter the demo access key.",
        401,
      );
    const c = await one(
      service.db,
      "SELECT qr_code FROM checks WHERE id='olive-7'",
    );
    const s = await service.claim(c.qr_code, "demo_admin");
    cookie(res, s.raw);
    res.json({ ok: true });
  });
  app.post("/api/merchant/login", async (req, res) => {
    requireThat(
      config.accessKey &&
        hash(String(req.body?.accessKey || "")) === hash(config.accessKey),
      "ACCESS_DENIED",
      "Valid operator key required.",
      401,
    );
    const c = await one(
      service.db,
      "SELECT qr_code FROM checks WHERE id='olive-7'",
    );
    const s = await service.claim(c.qr_code, "merchant");
    cookie(res, s.raw);
    res.json({ ok: true });
  });
  app.post("/api/tables/:code/claim", async (req, res) => {
    const s = await service.claim(String(req.params.code));
    cookie(res, s.raw);
    res.json({ ok: true });
  });
  app.get("/api/bill", async (req, res) => {
    const s = await getSession(req),
      b = await service.bill(s);
    const { qr_code, ...bill } = b;
    res.json({ bill, role: s.role, provider: service.provider.name });
  });
  app.post("/api/payments", async (req, res) =>
    res
      .status(201)
      .json(
        await service.createPayment(
          await getSession(req),
          req.get("idempotency-key") || "",
          req.body,
        ),
      ),
  );
  app.get("/api/payments/:id", async (req, res) =>
    res.json(
      await service.payment(await getSession(req), String(req.params.id)),
    ),
  );
  app.post("/api/payments/:id/verify", async (req, res) => {
    const p = await service.payment(
      await getSession(req),
      String(req.params.id),
    );
    await service.ingest(
      hash("verify:" + p.id + ":" + Math.floor(Date.now() / 5000)),
      p.reference,
      p.provider,
      hash("verify"),
    );
    res.json({ queued: true });
  });
  app.get("/api/merchant/dashboard", async (req, res) =>
    res.json(await service.dashboard(await merchant(req))),
  );
  app.get("/api/merchant/reconciliation.csv", async (req, res) => {
    const d = await service.dashboard(await merchant(req));
    const columns = [
      "id",
      "check_id",
      "reference",
      "amount_cents",
      "tip_cents",
      "funds_state",
      "pos_state",
      "review_reason",
      "refunded_state",
    ];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"';
    res
      .type("text/csv")
      .attachment("groundwork-reconciliation.csv")
      .send(
        [
          columns.join(","),
          ...d.payments.map((p) => columns.map((c) => cell(p[c])).join(",")),
        ].join("\n"),
      );
  });
  app.post("/api/merchant/payments/:id/retry", async (req, res) => {
    await service.retry(await merchant(req), String(req.params.id));
    res.json({ queued: true });
  });
  app.post("/api/merchant/payments/:id/refund-request", async (req, res) => {
    await service.refundRequest(
      await merchant(req),
      String(req.params.id),
      z.string().min(5).max(300).parse(req.body.reason),
    );
    res.json({ state: "REQUESTED", executed: false });
  });
  app.get("/api/merchant/tables", async (req, res) => {
    const s = await merchant(req);
    res.json(
      (
        await service.db.query(
          "SELECT id,table_label,qr_code,active FROM checks WHERE venue_id=$1 ORDER BY table_label",
          [s.venue_id],
        )
      ).rows,
    );
  });
  app.get("/api/merchant/tables/:id/qr.svg", async (req, res) => {
    const s = await merchant(req),
      c = await one(
        service.db,
        "SELECT * FROM checks WHERE id=$1 AND venue_id=$2",
        [req.params.id, s.venue_id],
      );
    requireThat(c, "NOT_FOUND", "Table not found.", 404);
    res
      .type("image/svg+xml")
      .send(
        await QRCode.toString(config.origin + "/t/" + c.qr_code, {
          type: "svg",
          margin: 3,
          errorCorrectionLevel: "M",
        }),
      );
  });
  app.post("/api/merchant/tables/:id/rotate", async (req, res) => {
    const s = await merchant(req);
    const c = await one(
      service.db,
      "UPDATE checks SET qr_code=$1 WHERE id=$2 AND venue_id=$3 RETURNING qr_code",
      [token(), req.params.id, s.venue_id],
    );
    requireThat(c, "NOT_FOUND", "Table not found.", 404);
    await audit(
      service.db,
      s.venue_id,
      null,
      "QR_ROTATED",
      "Old table code revoked",
    );
    res.json({ ok: true });
  });
  app.post("/api/demo/payments/:id/outcome", async (req, res) => {
    requireThat(
      config.demo && service.provider.name === "mock",
      "DEMO_DISABLED",
      "Simulation disabled.",
      403,
    );
    const s = await getSession(req),
      p = await service.payment(s, String(req.params.id));
    const outcome = z
      .enum([
        "success",
        "pending",
        "failed",
        "pos_down",
        "timeout_after_write",
        "mismatch",
      ])
      .parse(req.body.outcome);
    await service.db.query(
      "UPDATE provider_mock SET status=$1,fault=$2,amount_cents=$3 WHERE reference=$4",
      [
        outcome === "pending"
          ? "pending"
          : outcome === "failed"
            ? "failed"
            : "success",
        ["pos_down", "timeout_after_write"].includes(outcome)
          ? outcome
          : "none",
        p.amount_cents + p.tip_cents + (outcome === "mismatch" ? 1 : 0),
        p.reference,
      ],
    );
    const event = JSON.stringify({ reference: p.reference, outcome });
    await service.ingest(hash(event), p.reference, "mock", hash(event));
    res.json({ queued: true });
  });
  app.post("/api/demo/payments/:id/repair", async (req, res) => {
    requireThat(
      config.demo && service.provider.name === "mock",
      "DEMO_DISABLED",
      "Simulation disabled.",
      403,
    );
    const s = await merchant(req),
      p = await one(
        service.db,
        "SELECT * FROM payments WHERE id=$1 AND venue_id=$2",
        [req.params.id, s.venue_id],
      );
    requireThat(p, "NOT_FOUND", "Payment not found.", 404);
    await service.db.query(
      "UPDATE provider_mock SET fault='none',status='success' WHERE reference=$1",
      [p.reference],
    );
    await service.retry(s, p.id);
    res.json({ queued: true });
  });
  app.post("/api/demo/new-visit", async (req, res) => {
    requireThat(
      config.demo && service.provider.name === "mock",
      "DEMO_DISABLED",
      "Simulation disabled.",
      403,
    );
    const s = await merchant(req);
    await service.db.tx(async (q) => {
      await q.query("SELECT id FROM checks WHERE id=$1 FOR UPDATE", [
        s.check_id,
      ]);
      const open = await one(
        q,
        "SELECT count(*)::integer AS count FROM payments WHERE check_id=$1 AND visit_id=$2 AND reservation=TRUE AND (funds_state<>'VERIFIED' OR pos_state<>'POSTED')",
        [s.check_id, s.visit_id],
      );
      requireThat(
        !open.count,
        "UNRESOLVED_PAYMENT",
        "Resolve pending payments before starting another visit.",
      );
      await q.query(
        "UPDATE checks SET visit_id=$1,revision=revision+1,external_paid_cents=0 WHERE id=$2",
        [id(), s.check_id],
      );
    });
    const c = await one(service.db, "SELECT qr_code FROM checks WHERE id=$1", [
        s.check_id,
      ]),
      fresh = await service.claim(c.qr_code, "demo_admin");
    cookie(res, fresh.raw);
    res.json({ ok: true });
  });
  // Keep provider returns on the payment screen when the home page is the pitch.
  app.get(["/", "/index.html"], (req, res, next) => {
    if (Object.hasOwn(req.query, "payment")) {
      const query = req.originalUrl.slice(req.originalUrl.indexOf("?"));
      return res.redirect(303, "/sandbox.html" + query + "#demo");
    }
    next();
  });
  app.get(["/design-reference.html", "/demo-info.html"], (_req, res) =>
    res.redirect(302, "/"),
  );
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.get("/t/:code", (_req, res) =>
    res.sendFile(
      fileURLToPath(new URL("../public/sandbox.html", import.meta.url)),
    ),
  );
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const correlationId = id();
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          code: "INVALID_INPUT",
          message: "Check the supplied fields.",
          correlationId,
        });
    if (err instanceof AppError)
      return res
        .status(err.status)
        .json({ code: err.code, message: err.message, correlationId });
    console.error(
      "Request failed",
      correlationId,
      err instanceof Error ? err.name : "unknown",
    );
    res
      .status(500)
      .json({
        code: "INTERNAL_ERROR",
        message: "Unable to complete this request.",
        correlationId,
      });
  });
  return app;
}
