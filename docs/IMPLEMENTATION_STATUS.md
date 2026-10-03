# Implementation Status

_Last updated: 2026-10-03 (platform host aliases: the Vercel URL serves the platform, not a store)_

## Phase overview

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 0 | Repository audit | ✅ Done | Greenfield |
| 1 | Foundation | ✅ Done | Env, Supabase clients, host routing, permissions, errors, validation, UI primitives |
| 2 | Schema, RLS, storage, seed, types | ✅ Done | 13 migrations, RLS on every table, composite tenant FKs, storage buckets, seed |
| 3 | Auth & tenant | ✅ Done | Signup/login/magic link/reset, onboarding, invites, tenant switcher |
| 4 | Catalog | ✅ Done | Products + variants (option1–3), media, categories, collections (manual + rules), size charts, CSV import/export |
| 5 | Inventory | ✅ Done | Per-variant stock, adjustments ledger, thresholds, concurrency-safe reservation in `place_order` |
| 6 | Theme engine | ✅ Done | Theme config JSON, 23 section types, draft/publish/rollback, editor with live iframe preview |
| 7 | Storefront | ✅ Done | Home, listings with filters, PDP, search, pages, blog, FAQ, contact, stores, SEO, sitemap/robots |
| 8 | Checkout & orders | ✅ Done | Cart cookie, checkout, Razorpay + COD, webhook, order status, invoices, customer accounts |
| 9 | Seller dashboard | ✅ Done | Home overview added in the audit pass (it was still a placeholder); orders, returns, customers, discounts, reviews, content, analytics, settings, team, domains |
| 10 | Super admin | ✅ Done | `/admin` console (below) |
| 11 | Cloudflare / domains | ✅ Done | Custom domains + verification cron, `workers/domain-router` edge Worker |
| 12 | Hardening | 🟡 Partial | Rate limits, framing policy, secret redaction, upload body limits; full CSP with nonces open (ADR-018) |
| 13 | Launch readiness | 🟡 Partial | CI workflow added; hosting target (ADR-011) and brand/domain (ADR-021) still to confirm |

## Verification (2026-09-25, after the audit pass)

| Gate | Result |
|------|--------|
| `pnpm typecheck` | ✅ clean |
| `pnpm lint` (0 warnings) | ✅ clean |
| `pnpm test` (unit) | ✅ 22 files, 229 tests |
| `pnpm test:db` (RLS + SQL on Postgres 17) | ✅ 74 tests; all 14 migrations apply from scratch; seed runs twice without duplicates |
| `pnpm build` | ✅ |
| Runtime vs real Supabase (`next start`) | ✅ store pages 0.4–0.7 s, marketing 0.02 s; order #1 placed, paid and confirmed; seller, staff and shopper sign-in verified |

Still not verified here: live Razorpay keys and webhooks, Resend email, Shiprocket, Cloudflare custom hostnames.

## Theme marketplace direct apply (2026-10-01)

- Sellers with both `theme.edit` and `theme.publish` can now choose **Apply to store** from
  the marketplace. It builds the normal content-safe draft and publishes it immediately.
- **Save as draft** remains available for the existing review-and-customise workflow; the prior
  published version remains in history for rollback.
- Marketplace cards now show the actual, lazy-loaded demo storefront with the selected theme
  applied in memory. The token mockup remains only as a fallback for unseeded demo stores.
- Verification: `pnpm typecheck` ✅ · focused marketplace lint ✅ · `pnpm test` ✅ (32 files,
  368 tests) · `pnpm build` ✅.
  A final `pnpm check` is currently blocked by an unrelated, newly edited showcase-data lint
  error: unused `tile` in `scripts/dev/showcase/data/griha-smart.ts`.

### Pending on the cloud database (run in the Supabase SQL Editor)

1. `supabase/dev/cleanup-duplicate-seed.sql`: removes rows duplicated when the old seed ran twice (dev data only).
2. `supabase/migrations/20260925001100_admin_tenant_stats.sql`: admin tenant table stats. Until it's applied, the owner/orders/GMV columns stay hidden.

### Audit pass: changes

- **Auth:** `/seller/login|register|forgot-password` (old URLs 308-redirect), `/admin/login` (console styling), role-based post-login landing, shopper forgot/reset password, store callback accepts token-hash links.
- **Storefront:** SVG icons, search overlay + `/search/suggest`, cart drawer with free-shipping progress, drawer mobile nav, header scroll state, carousel/hero layout fix, hero mobile image, PDP rating under title + SKU.
- **Dashboard:** real home overview (`features/analytics/home.ts`), shared zero-filled `RevenueChart`, full-width theme editor with a true-width scaled preview.
- **Admin:** `theme-console` palette, tenant table owner/products/orders/GMV (`platform_tenant_list_stats`).
- **Platform:** Server Action / proxy body limit 25 MB (uploads over 1 MB failed before).
- **Data:** seed fixed (GoTrue token columns, idempotent inserts); `scripts/dev/demo-media/run.mts` generates original demo imagery and publishes the demo theme.
- **Tests:** `zeroFillDays`; admin stats RPC; shopper↔shopper and shopper→seller/platform isolation.

## Root domain switch to buildbrighten.in (2026-10-03)

- Production returned a plain 500 on every host: `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN` was not a bare hostname, so `publicEnv()` threw `EnvValidationError` in the proxy. The schema now reduces a pasted URL (`https://www.example.in/`) to the bare root; ports and non-hostnames are still rejected.
- `supabase/dev/move-platform-root.sql`: idempotent ops script adding `{slug}.{new root}` platform-subdomain rows (and moving the primary off old platform subdomains; custom primaries untouched). Tested on the local test DB.
- Tests: env normalisation, proxy routing for `www.buildbrighten.in` / `{slug}.buildbrighten.in`.

## Platform host aliases / Vercel 404 fix (2026-10-03)

- Bug: on `saas-ecom-puce.vercel.app`, `/` returned the 404 page. `classifyHost` only knew `{root}`/`www.{root}`, so the Vercel host was a `custom-domain`, the proxy rewrote it to `/store/[host]`, the `domains` lookup found no row and the layout called `notFound()`.
- `src/lib/platform/hosts.ts` `platformHostAliases()`: exact extra platform hosts from `NEXT_PUBLIC_PLATFORM_URL`'s host, `PLATFORM_HOST_ALIASES` (validated in `env/schema.ts`), and `VERCEL_URL`/`VERCEL_BRANCH_URL`/`VERCEL_PROJECT_PRODUCTION_URL` (`*.vercel.app` only). `classifyHost`/`decideRoute`/`checkCustomDomain` take the list; aliases can't be added as custom domains.
- `tenant/directory.ts`: a failed lookup throws `TenantDirectoryError` (5xx, logged with PostgREST code) instead of looking like an unknown host.
- `.env.example` uses placeholders and lists `APP_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_PLATFORM_URL`, `PLATFORM_HOST_ALIASES`. `docs/DEPLOY_VERCEL.md` covers `*.vercel.app` setup and the Hobby cron trade-off (crons currently daily).
- Tests: `tests/unit/platform-hosts.test.ts`, `proxy-platform-host.test.ts` (real proxy), `tenant-directory.test.ts`, routing/env additions.

## Custom domains on Vercel + go-live guide (2026-10-03)

- `src/lib/vercel/domains.ts`: Vercel REST client (add / get / verify / remove project domain, domain config). Config comes from `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` in env (not yet in `env/schema.ts` or Admin → Social apps).
- Domains flow: when Vercel is configured, adding a domain registers it on the project, plus the apex/www companion as a 308 redirect. The settings page shows the exact records from the API (ownership TXT, A/CNAME, Vercel TXT). "Check now" and the cron map the API state to `provider_status` (`pending_dns | verifying | misconfigured | active | error`). A domain is `verified` (routable) only when our TXT matches and Vercel says verified. SSL is active only when Vercel reports `misconfigured: false`. Remove deletes it from Vercel with `removeRedirects`. The Cloudflare path is unchanged.
- Migration 21 (`20261003002100_domains_vercel.sql`, `supabase/dev/apply-2100.sql`): `domains.provider`, `provider_status`, `dns_records`, `redirect_hostname`. The insert policy now refuses seller-set edge fields.
- `vercel.json` crons and `docs/DEPLOY_VERCEL.md` (environment variables, wildcard subdomains, Supabase, crons, The Paliya and Ramya steps).
- Tests: `tests/unit/vercel-domains.test.ts` (mocked fetch, status mapping), `tests/rls/domains-vercel.test.ts`.

## Go-live suite (2026-10-03)

- Ramya design v2: centred-nav header with mega menu, auto-scrolling tilt carousel, Krishna/Radha decor (original SVG motifs + CC0 Met paintings), blue #0a3f79 palette, mobile bottom nav, refined finish (all opt-in settings; `docs/DESIGN_RAMYA.md`).
- Custom domains on Vercel (Domains API, DNS records, SSL status, cron) and `vercel.json` crons (`docs/DEPLOY_VERCEL.md`).
- All transactional email through Resend with branded templates, `email_log`, per-store toggles, event dispatcher (`docs/EMAIL.md`).
- WhatsApp Business order notifications (approved templates, checkout opt-in, queue + retries, STOP/START) (`docs/WHATSAPP_NOTIFICATIONS.md`).
- Migrations to apply in order: 1900, 2000, 2100, 2200, 2300 (`supabase/dev/apply-*.sql`).

## Ramya store, Sutra Atelier theme, speed and loader (2026-10-02)

- New live store **Ramya By Ayushi Paliya** (`ramya-by-ayushi-paliya`, tenant `c89edac3-…`), owned by admin@paliya.test, catalogue copied read-only from The Paliya (`scripts/dev/clone-store/run.mts`; reviews, orders, customers not copied).
- **Sutra Atelier** preset (`sutra-atelier`) and new opt-in sections and options: ProductSpotlight, CompactProducts, FeatureBand, arch tiles, tilted carousel, overlay edits, greyscale reel strip, full-bleed and journal banners, hero counter, condensed display font. Published on Ramya via `scripts/dev/ramya/apply-theme.mts`.
- Speed: cached tenant, theme and profile reads (TTFB ~0.5 s → ~0.3 s), Inter no longer preloaded on storefronts (fonts 183 → 84 KB), 948 KB logo PNG now optimised, PDP images 1 MB → 124 KB.
- Loader for every store: per-page skeletons (`loading.tsx`) plus a top progress bar in the theme accent.

## Multi-industry theme ecosystem (2026-09-30)

| Area | Status | Notes |
|---|---|---|
| Audit | ✅ | `docs/THEME_ECOSYSTEM_AUDIT.md` (stores classified; The Paliya fingerprinted before any change) |
| Store categories / store type | ✅ | Migration 1800 applied in the cloud. Showcase stores are `demo` with their industry; aangan/rangrez `test`; The Paliya and the unknown store stay `real` |
| Industry + style theme catalogue | ✅ | 103 themes: 5+ for every industry (fashion 12); handicrafts 1 |
| All 20 industries | ✅ | Phases 5–6 added books, pets, automotive, smart home, bags, watches, organic, gourmet, general |
| Content slots | ✅ | Slot-aware `applyThemePreset`; unused slots kept hidden |
| New section | ✅ | `BrandStrip` (wordmarks/logos, row or marquee) |
| Live Preview | ✅ | `?sf_theme=` on showcase stores only, in memory, noindex; desktop/mobile dialog in the dashboard |
| Marketplace UI | ✅ | Industry chips, style filter, search, sort, badges |
| Product specifications | ✅ | `attributes.specs` (label/value) in the editor, payload and PDP; "Type: Other" hidden |
| Showcase demo stores | ✅ | kaya-studio, voltnest, dewbloom, kasa-living, harvest-basket, suvarna, kadam, aarogya, khel-studio, nanhe, pustak-ghar, pawdesh, gearbay, griha-smart, safarnama, ghadi-co, bhoomi-organics, crumb-and-co, sabkuch (20–25 products each): real open-licence photos checked by eye, credits page, no seeded reviews |
| Super admin | ✅ | Store type badge, category, type/category filters (hidden until migration 1800 is applied) |

Protection of The Paliya: a data fingerprint over 30 tenant tables (`scripts/dev/protect/snapshot-tenant.mts`)
plus full-page desktop/mobile screenshots (`scripts/dev/protect/visual-baseline.mts`), compared
before and after this work: data identical in all tables, and 11/12 pages pixel-identical (the
12th differs only in image-decode noise inside one product photo).

Verification: `pnpm check` passes (typecheck, lint, 388 unit tests, build); DB tests 93/93 (local).
Since migration 1800, compare snapshots with `SNAPSHOT_IGNORE_COLUMNS=tenants.store_type,stores.category_id`
(the new columns keep their defaults for The Paliya: `real`, `null`).

## Phase 3 (2026-09-26): platform control and growth tools

| Gate | Result |
|------|--------|
| `tsc --noEmit` / `pnpm lint` (0 warnings) | ✅ clean |
| `pnpm test` (unit) | ✅ 30 files, 274 tests |
| `pnpm test:db` (Postgres 17) | ✅ 8 files, 92 tests; 18 migrations apply from scratch; `apply-phase3.sql` applies on a phase-2 database with seed data |
| `pnpm build` | ✅ |
| Runtime against the cloud project | ⏳ blocked until `supabase/dev/apply-phase3.sql` is applied (phase-3 tables return 404 today) |

| Area | Status | Doc |
|---|---|---|
| Super admin bootstrap (env), `/admin/stores`, store configuration, integrations overview | ✅ | SUPER_ADMIN.md, SUPER_ADMIN_SETUP.md |
| Theme marketplace (10 themes, apply-to-draft) | ✅ | THEME_MARKETPLACE.md |
| Payments: Razorpay, Cashfree, PayU + COD; unified encrypted integrations | 🟡 live gateways unverified | PAYMENT_INTEGRATIONS.md |
| Shipping: Shiprocket + Delhivery, track/label/pickup/cancel | 🟡 live couriers unverified | SHIPPING_INTEGRATIONS.md |
| SEO settings, verification, canonical/noindex, WebSite JSON-LD | ✅ | SEO_SYSTEM.md |
| GA4 / Google Ads / Meta Pixel, e-commerce events, attribution | ✅ (refund event not sent) | ANALYTICS_SYSTEM.md |
| Social hub (Meta, Pinterest, YouTube connect), scheduler | 🟡 needs OAuth apps | SOCIAL_MEDIA.md |
| Social planner backend (calendar, planned manual channels, campaigns, hashtag sets, key dates, product-to-post) | ✅ backend + RLS/unit tests | SOCIAL_MEDIA.md |
| Creative studio (9 templates, PNG to media library) | ✅ | CREATIVE_STUDIO.md |
| thepaliya.com import; Jaipur Boutique theme (marquee, shoppable videos, drawer menu, size chips, page-content marker) | ✅ | THEPALIYA_IMPORT.md, THEME_MARKETPLACE.md |
| Settings centre + Security & activity | ✅ | SECURITY.md, RBAC.md |

### Pending on the cloud database

1. `supabase/dev/apply-phase3.sql` (migrations 1500 + 1600, one transaction).
2. Cron: `/api/cron/social-publish` every 5 min and `/api/cron/gbp-reviews` every 6 h (Bearer `CRON_SECRET`), alongside `expire-orders` and `domains`.

## Phase 2 (2026-09-26): premium UI, RBAC, media, multi-store

| Area | Status | Doc |
|---|---|---|
| Design system, light/dark (light default), lucide icons | ✅ built | DESIGN_SYSTEM.md |
| App shell (seller + console): collapsible sidebar, breadcrumbs, ⌘K, notifications, account menu | ✅ built, ⏳ visual QA | UI_UX_REDESIGN_AUDIT.md |
| Auth redesign: staff, merchant login/register/forgot, customer login/register/forgot | ✅ built + screenshotted | UI_UX_REDESIGN_AUDIT.md |
| Super admin dashboard (8 KPIs, GMV trend, plans, activity) | ✅ built, ⏳ needs migration 1400 | UI_UX_REDESIGN_AUDIT.md |
| RBAC: 27 permissions, 12 system roles, custom roles, escalation guards, Team + Roles UI | ✅ built, 8 DB tests, ⏳ needs migration 1200 | RBAC_AUDIT.md |
| Media library + picker (drag & drop, progress, cancel/retry, replace, usage, alt text) | ✅ built, 3 DB + 4 unit tests, ⏳ needs migration 1300 | MEDIA_LIBRARY_AUDIT.md |
| 10 unique demo stores (data, art, themes, owners) | ✅ generator written, ⏳ not yet run on the cloud DB | MULTI_STORE_AUDIT.md |
| Customer account overview | ✅ built + screenshotted | |

**To finish phase 2 on the cloud project:** run `supabase/dev/apply-phase2.sql` in the SQL Editor (migrations 1200–1400 in one transaction), then
`pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/demo-stores/run.mts` to create the 10 stores.

Verification (2026-09-26): `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 24 files / 238 tests · DB tests ✅ 85 (Postgres 17) · `pnpm build` ✅.

## What's in each area

### Storefront (`src/app/store/[host]/**`, `src/features/storefront`, `src/features/theme/render`)
Host-resolved tenant (verified `domains` row or signed edge header), theme tokens + section registry, header/footer/mega menu,
collection/category/search listings with filters and sort, PDP (gallery, zoom, size guide, variants, PIN check, reviews, recently viewed),
cart, checkout, pay (Razorpay/test), order confirmation + printable invoice, account (orders, addresses, wishlist), CMS pages, blog, FAQ,
contact, store locator, per-store sitemap/robots, redirects, suspended/preview states, event tracking.

### Seller dashboard (`src/app/dashboard/**`)
Products (editor, bulk, import/export), collections, categories, size charts, inventory, orders (fulfilment, cancel, refunds, invoices),
returns, customers (+export), discounts, reviews moderation, content (pages, blog, menus, FAQs, locations, redirects), analytics,
theme editor, domains, settings (store, shipping, PIN rules, COD, payments, taxes, notifications, team).

### Super admin (`src/app/admin/**`, `src/features/platform`)
Overview (stores, GMV, signups, trials ending, pending domains), tenants list/search/filter, tenant detail (status with reason + confirmation,
plan change, trial extension, usage vs plan limits, storage, domains + re-check, team, feature-flag overrides with effective source,
audit trail), create store for a user, plans CRUD (prices, limits, features), feature flags, platform users (roles/disable/remove),
platform-wide audit log with filters, platform settings, usage & storage, custom-domain overview, integration presence (booleans only),
**support sessions**: time-boxed, reason-required, audited, read-only view of a store's orders/products via RLS viewer grants.

### Marketing site (`src/app/(marketing)/**`, `src/features/marketing-site`)
Landing page (hero, demo-store preview with theme look switcher + device toggle, problem→solution, themes, builder, features, fashion
features, illustrative metrics, how it works, pricing with monthly/yearly toggle from live `plans`, FAQ, CTA), `/pricing`, `/features`,
`/privacy`, `/terms`, OG image route, JSON-LD (Organization, SoftwareApplication, FAQPage).

### Edge (`workers/domain-router`)
Cloudflare for SaaS Worker: strips client `x-paliya-*` headers, signs the customer host (HMAC-SHA256, 5-min window), proxies to the origin,
rewrites origin-host redirects, strips `x-middleware-rewrite`. Cross-tested against the app verifier.

## Security checklist

- Tenant never taken from the browser: storefront = verified host; dashboard = membership; admin = platform membership + permission.
- RLS on every table; composite `(tenant_id, id)` FKs; guard triggers block privileged column edits from `authenticated`.
- Service-role client limited to `lib/supabase/admin.ts` uses listed in ADR-006; `server-only` enforced.
- All inputs zod-validated (`parseInput`); PostgREST search terms sanitised; no raw SQL from input.
- Redirects via `safeRedirect`; storefront `[...rest]` uses stored redirects only.
- Webhooks: Razorpay HMAC verified; cron endpoints require `CRON_SECRET`.
- Uploads: MIME sniff + size limits per bucket; private bucket for invoices.
- Prices snapshotted into `order_items`; stock reserved atomically in `place_order`.
- Audit log for tenant admin actions, platform actions and support sessions.
- Framing: storefronts `frame-ancestors 'self' <platform origin>`; everything else `frame-ancestors 'self'` + `X-Frame-Options`.
- Rate limits (Postgres-backed) on login/OTP, signup, cart, checkout, account actions, storefront forms, invites, exports, support sessions and domain verification.
- Logs redact secrets/PII; admin integration page reports env presence only.

## Open risks / follow-ups

1. **Decisions needed:** ADR-011 hosting (Vercel vs Cloudflare/OpenNext), ADR-021 real brand + root domain.
2. Full CSP with nonces (script-src) not yet enabled — needs Razorpay checkout script allowance (ADR-018).
3. Storefront renders dynamically; Cache Components adoption deferred (ADR-010) — add CDN caching once hosting is chosen.
4. Suspended stores return 200 with an "unavailable" page (App Router layouts can't set 503).
5. Email/Shiprocket/Cloudflare adapters are implemented against their APIs but untested against live accounts.
6. Subscription billing for plans (charging sellers) is out of scope; plans are assigned by admins/onboarding.
7. No media library UI yet (`media_assets` + upload pipeline exist); theme image fields take uploads directly.
8. Unknown product/collection slugs render not-found with `noindex` but HTTP 200 (store `loading.tsx` streams first).
9. Browser end-to-end tests (Playwright) not yet written; flows were verified manually.
10. Responsive screenshot sweep across 320–1920 px not completed.

## Running locally

```
cp .env.example .env.local        # fill Supabase + APP_SECRET
pnpm install
pnpm dev                          # platform: http://localhost:3000, stores: http://{slug}.localhost:3000
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/demo-media/run.mts   # dev only: demo imagery for the seed stores
pnpm check                        # typecheck → lint → unit tests → build
pnpm test:db                      # local Postgres 16 + Supabase shim; applies migrations + seed, runs RLS tests
pnpm db:types                     # regenerate src/lib/supabase/database.types.ts from migrations
```

## WhatsApp order notifications (2026-10-03, go-live role D)

- Template-only WhatsApp Cloud API messages for order placed / shipped / out for delivery / delivered / abandoned cart, gated on connection + per-event mapping + checkout opt-in + valid E.164 phone. Registered as a channel of the shared dispatcher (`src/features/notifications/events.ts`).
- Migration 23 (`customer_whatsapp_optins`, `whatsapp_notification_settings`, `notification_jobs` + claim functions), queue with retries/backoff, cron `/api/cron/notifications`, status/STOP webhook handler, Settings → Notifications page (template picker from the WABA, test send, recent messages). See `docs/WHATSAPP_NOTIFICATIONS.md`.
- Pending integration: checkout opt-in checkbox + recording, and one webhook line in the inbox handler (see that doc). Out-for-delivery has no producer yet.

## Go-live C: Email via Resend (2026-10-02)
- `src/lib/email/` holds the Resend REST client with Idempotency-Key, `sendEmail` and the `email_log` writer. Recipients are stored hashed and masked, never bodies. With no key set, the status is `logged` (not sent).
- `src/features/notifications/events.ts` is the shared dispatcher (`emit`, `dispatch`, `registerChannel`), running after the response via `after()`. The email channel lives in `notifications/email/channel.ts`.
- Branded HTML and text templates cover: order confirmation (with COD amount due), owner new-order alert, payment failed, shipped, out for delivery, delivered, cancelled, refund, return update, abandoned cart (opt-in), team invite, and contact-form forward.
- Migration 22 (`20261003002200_email_log.sql`) adds `email_log` and `email_preferences`, with toggles in Settings → Notifications. The old `notifications/send.ts` has been removed.
- See `docs/EMAIL.md` for setup (Resend domain DNS, Supabase SMTP) and what's still missing.
