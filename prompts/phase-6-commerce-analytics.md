# Phase 6 — Commerce & analytics (Release R4)

**Precondition:** D-007 (provider + markets), D-008 (refund access), D-029 (tax/GST/invoices) are **Confirmed** by the
owner. If not, build only Slices 6.4–6.6 (analytics) and stop commerce work with a decision report.

## Message to send

```text
Start Phase 6 from prompts/phase-6-commerce-analytics.md. First show me the status of D-007, D-008, D-027 and D-029.
Do not implement any payment code until those are Confirmed. Plan the first permitted slice.
```

## Read first

Spec §14, §15 · `docs/ACCEPTANCE_TESTS.md` "Commerce" · `docs/METRICS.md` · legacy inventory §Commerce · the chosen
provider's current official docs for hosted checkout, webhook signature verification, idempotency and refunds
(read them; do not rely on memory).

## Slices

### 6.1 Offers, prices, orders (no provider yet)
Offer/Price per course (minor units + currency), tax display rule per D-029, order + lines created server-side with
idempotency key, order state machine (pending → paid/failed/cancelled → refunded/partially_refunded).
**AC:** amount/currency computed server-side; client-sent price ignored; state transitions unit-tested.

### 6.2 Provider adapter + hosted checkout + webhooks
`PaymentProvider` implementation for the chosen provider (test mode only), redirect to hosted checkout, webhook
endpoint with signature verification, `ProviderEvent` dedup on `(provider, eventId)`, idempotent processing,
Entitlement → Enrollment(source=purchase) only on verified paid event.
**AC:** forged/unsigned webhook rejected; same event delivered twice → one transition, one enrollment; tampered return
URL grants nothing; no card data stored or logged.

### 6.3 Refunds + reconciliation
Admin refund action → provider → event → order/refund state → access policy (D-008); learning evidence preserved;
order search + reconciliation view (provider txn ID, amount, currency, state); learner order history.
**AC:** refund behaviour matches policy; all money actions audited.

### 6.4 Metric dictionary + standard analytics
Complete `docs/METRICS.md`; implement metrics as tested functions; dashboards for tenant/branch adoption, enrollment
funnel, completion, pass rate, compliance, attendance, revenue (if commerce on).
**AC:** each dashboard number equals the equivalent filtered report within the refresh window (test).

### 6.5 Governed report builder + saved reports
Approved dimensions/metrics/filters/group-bys, bounded ranges, validation errors; save, rename, duplicate, rerun,
share (never beyond recipient's scope), export via the Phase 5 export pipeline.
**AC:** no arbitrary SQL path exists; shared report run by a narrower-scoped user returns only their scope.

### 6.6 Platform subscription overview (only if D-027 Confirmed)
Tenant plans, usage, subscription status on the platform dashboard.

## Exit gate

MASTER_PROMPT §10 steps 12–14 pass · `security-reviewer` focused on payments + reporting · owner demo in provider test mode.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 6 / spec sprint 5; commerce gated on Confirmed decisions.
