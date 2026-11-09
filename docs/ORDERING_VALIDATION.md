# Ordering validation — 9 November 2026

## Automated checks

`npm run check`: 21 passing tests (10 menu/basket tests, 8 persistence/client recovery tests, 3 presentation packaging/parity checks).

`npm run test:backend`: TypeScript passes; 27 passing backend tests (9 durable ordering tests and 18 existing payment/reconciliation tests).

`npm run build`: creates the seven configured website assets in public/. A clean-checkout test verifies output and removes stale files on rebuild. Backend public assets match site/ exactly.

Ordering coverage includes server-side prices, modifiers, quantities, note/tip validation, eight concurrent duplicate requests, changed-payload rejection, lost response followed by client reload, safe storage failure, per-tab basket isolation, failed-payment retries, tenant/session/merchant access boundaries, cross-origin rejection, invalid status transitions, demo-mode shutdown, and receipts/statuses surviving database close/reopen.

The existing payment suite covers provider verification, duplicate webhooks, reservations, till outages, timeout after POS write, amount mismatches, stale checks, signatures, refunds and restart recovery. No live provider credentials were used.

## Browser verification

Connected local demo tested at http://127.0.0.1:4311 with a separate persistent data directory (.data/ordering-demo):

- Burger with double patty (R260.00), two lemonades (R70.00), 12% tip (R39.60): R369.60 total. “No onions” note preserved.
- Basket quantities, modifiers, note and tip survived refresh before submission.
- Saved confirmation and unique reference survived refresh after submission.
- Restaurant queue showed the same reference, items, modifiers, note and total.
- Received → Preparing → Ready saved successfully. Guest confirmation reflected the updated state.
- A separate lemonade order with a simulated decline appeared under Payment attention, outside all three kitchen columns. Reload and retry retained the same reference and released it into Received.
- Desktop glass queue and dark presenter guide inspected visually. Mobile 390px static preview inspected with no horizontal overflow.

## Presentation boundaries

The connected ordering demo uses actual PGlite/PostgreSQL storage, but its payment outcome is deliberately simulated. Demo orders are separate from the payment ledger and are never sent to a real POS or kitchen. Merchant/guest controls share the demo session for presenting; production identity and role management remain future work.

The static Vercel build has no backend. It displays Device-only preview, uses local storage for its restaurant queue, and session storage for per-tab drafts/receipt pointers. Closing a tab can discard its draft; submitted connected orders remain in the database. Clearing browser storage removes preview records. The queue presents the latest 100 database records, not a complete reporting/export facility.

Guest/restaurant updates poll every five seconds while visible. This is a demo workflow, not a production push-notification service. Order cancellation, stock availability, refunds for orders, production payment processing and real kitchen dispatch are not implemented.

The separate Pay existing bill presentation remains illustrative. The existing backend payment console is at /sandbox.html#demo.

## Vercel configuration

The project must use the repository root (blank Root Directory), Other framework, Node 22.x, npm run build, and public output. The prior backend root conflicted with .vercelignore and caused the empty-public failure. Settings were corrected. Redeployment is awaiting resolution of Vercel email verification; support has acknowledged the missing-code report.
