# Payment integrations

Each store connects its **own** gateway accounts at **Settings → Payments**. Shoppers choose from
every enabled gateway on the pay page. COD is configured separately (Settings → Shipping & COD).

| Provider | Credentials | Order creation | Payment confirmation | Webhook | Refunds |
|---|---|---|---|---|---|
| Razorpay | Key ID, Key Secret, webhook secret | `POST /v1/orders` | Checkout signature (HMAC-SHA256 `order_id|payment_id`) **and** `GET /v1/payments/{id}` | `/api/webhooks/razorpay` (`X-Razorpay-Signature`) | `POST /v1/payments/{id}/refund` |
| Cashfree PG | App ID, Secret Key, environment | `POST /pg/orders` (`x-api-version: 2025-01-01`, idempotency key) | `GET /pg/orders/{id}` after return (`order_status = PAID`, amount check) | `/api/webhooks/cashfree` (base64 HMAC-SHA256 of `timestamp + body`, 10-min tolerance) | `POST /pg/orders/{id}/refunds` |
| PayU | Merchant key, Salt (v1), environment | Hosted checkout form POST with SHA-512 request hash | Reverse hash check on `surl/furl` **and** `verify_payment` postservice | `/api/webhooks/payu` (reverse hash) | `cancel_refund_transaction` |
| COD | — | — | Marked paid on delivery | — | Manual |

## Going live checklist (per store)

1. Settings → Payments → enter the keys → **Save & test connection**. The first successful test switches the gateway on
   (a gateway the seller later switches off stays off on re-save). The banner at the top says whether online payment is live.
2. Add the webhook URL shown on the card in the gateway dashboard.
3. Live mode: Razorpay needs the store website approved; Cashfree needs the store domain whitelisted
   (Developers → Whitelisting), otherwise order creation is refused.
4. Checkout shows "Pay online · secured by <gateway>"; the pay page lists every live gateway.

Each gateway is gated only by its own plan flag (`online_payments` = Razorpay, `payments_cashfree`, `payments_payu`).
Before 2026-10-11 the Razorpay flag also hid Cashfree/PayU at checkout; fixed in `checkout/payment-options.ts`.

## Transactions (Dashboard → Payments)

`/dashboard/payments` (permission `orders.read`, RLS `payments_staff`) lists every gateway attempt from `payments`:
gateway, method, status (started / successful / failed / refunded), gateway order and payment ids, linked order. Totals for
the filtered set (collected, success rate, per gateway), refunds in the period, filters (gateway, status, dates, search by
order number or gateway id) and an audited, rate-limited CSV export (`/dashboard/payments/export`).

## Rules

- **The browser never marks an order paid.** Every path (return URL, redirect, webhook) re-verifies with the gateway's server API and checks the amount, then calls `svc_mark_order_paid`, which locks the order row and is idempotent.
- **Webhooks** resolve the store from the request host, verify the signature with that store's secret, and dedupe on `webhook_events (provider, event_id)`. Duplicate deliveries are acknowledged and ignored.
- **Secrets** live in `tenant_integrations.secrets_encrypted` (AES-256-GCM, key derived from `APP_SECRET` via HKDF). The table has RLS on and no policies, so only server code with the secret key can read it. The UI shows only the last four characters. Secrets are never logged, returned or sent to the browser. Blank secret fields on save keep the stored value.
- **Status is never faked:** saving credentials runs a read-only test call (Razorpay `GET /orders?count=1`, Cashfree `GET /orders/{random}` where 404 means valid, PayU `verify_payment` on a dummy txnid). The integration is `connected` only if that test passes, and can be enabled only when connected. Errors are our own wording and never echo provider payloads.
- Existing Razorpay settings were migrated from `tenant_payment_settings` (kept readable until the next save).
- Feature flags `online_payments`, `payments_cashfree`, `payments_payu` gate each provider per plan/store.
- Automated tests use signature fixtures and mocked HTTP only; **no live transactions** are run.

## Webhook URLs

Shown on the Payments page for the store's primary domain: `https://{store-domain}/api/webhooks/{razorpay|cashfree|payu}`.
Razorpay events: `payment.captured`, `payment.failed`, `refund.processed`. Cashfree also receives `notify_url` on every order.

## Not verified in this environment

Live and sandbox calls to all three gateways (no merchant accounts here). Signature and hash code
is unit-tested against documented algorithms (`tests/unit/commerce/gateway-signatures.test.ts`).
