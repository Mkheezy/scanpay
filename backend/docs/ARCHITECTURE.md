# Architecture and operational boundaries

The web app and Express API share an origin. A scoped HTTP-only SameSite cookie binds each guest to a venue, check and visit. The initial mock dataset has two venues and twelve tables each. Operator endpoints additionally require a merchant or demo-admin role. Demo admin is enabled only in mock demo mode; non-loopback operation requires a configured access key. This is not production authentication.

A payment request locks the check row, validates its revision and available balance, calculates integer cents, inserts a reservation and verification job, and commits. The same session/idempotency key returns the same payment, while changed payloads are rejected. Server-derived values determine checkout amount; a client cannot mark funds verified.

Payment state has separate funds and POS dimensions. Funds may be pending, verified, failed or reversed. POS state may be not sent, queued, posted, retry or review. Refund requests are a separate record and never masquerade as refunded money. Both verified and unconfirmed reserved principal reduce the available bill; tips do not reduce it. A timer alone never releases an uncertain payment.

The worker claims persisted jobs with FOR UPDATE SKIP LOCKED and an expiring lease. Temporary errors use bounded exponential backoff; after five failures they reach review. Pending provider status is polled without treating it as a transport failure. A process restart resumes eligible jobs. Production monitoring must alert on job age, lease expiry, dead jobs and unresolved financial value.

POS posting checks the external reference before writing and reads it back afterwards. Mock POS has a unique reference constraint. Vendor adapters must implement an equivalent certified contract; exactly-once business effects cannot be promised merely by adding retries around an undocumented API.

PGlite embeds PostgreSQL locally and serializes operations through one transaction lane. It is a single-process development database, not a supported multi-process production store. The regular PostgreSQL driver uses pooled transactions and check-row locks. The SQL schema is shared, but regular PostgreSQL concurrency and deployment need a separate run before promotion.

Security implemented: same-origin write guard, explicit request header, bounded JSON size, basic per-process rate limiting, scoped hashed session tokens, no-store API responses, restrictive content security policy, hosted checkout, test-only Paystack keys, signed raw-body webhooks, event deduplication and server verification. No secrets are checked into source. Webhook payload fingerprints are stored instead of card-bearing raw payloads.

Remaining production controls: real merchant identity and MFA, CSRF/access review against deployed topology, distributed rate limits, visit activation policy, merchant credential routing, secret rotation, roles and support-access audit, database backup/PITR and restore drills, retention/deletion policy, payment/dispute/refund ownership, vendor agreement and independent security review. A permanent photographed QR can still be claimed while its current mock visit is open; staff activation is not yet implemented.

## Operating the sandbox

- Pending payment: wait for confirmation or use the mock recovery control. Never initiate a replacement solely because the browser timed out.
- POS unavailable: money remains verified, the reservation remains, the worker retries. Restore mock connection and queue a retry. No new charge occurs.
- POS timeout after write: lookup by reference recovers the saved post rather than inserting another payment.
- Mismatch, changed bill, closed visit, late success or reversal: block automatic repair and investigate. No automatic refund or balance reassignment.
- Refund request: record for authorised provider handling. This build does not execute it or adjust settlement balances.
- New visit: requires no unresolved reserved payment. Old sessions cannot read the new bill; historical ledger entries remain.
- QR rotation: invalidates the old printed URL; current sessions remain scoped to their existing visit.

Back up the embedded directory only with the server stopped. Do not copy a live database and assume the snapshot is consistent. For production use PostgreSQL with independently tested backup and restore procedures.
