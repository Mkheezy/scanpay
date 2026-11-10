import { writeFile } from "node:fs/promises";
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = { type: "string" };
const routes = [
  ["get", "/health", "Check backend and storage health", null, "public"],
  ["get", "/capabilities", "Inspect adapter readiness", null, "public"],
  [
    "post",
    "/demo/start",
    "Create a mock demo operator session",
    object({ accessKey: str }),
    "public",
  ],
  [
    "post",
    "/merchant/login",
    "Create a sandbox operator session",
    object({ accessKey: str }, ["accessKey"]),
    "public",
  ],
  [
    "post",
    "/tables/{code}/claim",
    "Claim an active table visit",
    object({}),
    "public",
  ],
  ["get", "/bill", "Read the scoped current bill"],
  [
    "post",
    "/payments",
    "Reserve a share and initialize checkout",
    object(
      {
        mode: { enum: ["full", "equal", "custom"] },
        amountCents: { type: "integer", minimum: 1, maximum: 100000000 },
        people: { type: "integer", minimum: 2, maximum: 12 },
        tipPercent: { enum: [0, 10, 12, 15] },
        revision: { type: "integer" },
        email: { type: "string", format: "email" },
      },
      ["mode", "tipPercent", "revision"],
    ),
  ],
  ["get", "/payments/{id}", "Read the originating session payment"],
  [
    "post",
    "/payments/{id}/verify",
    "Queue server-side verification",
    object({}),
  ],
  [
    "post",
    "/webhooks/paystack",
    "Authenticate and persist a provider event",
    {
      type: "object",
      required: ["event", "data"],
      properties: {
        event: str,
        data: {
          type: "object",
          required: ["reference"],
          properties: {
            reference: str,
            id: { oneOf: [str, { type: "integer" }] },
          },
        },
      },
    },
    "webhook",
  ],
  ["get", "/merchant/dashboard", "Read venue payments, jobs and audit events"],
  ["get", "/merchant/reconciliation.csv", "Export the venue ledger"],
  [
    "post",
    "/merchant/payments/{id}/retry",
    "Retry reconciliation; investigation-only mismatches remain blocked",
    object({}),
  ],
  [
    "post",
    "/merchant/payments/{id}/refund-request",
    "Record a refund-review request without executing a refund",
    object({ reason: { type: "string", minLength: 5, maxLength: 300 } }, [
      "reason",
    ]),
  ],
  ["get", "/merchant/tables", "List venue tables"],
  ["get", "/merchant/tables/{id}/qr.svg", "Generate a real table QR SVG"],
  [
    "post",
    "/merchant/tables/{id}/rotate",
    "Revoke and replace the printed table code",
    object({}),
  ],
  [
    "post",
    "/demo/payments/{id}/outcome",
    "Change mock provider outcome and ingest its event",
    object(
      {
        outcome: {
          enum: [
            "success",
            "pending",
            "failed",
            "pos_down",
            "timeout_after_write",
            "mismatch",
          ],
        },
      },
      ["outcome"],
    ),
  ],
  [
    "post",
    "/demo/payments/{id}/repair",
    "Restore the mock connection and retry",
    object({}),
  ],
  [
    "post",
    "/demo/new-visit",
    "Start a new visit after unresolved payments are cleared",
    object({}),
  ],
];
const paths = {};
for (const [method, path, summary, body, access] of routes) {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    in: "path",
    name: m[1],
    required: true,
    schema: str,
  }));
  if (method === "post" && access !== "webhook")
    parameters.push({
      in: "header",
      name: "X-Groundwork",
      required: true,
      schema: { type: "string", const: "1" },
    });
  if (path === "/payments")
    parameters.push({
      in: "header",
      name: "Idempotency-Key",
      required: true,
      schema: { type: "string", pattern: "^[a-zA-Z0-9-]{8,100}$" },
    });
  if (access === "webhook")
    parameters.push({
      in: "header",
      name: "Paystack-Signature",
      required: false,
      schema: str,
      description:
        "Required in timestamped mode; legacy mode explicitly uses x-paystack-signature instead.",
    });
  const mime = path.endsWith(".svg")
    ? "image/svg+xml"
    : path.endsWith(".csv")
      ? "text/csv"
      : "application/json";
  paths[path] ??= {};
  paths[path][method] = {
    summary,
    security:
      access === "public" || access === "webhook" ? [] : [{ session: [] }],
    parameters,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
    responses: {
      [path === "/payments" ? "201" : "200"]: {
        description: "Successful sandbox operation",
        content: {
          [mime]: {
            schema:
              mime === "application/json"
                ? { type: "object", additionalProperties: true }
                : { type: "string" },
          },
        },
      },
      400: { description: "Invalid request" },
      401: { description: "Missing session or signature" },
      403: { description: "Scope, role, origin or capability denied" },
      409: { description: "Conflicting request or stale state" },
      503: { description: "Integration not configured" },
    },
  };
}
const spec = {
  openapi: "3.1.0",
  info: {
    title: "Tavlo Sandbox API",
    version: "0.2.0",
    description:
      "Persistent QR Pay sandbox. Mock POS and payment providers by default. Paystack is test-only. Merchant endpoints require operator scope; mock controls are disabled for Paystack.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "gw_session" },
    },
  },
  paths,
};
await writeFile(
  new URL("../public/openapi.json", import.meta.url),
  JSON.stringify(spec, null, 2) + "\n",
);
console.log("OpenAPI: " + routes.length + " operations");
