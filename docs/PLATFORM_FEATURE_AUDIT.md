# Platform feature audit (phase 3)

_2026-09-26._ Status key: ✅ built and tested here · 🟡 built, needs live provider or cloud
verification · ⛔ not built / out of scope. "Tested" means unit and/or Postgres tests plus a
production build. Nothing here was run against live payment, courier or social APIs.

## Before phase 3 (starting point)

- Razorpay only (platform-wide settings table), COD. Shiprocket through **platform** env credentials, with no tracking, label, pickup or cancel.
- Admin tenant list: name/slug search only, no revenue/customers/activity/domain columns, no sorting or date filters.
- Seed-only super admin (`admin@paliya.test`).
- GA4 and Pixel IDs were collected in store settings but **never injected** into the storefront. No e-commerce events, no attribution.
- SEO: per-item title and description, sitemap, robots, Product/Breadcrumb/Organization/BlogPosting JSON-LD, redirects. No store SEO page, verification, canonical override or WebSite JSON-LD.
- One theme (Aangan) plus the editor. No marketplace. No social or creative features. Settings scattered in the sidebar.

## Result

| Area | Item | Status |
|---|---|---|
| Super admin | Env-based bootstrap script, no hard-coded credentials | ✅ (input validation run; live account creation left to the operator) |
| | `/admin/stores`: all columns, server search (name/slug/owner/domain/tenant ID), filters, sort, pagination | ✅ DB-tested (`platform_list_stores`) |
| | Store detail: overview, usage, commerce, configuration (theme/payment/shipping/analytics/social status), activity | ✅ |
| | Store actions with reason + audit; read-only time-boxed support access | ✅ (existing, re-checked) |
| | Store integrations overview (no secrets) | ✅ |
| RBAC | Every new action checks a matrix permission; RLS on new tables | ✅ DB-tested |
| Theme marketplace | 10 themes, token-driven previews, live demo links, apply-to-draft keeping content, customise, publish, rollback | ✅ unit-tested for all 10 |
| Payments | Razorpay, Cashfree, PayU adapters; COD independent (fee, min/max, PIN rules) | 🟡 signatures/hashes unit-tested; live gateways unverified |
| | Encrypted secrets, masked UI, test-before-connect, honest statuses | ✅ |
| | Webhooks `/api/webhooks/{razorpay,cashfree,payu}`, dedupe, idempotent mark-paid, refunds | 🟡 |
| Shipping | Shiprocket (per store) + Delhivery; serviceability, create, label, tracking, pickup, cancel; default courier | 🟡 Delhivery mapping unit-tested |
| SEO | Store SEO page, verification, default OG image, product canonical + noindex, WebSite JSON-LD | ✅ built; ⏳ visual QA |
| Analytics | GA4, Google Ads conversion, Meta Pixel per store; 15 of 16 events; UTM/gclid/fbclid → order + customer | ✅ helpers tested · refund event ⛔ (needs Measurement Protocol secret) |
| Social | OAuth Meta (FB Page + IG), Pinterest, YouTube (connect only); encrypted tokens; composer; schedule cron; statuses; retry | 🟡 no platform apps configured here · YouTube publishing ⛔ |
| Creative studio | Template engine (versions, layers, brand kit), 9 templates, PNG render to media library | ✅ render tested |
| Settings centre | Grouped settings navigation (General, Theme, Domains, Payments, Shipping, Taxes, SEO, Analytics, Social, Notifications, Team, Roles, Security) | ✅ |
| Feature flags | 9 new flags, checked server-side | ✅ |
| Audit | All listed sensitive actions audited; owner-facing activity page | ✅ |

## Needs your action

1. **Apply `supabase/dev/apply-phase3.sql`** in the Supabase SQL Editor (tested on a copy of the phase-2 schema with seed data). Until then, gateways read as "not connected" (checkout offers COD only), saving integration settings fails, and the social, creative and marketplace pages can't save.
2. Run `pnpm admin:bootstrap` with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_INITIAL_PASSWORD` for a real super admin.
3. Add a cron for `GET /api/cron/social-publish` every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
4. Optional: create Meta, Pinterest and Google OAuth apps and set their env vars (see `.env.example`) and redirect URIs.
5. Re-enter Razorpay keys once in the new Payments page, so they move to the unified encrypted store (they keep working meanwhile).
