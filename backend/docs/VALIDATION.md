# Validation record

6 November 2026

`npm run check`: strict TypeScript checking passed and 17 tests passed on Node 22.11.0 using disk-backed PGlite. Tests include a database close/reopen recovery run and HTTP authorization checks. Paystack contract tests use an injected HTTP stub, not the provider sandbox.

Browser verification: R250 custom share plus 10% tip created checkout for R275; completion returned VERIFIED / POSTED; merchant totals showed R250 principal, R25 tips and R175 remaining. Replaying the same event three times left one ledger entry. Desktop presentation layout reviewed at 1440 pixels. Mobile layout reviewed at 390 pixels with no horizontal page overflow in overview or live demo. Browser POS-outage scenario verified R175 funds while POS remained at R250; repair brought POS total to R425 and exceptions to zero. A new visit restored the R425 sample bill while preserving the ledger.

Limits: no real merchant credentials, no Pilot/GAAP SDK or approved API documentation, no regular PostgreSQL service or Docker available, no live payment, no production load test, no independent security/accessibility audit. The embedded queue tests establish local recovery behaviour, not vendor or multi-process certification.
