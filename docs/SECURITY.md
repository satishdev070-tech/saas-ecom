# Security

Baseline audit: [SECURITY_AUDIT.md](SECURITY_AUDIT.md). This page lists the controls added or
extended in phase 3.

## Tenant isolation

- Storefront tenant = verified host. Dashboard tenant = the member's active membership. Admin = platform membership. No handler takes a tenant id from the request.
- New tenant tables (`social_posts`, `creatives`) have RLS by permission. Media paths are constrained by `app.paths_in_tenant` / path-prefix checks, and cross-tenant rows are rejected (DB tests).
- Webhooks resolve the store by host, then verify with that store's secret.

## Secrets and credentials

- Gateway, courier and OAuth credentials: AES-256-GCM in `tenant_integrations.secrets_encrypted`. Key derived per purpose from `APP_SECRET` (HKDF). The table is unreachable by anon and authenticated roles.
- The UI gets last-4 hints only. Secrets are never logged (logger redaction plus our own error text), never in API responses, never sent to the browser.
- Super admin credentials come from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_INITIAL_PASSWORD` via a server script only. Nothing is hard-coded.
- The admin integrations page selects status columns only.

## Payments

Server-side verification on every path, amount checks, idempotent `svc_mark_order_paid`,
signature/hash verification with timing-safe compares, webhook dedupe (`webhook_events`),
Cashfree timestamp tolerance, provider idempotency keys. No live transactions in tests.

## OAuth

Signed, expiring, browser-bound state (HMAC + httpOnly nonce cookie), same user + same store
check on callback, error codes only in redirects (no reflected text), tokens encrypted, refresh
handled server-side, expiry and revocation surfaced as `expired`, all connection changes audited.

## Output safety

- JSON-LD escaped. Tracking IDs regex-validated twice before inline scripts.
- Creative SVG text XML-escaped, colours hex-only, image hrefs restricted to store assets or data URIs.
- Attribution cookie treated as untrusted and sanitised before storage.

## Abuse limits

Rate limits: integration tests (20 / 10 min / store), courier API (60 / 10 min), social publish
(30 / h), creative renders (60 / h), plus the existing checkout, auth and cart limits.

## Audit events added

`integration.{kind}_{updated|enabled|disabled|disconnected}`, `integration.tested`,
`integration.social_connected`, `integration.default_courier_changed`, `theme.marketplace_applied`,
`settings.seo_updated`, `order.pickup_requested`, `order.shipment_cancelled`,
`social.post_{saved|scheduled|published|failed|cancelled}`, `creative.created`,
`platform.super_admin_bootstrapped`. Store owners see these at **Settings → Security & activity**.

## Open items

Full CSP with nonces (ADR-018) is still open. The new third-party script origins to allow are
googletagmanager.com, connect.facebook.net and sdk.cashfree.com.
