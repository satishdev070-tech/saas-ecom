# Functional Audit

_2026-09-25. "Verified" means exercised at runtime against the real Supabase project, not just read in code._

## Data-flow trace (every feature follows this path)

UI (`useActionState` form) → Server Action → `runAction` → zod `parseInput` → context (`requireTenant` /
`requireStoreTenant` / `requirePlatform`) → permission (`assertPermission`) → Supabase (user session, RLS) or
SQL RPC (`security definer`, re-checks permission) → `audit()` for sensitive actions → typed `ActionResult` → UI.
No bypassed paths found. Secret-key client uses are listed in SECURITY_AUDIT.md.

## Results by feature

| Feature | Result | Notes |
|---|---|---|
| Seller sign-in / register / forgot | ✅ verified | now at `/seller/*`; `/login`, `/signup`, `/forgot-password` 308-redirect (keep `?next`) |
| Platform staff sign-in | ✅ verified | `/admin/login`; non-staff see "No console access"; access decided by `platform_memberships` |
| Post-login routing | ✅ fixed | seller → `/dashboard`, staff without a store → `/admin`, nobody → `/onboarding` |
| Shopper sign-in (password, email code) | ✅ verified | token-hash links now accepted by the store callback |
| Shopper forgot/reset password | ✅ new | `/account/forgot-password`, `/account/reset-password`; recovery link returns to the same store |
| Storefront home / collection / category | ✅ verified | carousels fixed; demo imagery added |
| Filters & sort | ✅ verified | type, size, fabric, occasion, price, availability; sort featured/newest/price/best-selling |
| Search page | ✅ verified | Postgres full-text via `storefront_list_products` |
| Search autocomplete | ✅ new | `GET /search/suggest` → products, categories, collections; recent searches (browser), popular = main menu |
| PDP | ✅ verified | variants, stock, size guide, PIN check, reviews; rating moved under title; SKU shown |
| Add to bag → cart drawer | ✅ new | drawer opens on success; server-rendered lines; free-shipping progress from real rates |
| Cart page | ✅ verified | qty, remove, save for later, coupon, PIN estimate, cross-sell |
| Checkout (COD + online test provider) | ✅ verified | order #1 created, paid, confirmed; prices re-computed server-side |
| Razorpay live | ⚠️ not verified | needs real test keys in Settings → Payments |
| Customer orders / addresses / wishlist | ✅ verified | |
| Seller dashboard home | ✅ new | 30-day KPIs vs previous 30 days, daily chart, recent orders, to-fulfil, low stock, top products, setup checklist; every panel permission-gated |
| Products / variants / inventory CRUD | ✅ routes verified | covered by `save_product` DB tests; upload limit fixed |
| Orders / returns / refunds | ✅ routes verified | refunds call Razorpay only for online payments |
| Theme editor | ✅ verified | preview now true-width and scaled; draft/publish/rollback |
| Analytics | ✅ fixed | chart zero-filled across the range |
| Super admin: tenants | ✅ improved | owner, products, orders, GMV columns (one set-based RPC) |
| Super admin: plans, flags, domains, audit, support | ✅ routes verified | |
| Email sending (Resend) | ⚠️ not verified | logs instead of sending until `RESEND_API_KEY` is set |
| Shiprocket, Cloudflare custom hostnames | ⚠️ not verified | need live accounts |

## Mock / placeholder sweep

Searched for `mock|dummy|fake|placeholder|TODO|FIXME|lorem|sample|console.log`:

| Hit | Verdict |
|---|---|
| `src/app/dashboard/page.tsx` "Placeholder home" | production gap → **replaced** with real overview |
| `marketing-site/content.ts` `SAMPLE_METRICS` | intentional: labelled on the page as illustrative figures for a sample store |
| `notification-templates.ts` `SAMPLE_VALUES` | intentional: email template preview values |
| `lib/observability/logger.ts` `console.log` | intentional: the logger's sink |
| Seed data (`supabase/seed.sql`) | dev-only, header says "Never run against production" |

## Tests

- Unit: 22 files, 229 tests (added `zeroFillDays`).
- DB/RLS: 74 tests (added admin tenant stats, shopper↔shopper isolation, shopper → seller/platform denial).
- Not automated: browser end-to-end flows (checkout, drawer, search overlay). These were exercised manually in this audit; a Playwright suite is a recommended next step.

## Known limitations

- Guest wishlist is not supported (sign-in prompt instead).
- Cart drawer subtotal is indicative; discounts, shipping and tax are recalculated at checkout (by design, ADR-015).
- The dashboard's "payments" checklist step reads COD status only, because online payment settings are server-only (no RLS read policy).
