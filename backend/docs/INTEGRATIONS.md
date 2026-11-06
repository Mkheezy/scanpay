# Integration status and setup

Checked against official documentation on 6 November 2026.

| Integration | Implemented | Remaining evidence |
|---|---|---|
| Mock POS | Persistent external payments, capability flags, lookup by reference, outage and timeout-after-write controls | None for the controlled demo; this is not a vendor integration |
| Mock PSP | Checkout URL, durable provider state, success/pending/failure/mismatch controls | No real money moves |
| Paystack test | Initialize, verify, hosted checkout redirect, raw signed webhook ingress, server-side amount/currency/reference/environment match | Merchant test credentials, reachable callback/webhook endpoint and real sandbox certification run |
| Pilot | Disabled adapter implementing the capability contract | Approved docs, exact product/version, sandbox, external-payment posting and idempotent lookup contract, commercial terms |
| GAAP | Disabled adapter implementing the capability contract | Approved API family, exact product/version, sandbox, write/lookup scope and certification |

## Paystack

Initialize uses POST https://api.paystack.co/transaction/initialize with server-owned amount in cents, ZAR, a fixed unique reference, guest email and configured callback URL. Verify uses GET /transaction/verify/:reference. Only `sk_test_` credentials and verified `domain=test` results are accepted. Browser callback query parameters never mark a payment verified.

Webhook endpoint: POST /api/webhooks/paystack. Its raw JSON body is authenticated before parsing and stored as a minimal event fingerprint/reference, then a durable verification job is queued before acknowledging. Card fields and full provider payloads are not persisted.

Default signature mode is `timestamped`: configure PAYSTACK_WEBHOOK_SECRET with the whole `whsec_` value. It verifies the Paystack-Signature header, the timestamp-plus-raw-body SHA512 signature and a 300-second freshness window. Legacy mode must be explicitly selected with PAYSTACK_SIGNATURE_MODE=legacy; it validates x-paystack-signature using the API secret. There is no automatic downgrade. Legacy signatures have no timestamp, so persistent event deduplication and independent status verification remain essential. Rotation configuration for multiple simultaneous secrets is a future extension.

This build polls pending intents through durable jobs because failure events are not assumed. Unknown, abandoned or overdue states retain their reservations until verified or reviewed. This favours avoiding a second charge over silently making the balance payable again. A confirmed failure releases the reservation. Late success after release is flagged for review and is not blindly posted.

Network uncertainty during initialization retains the same reference and reservation. No automatic second initialize/charge is performed. Verification jobs are created in the same transaction as the reservation, so a process crash cannot orphan an intent without a reconciliation job. A provider lookup that remains unavailable reaches operator review after retries.

Only one Paystack test credential is configured per server. The second seeded venue exists to test tenant isolation; it is not an implemented multi-merchant settlement model. Configure commercial merchant ownership and credential routing before building a live multi-tenant payment deployment.

## Partner questionnaire

For one named restaurant and exact POS version, obtain:

1. Approved read-check/table endpoint, authentication, pagination and rate limits.
2. External payment posting with amount, currency, tip, original check ID and our unique reference.
3. Lookup by that reference, or equivalent supported deduplication and uncertain-write recovery.
4. Partial payment behaviour, bill revision semantics, other staff payments and check closure/reopening behaviour.
5. Menu/order/held-order semantics only when ordering is being added.
6. Sandbox, test site, integration owner, licence/API/certification fees and go-live criteria.

Do not infer any vendor endpoint from a marketing integration listing. `POS_PROVIDER=pilot` or `gaap` fails closed for bill access and payment creation.

## Sources

- https://paystack.com/docs/payments/accept-payments/
- https://paystack.com/docs/payments/verify-payments/
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/api/transaction/
- https://pilot.co.za/integrations/
- https://gaap.co.za/3rd-party-integration/
