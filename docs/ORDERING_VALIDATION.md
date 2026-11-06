# Ordering demo validation — 7 November 2026

The stakeholder demo now supports two journeys in Experience: Order & pay (default) and Pay existing bill. Ordering is a browser simulation, separate from the persistent payment backend. No kitchen order or payment is submitted to an external service.

## Automated validation

- 10 Node test-runner tests pass for the ordering model: integer-cent prices, modifier totals, quantity bounds, item removal, tip choices, invalid item/modifier rejection, duplicate configuration merging, immutable receipts, repeated-submission idempotency, kitchen note limits, and independent new orders.
- Backend TypeScript checking passes.
- All 17 existing backend integration/security tests pass.
- Frontend JavaScript syntax and static build pass.
- GitHub Actions runs the demo checks, backend checks and Vercel build on pushes and pull requests. Remote CI results must be checked separately from these local results.

## Browser verification

Verified in the in-app browser at desktop size and 390px mobile width:

1. Empty basket cannot proceed.
2. Burger + double patty is R260.00; adding two R35.00 lemonades gives R330.00.
3. A 12% tip adds R39.60, for a total of R369.60.
4. Kitchen note survives tip changes and appears on the simulated restaurant ticket.
5. Confirmation and restaurant view carry the same R330.00 principal, R39.60 tip, quantities and modifiers.
6. Pay existing bill remains usable after ordering.
7. Removing the final basket item disables submission and basket review.
8. Dark mobile layout has no horizontal page overflow (390px viewport and document width), and menu/basket content scrolls inside the phone.
9. No browser console errors were observed in this run.

The module stores only in-memory demo state; refreshing the page starts a fresh demo. The basket remains available when switching between journeys within the page. The original Gemini photography is retained.

## Navigation and glass revision — 7 November 2026

Re-ran all 27 automated tests and backend TypeScript checking successfully. Verified the hamburger menu on desktop and at 390px in both appearances, navigation and journey selection, automatic menu dismissal, Escape closure with aria-expanded reset and focus returned to the menu button, and basket retention when changing appearance. The mobile document remained 390px wide. The glass treatment uses translucent backgrounds, backdrop blur, saturation and specular borders, with a reduced-transparency fallback.
