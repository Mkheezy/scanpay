# Groundwork QR Pay

A working local backend and visual product presentation for QR bill payment. Payment orchestration, reservations, jobs, sessions and ledger records persist in PostgreSQL-compatible storage. Money and POS behaviour are simulated by default. The Paystack test adapter is implemented but has not been exercised against a merchant sandbox.

## Run the demo

Requires Node.js 22 or later. From this folder:

```sh
npm ci
npm start
```

On this Mac you can also double-click START.command. Open http://127.0.0.1:4310 for the stakeholder presentation, or http://127.0.0.1:4310/sandbox.html#demo for the payment test console. If your shell or process manager terminates npm's child process, run `node --import tsx src/server.ts` directly.

The default database is `.data/groundwork`. It survives restarts. No Docker or database installation is needed. Do not open that embedded database from multiple processes. The API runs its worker in-process; queued jobs are stored durably in the database.

## Present it in three minutes

1. **The idea**: show the table illustration and click through the four-step payment journey.
2. **Live demo**: choose My amount, R250 and a 10% tip. Continue to checkout. Simulate success. The server verifies R275, records R250 principal and R25 tip, and leaves R175 available.
3. Click **Replay event ×3**. One payment remains in the ledger.
4. Return to the bill, pay the remaining amount and choose **Payment succeeds, POS offline** at checkout. The guest sees payment received, while the merchant sees an exception. Click **Restore mock & retry** to record it in the POS.
5. **Under the hood**: show what is built and what needs partner access.

Other scenarios include pending provider confirmation, decline, POS timeout after write and amount mismatch. Mismatches are deliberately held for investigation; automatic repair is disabled. A new visit is blocked while payments are unresolved. Start fresh demo data in a DIFFERENT DATA_DIR if you need a clean mismatch demonstration; keep the old data for investigation.

The QR download is a real SVG containing the configured APP_ORIGIN and an opaque table code. A localhost code only works on this computer. Use a separate/private browser for a guest scan so it does not replace the operator's current guest session cookie. The new-visit action invalidates old visit access without deleting the ledger. Rotation revokes the printed code but does not revoke already-claimed sessions.

## Verify

```sh
npm run check
```

TypeScript strict checking and automated tests cover cents splitting, concurrent reservations, idempotency, repeated callbacks, out-of-order status, POS failures, timeout after write, changed bills, expiry/late success, tenant and guest isolation, QR/visit revocation, refund request deduplication, database restart, signature validation, Paystack request contracts and HTTP authorization.

See docs/VALIDATION.md for observed results and limits.

## Configure

Copy `.env.example` to `.env`, set only the needed values, then run:

```sh
node --env-file=.env --import tsx src/server.ts
```

For ordinary PostgreSQL set DATABASE_URL. The same SQL migration runs on startup. For a separate worker with PostgreSQL, run `npm run worker` with the same environment. Multiple workers claim jobs using row locks and expiring leases. Regular PostgreSQL multi-process behaviour has not been exercised in this environment.

The server binds to loopback by default. Binding elsewhere requires DEMO_ACCESS_KEY; operator login uses that key. This is a sandbox access mechanism, not production identity or MFA. Use HTTPS and set APP_ORIGIN correctly for a remote sandbox. Do not deploy real merchant/customer data or live payment credentials.

## Paystack test integration

Read docs/INTEGRATIONS.md before configuration. Use a merchant's test account and an `sk_test_` key. Set PAYMENT_PROVIDER=paystack, DEMO_MODE=false, DEMO_ACCESS_KEY, APP_ORIGIN and the webhook signing configuration. The current adapter still uses a mock POS, so every POS result is simulated. Merchant funds are never routed through a Groundwork bank account by this code.

## Scope

Implemented: QR Pay, full/equal/custom shares, optional configured tip rates, scoped sessions, integer cents, persistent reservations, payment intent ledger, raw-body authenticated Paystack webhook ingress, server verification, durable jobs, POS read-back on uncertain writes, reconciliation CSV, audit trail, refund-review requests, QR generation/rotation, integration capability gates.

Not implemented: guest ordering, item-level split, live Pilot/GAAP endpoints, production user identity/MFA, merchant onboarding, executed refunds, chargeback workflow, multi-merchant Paystack credential routing, automated privacy retention, backup infrastructure, partner certification or live merchant settlement. Regular PostgreSQL is supported through a driver but only embedded PostgreSQL was exercised here. Do not interpret the sandbox as commercially deployable.

## Project map

- public/: graphic presentation, guest checkout and merchant console
- src/app.ts: HTTP boundaries, authentication, webhook route and QR export
- src/service.ts: reservation and settlement workflow, persistent jobs and reconciliation
- src/providers.ts: mock and Paystack providers, mock POS and disabled partner adapters
- src/schema.sql: initial idempotent PostgreSQL-compatible migration
- src/db.ts: embedded and regular PostgreSQL implementations
- tests/: integration and contract tests
- docs/: API, architecture, partner requirements and operating instructions

The hosted Sites page, if published, is a static presentation. It does not host this Node backend or share its database. Run the local app for the working payment flow.

## Titanium Sequoia Master presentation

The server home page uses the supplied Gemini visualizer directly. Open `http://127.0.0.1:4310/sandbox.html#demo` for the working payment integration, or use the button on the master page. Design preview data is illustrative. See `docs/DESIGN.md` for source mapping and repairs. The standalone `Groundwork_Presentation.html` uses the same master design; its font and image links need internet access.
