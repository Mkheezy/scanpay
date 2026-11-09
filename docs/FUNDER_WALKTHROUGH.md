# Groundwork — five-minute funder walkthrough

## Before the meeting

Run `npm ci --prefix backend`, then `npm run demo` at the repository root. Open the URL printed by the server (default http://127.0.0.1:4310). If another server already occupies that port, use `PORT=4311 APP_ORIGIN=http://127.0.0.1:4311 npm run demo`.

Open the hamburger menu and confirm **Connected demo · orders saved in the database**. Open **Five-minute presenter guide** for the same timed outline inside the presentation. Use Present for fullscreen, or choose light/dark appearance. Make sure internet access is available for the existing fonts and food photographs.

The current Vercel build is a **device-only preview**. It can demonstrate the flow but cannot demonstrate a shared database. Use the local backend for this meeting. No real payment is taken and no real kitchen or till receives these orders. Do not describe demo receipts as live payment verification.

## 0:00–0:40 — The problem

Show Opportunity. Say: “The meal can be finished while the guest is still waiting. Groundwork gives guests a way to order or settle up from their phone, with clear visibility for staff.”

Keep the opening concrete. No invented market size, adoption claims or savings figures.

## 0:40–2:00 — The guest

Choose Experience → Order & pay. Start a new demo order if an old confirmation is showing.

1. Select Double patty and add one Groundwork Wagyu Burger: R260.00.
2. Add two House lemonades: R70.00.
3. Review the basket. Enter “No onions” and select a 12% tip: R39.60.
4. Point to the R369.60 total and place the demo order.
5. Note the unique reference. Refresh the page: the saved confirmation remains.

Say: “The backend prices the basket from its menu. The order and its reference are stored, so a refresh does not lose the order.” The in-progress basket is stored in this browser tab; the submitted order is in the database.

## 2:00–3:15 — The restaurant

Select See the restaurant ticket. Identify the same reference, double patty, two drinks, note and total. Click Start preparing, then Mark ready. Return to Experience through the menu and show Ready for you.

For two screens, keep the guest tab on its receipt and open another tab at the same server’s `/#operations`. The restaurant queue updates every five seconds; the guest status does too while that tab is visible. Each tab keeps its own basket, so the restaurant view cannot replace a guest’s draft.

Say: “This proves our ordering workflow and persistent storage. Production kitchen dispatch and payment settlement still require approved partner integrations.”

## 3:15–4:00 — The business

Show Business. R349 per venue per month is a **pricing hypothesis for the entry QR-pay product**, not validated revenue or a quote that includes provider fees. Ordering is the later expansion opportunity. Integration fees, payment fees, onboarding costs and support effort must be costed with the partners.

## 4:00–5:00 — The ask

Show The pilot. Ask for support for one approved till integration, one payment partner and two restaurants. Agree the investment amount after partner discovery and a costed delivery plan.

Propose measuring guest adoption, median time to pay, matched payments and staff interventions. Agree baselines, thresholds and the pilot duration before launch. The decision after the pilot is whether evidence supports rollout.

## Optional resilience proof

Start another small order. In the basket expand Demo payment and choose Payment declined. Place it. The saved order shows a decline and stays outside Received/Preparing/Ready in the restaurant queue. Refresh the receipt, then Retry demo payment. The same reference is released once into Received. This is a simulated outcome, not a real card decline.

Duplicate-request and lost-response recovery are covered by automated tests; do not intentionally disconnect the meeting network unless you have rehearsed that scenario.

## Questions to answer candidly

- **What works now?** Persistent demo ordering, server-side pricing, idempotent creation, saved receipts, a restaurant status queue, and a separate payment/reconciliation sandbox.
- **What is simulated?** The menu/venue, order payment outcome, kitchen dispatch, and the existing-bill presentation. The ordering database is real storage in connected mode.
- **What remains before launch?** Approved POS and payment partner access, provider sandbox validation, production authentication and operational controls, deployment with a persistent database, and an agreed pilot acceptance plan.
- **Is it deployed?** The GitHub branch contains the code. Vercel email verification is being investigated by support; do not imply the new deployment is live until it has been verified.
