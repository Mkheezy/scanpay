# API overview

Base: same-origin `/api`. JSON responses. Write requests require `X-Groundwork: 1` and a matching Origin when supplied. Session cookies are HTTP-only. Errors use `{code,message,correlationId}` for application errors. Basic rate-limit and origin-rejection errors may omit correlationId.

| Method | Route | Access / behaviour |
|---|---|---|
| GET | /health | Dependency check, storage and provider mode |
| GET | /capabilities | Adapter status; no credentials |
| POST | /demo/start | Mock-only demo operator session; configured access key required when set |
| POST | /merchant/login | Operator key from server environment; sandbox only |
| POST | /tables/:code/claim | Claim an active opaque table code; scoped guest cookie |
| GET | /bill | Current guest's visit and authoritative available amount |
| POST | /payments | Guest; Idempotency-Key header; mode, amountCents or people, tipPercent, revision, optional provider email |
| GET | /payments/:id | Only the originating guest session may read the payment |
| POST | /payments/:id/verify | Originating guest; queues server verification |
| POST | /webhooks/paystack | Raw JSON, configured provider signature; exempt from browser header guard |
| GET | /merchant/dashboard | Operator's venue ledger, jobs and audit trail |
| GET | /merchant/reconciliation.csv | Operator-scoped export |
| POST | /merchant/payments/:id/retry | Queue retry; prohibited for investigation-only mismatch cases |
| POST | /merchant/payments/:id/refund-request | Records a deduplicated refund-review request, not an executed refund |
| GET | /merchant/tables | Operator's venue tables |
| GET | /merchant/tables/:id/qr.svg | Real SVG QR with configured application origin |
| POST | /merchant/tables/:id/rotate | Revoke old public code |
| POST | /demo/payments/:id/outcome | Mock-only, originating guest; changes simulated provider state and queues event |
| POST | /demo/payments/:id/repair | Mock-only operator; restores provider/POS mock then retries |
| POST | /demo/new-visit | Mock-only operator; preserves history and invalidates old visit access |

Payment request example:

```json
{"mode":"custom","amountCents":25000,"tipPercent":10,"revision":1}
```

A payment contains amount_cents, tip_cents, currency, reference, checkout_url, funds_state, pos_state, reservation and optional review_reason. The backend is authoritative. Money is bounded integer cents; monetary sums in the database are cast to integer within the sandbox's supported range. Scale/limit validation must be revisited for production volumes.

POST /payments is request-idempotent with payload matching. Refund requests are deduplicated per payment, worker posting is deduplicated by provider reference, and verification/event ingestion is deduplicated. QR rotation and visit creation are operator actions, not globally request-idempotent APIs. The operation catalogue and request schemas are in public/openapi.json (OpenAPI 3.1). Response schemas are intentionally permissive and must be tightened before generating production clients. Regenerate with node scripts/openapi.mjs.
