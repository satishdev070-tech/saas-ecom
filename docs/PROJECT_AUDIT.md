# Project Audit — The Paliya

_Audit date: 2026-09-25 · Method: code read-through + runtime testing against the real Supabase project
(dev and production builds), browser walkthroughs of storefront, seller dashboard and super admin._

Companion documents: [FUNCTIONAL_AUDIT.md](FUNCTIONAL_AUDIT.md) · [UI_UX_AUDIT.md](UI_UX_AUDIT.md) ·
[SECURITY_AUDIT.md](SECURITY_AUDIT.md) · [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

## 1. Current architecture

Modular monolith: one Next.js 16 App Router app, three surfaces split by **hostname**, one Supabase project.

```
Browser ─► (Cloudflare Worker for custom domains, optional) ─► src/proxy.ts
           host classify · strip x-paliya-* · session refresh · framing headers
           ├─ platform host  → marketing, /seller/*, /dashboard, /admin
           └─ store host     → rewrite to /store/{host}/…  (seller/admin paths 404)
App Router ─► feature services (src/features/*/server) ─► Supabase (user session ⇒ RLS)
                                                        └► secret-key client only for ADR-006 cases
```

- **Data flow for mutations:** form → Server Action → `runAction` → `parseInput` (zod) → `requireTenant`/`requireStoreTenant`/`requirePlatform` → permission check (`matrix.ts`) → Supabase RPC/table (RLS) → audit → typed `ActionResult` → `useActionState` UI.
- **Schema:** 14 migrations, 66 tables, 49 SQL functions, RLS on every table, composite `(tenant_id, id)` FKs.
- **Size:** ~36k lines TS/TSX in 370 files; 23 theme section types; 93 pages.

## 2. Completed functionality (verified at runtime)

| Area | Evidence |
|---|---|
| Host routing / tenant resolution | store hosts resolve; unknown hosts 404; seller/admin paths 404 on store hosts |
| Storefront browse | home, collections, categories, filters, sort, PDP with variants/stock/PIN check, search |
| Cart & checkout | add/update/remove, coupon, shipping by PIN, COD + online (test provider); a real order (#1) was placed, paid and confirmed |
| Customer account | sign-in (password and email code), profile, orders, addresses, wishlist, sign-out |
| Seller dashboard | all 24 routes render with data; products, orders, inventory, theme editor, settings |
| Super admin | all 13 routes render; tenants, plans, flags, domains, audit, support sessions |
| Database security | 74 RLS/SQL tests pass on Postgres 17 (was 71) |

## 3. Partially completed functionality

- **Theme editor**: works (sections, settings, draft/publish/rollback) but reorder is up/down buttons, not drag and drop.
- **Mega menu**: dropdowns render menu children with optional images; no "featured product" or promo tile slot.
- **Analytics**: real SQL reports; no date comparison beyond the new dashboard home.
- **Reviews**: submit, moderate, stars, verified flag; no photo reviews and no rating-distribution bar chart.
- **Wishlist**: works for signed-in shoppers; no guest wishlist (signed-out users are asked to sign in).

## 4. Missing functionality

- Media library screen (the `media_assets` table and upload pipeline exist; there is no UI to browse, search or delete).
- Drag-and-drop section reordering in the theme editor.
- Subscription billing for seller plans (out of scope per the original plan).
- Photo reviews; guest wishlist; "Occasion" as a first-class menu or taxonomy.
- Full CSP with script nonces (ADR-018).

## 5. Broken functionality found (all fixed unless noted)

| # | Problem | Fix |
|---|---|---|
| B1 | Every page 500'd: DB not migrated, `SUPABASE_SECRET_KEY`/`APP_SECRET` missing | `.env.local` + `supabase/setup-all.sql`; you ran it |
| B2 | Seed users could not sign in on hosted Supabase (NULL GoTrue token columns) | seed sets them to `''` |
| B3 | Seed not re-runnable, so it doubled menus, FAQs, reviews, shipping rates and stock movements (duplicate nav items) | seed made idempotent; `supabase/dev/cleanup-duplicate-seed.sql` **still needs to be run by you** |
| B4 | Hero and product carousels collapsed (grid auto-columns × child % widths) | `.sf-scroll-row` is now flex |
| B5 | Image uploads over 1 MB failed (Server Action default body limit) | `bodySizeLimit`/`proxyClientMaxBodySize` 25 MB |
| B6 | Platform admin logging in was forced into creating a store | post-login landing by role; platform staff → `/admin` |
| B7 | Dashboard home was a placeholder ("Welcome, …") | real overview built |
| B8 | Revenue chart drew one full-width bar (sparse days) | zero-filled series + shared chart |
| B9 | Store auth callback ignored `token_hash` links | both link formats supported |
| B10 | Home "Our story" link → 404 (no About page) | demo script creates `/pages/about` |
| B11 | Theme preview showed the mobile layout in "Desktop" mode | preview renders at 1280 px and scales to fit |

## 6. UI/UX issues → see [UI_UX_AUDIT.md](UI_UX_AUDIT.md)

## 7. Database / RLS issues

- No isolation defects found. Added tests for shopper↔shopper isolation (orders, addresses, wishlist,
  customers; read, update, delete, insert) and shopper → seller/platform data.
- `tenant_payment_settings` has RLS enabled with no policies (deliberately server-only). Correct, but it means
  any user-session read returns nothing. The dashboard checklist relies on COD status for that reason.
- New migration `20260925001100_admin_tenant_stats.sql` (set-based stats for the admin tenant table).

## 8. Security issues → see [SECURITY_AUDIT.md](SECURITY_AUDIT.md) (no critical findings)

## 9. Performance issues

- Dev mode on this 8 GB Mac: 5–40 s per request (memory pressure). **Production build: 0.4–0.7 s** for store pages,
  0.02 s for the static marketing page, with ~150 ms Supabase round-trip.
- Store pages make 3–6 sequential Supabase round trips (tenant lookup → listing RPC → cards → stock). Biggest remaining
  win: Cache Components / tag caching for catalog reads (ADR-010) once hosting is chosen.
- Admin tenant table used to need one RPC per row for stats; replaced by one set-based call.

## 10. SEO issues

- Good: per-tenant title/description/canonical, product + breadcrumb + org JSON-LD, sitemap/robots per store, `noindex` on account/cart/search.
- Unknown product slugs render the not-found page with `noindex` but **HTTP 200** (the store `loading.tsx` streams before `notFound()`). Fix = move the storefront loading boundary below the page level.

## 11. Mobile issues

- Fixed: header icons were text glyphs; mobile menu was a `<details>` panel; no search or cart drawer.
- Remaining: full 320–1920 px screenshot sweep still pending (browser pane was hidden for part of this session).

## 12. Priority matrix

| Priority | Item | Status |
|---|---|---|
| P0 | DB setup, secrets, seed sign-in, admin landing, upload limit | ✅ fixed |
| P0 | Run `cleanup-duplicate-seed.sql` + new migration on the cloud DB | ⏳ needs you |
| P1 | Dashboard home, storefront header (search, cart drawer, mobile nav), carousels, theme preview | ✅ fixed |
| P1 | Media library UI | ⏳ open |
| P2 | Admin tenant stats, shopper password reset, PDP rating placement, hero mobile image | ✅ fixed |
| P2 | Photo reviews, rating distribution, guest wishlist, drag-and-drop theme sections | ⏳ open |
| P3 | 200-status soft 404, catalog caching, CSP nonces | ⏳ open |

## 13. Recommended implementation order

1. Apply the two pending SQL files to the cloud DB.
2. Media library (reuse `media_assets` + `uploadTenantImage`), then let every image field in the theme editor pick from it.
3. Responsive screenshot sweep (320/375/768/1024/1440) and fixes.
4. Theme editor drag-and-drop + section duplicate.
5. Catalog caching (ADR-010) and fixing the soft-404 status.
6. Reviews: rating distribution + photo upload.
