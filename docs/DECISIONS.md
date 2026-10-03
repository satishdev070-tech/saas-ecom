# Architecture Decision Records

Format: **Status** (Accepted / Proposed / Open) · Context · Decision · Consequences.
"Proposed" = the default direction I will implement unless you say otherwise. "Open" = needs your call before the slice that depends on it.

---

## ADR-001 — Greenfield scaffold · Accepted
**Context.** Phase 0 audit: the repo held only `docs/` (12 blueprint files), no code, no git, no Supabase project files. Nothing to preserve.
**Decision.** Scaffold with `create-next-app` (App Router, TypeScript, Tailwind, ESLint, `src/` dir, pnpm) and build Phase 1 on top of it.
**Consequences.** Layout uses `src/` (blueprint showed `app/` at the root); otherwise follows `02_ARCHITECTURE.md`.

## ADR-002 — Stack versions · Accepted
Next.js **16.3** (Turbopack default; `middleware` renamed to `proxy.ts`; async-only request APIs; error boundaries receive `retry`), React 19.2,
TypeScript **5.9** (TS 7 native compiler is out but Next's type plugin/typegen target 5.x), Tailwind 4, Zod 4, `@supabase/ssr` 0.12,
`@supabase/supabase-js` 2.117, Vitest 5, pnpm 10, Node ≥ 20.9.
Next 16 ships version-matched docs in `node_modules/next/dist/docs/`; `AGENTS.md` tells agents to read them before coding.

## ADR-003 — Modular monolith with feature modules · Accepted
One Next.js app; domain logic in `src/features/<domain>/server`, never in JSX; shared infrastructure in `src/lib`.
No microservices in V1. Cloudflare Worker is an edge router only, not a second backend.

## ADR-004 — Host-based multi-tenancy via proxy rewrite · Accepted
**Decision.** `src/proxy.ts` classifies the host. Storefront hosts (`{slug}.{root}` and custom domains) are rewritten to the internal
`/store/{host}/…` tree. `/store/*` is unreachable from the platform host. Seller/admin paths (`/dashboard`, `/admin`, `/login`, `/signup`, `/onboarding`)
404 on storefront hosts so seller sessions live only on the platform origin.
**Why.** One storefront codebase for subdomains and custom domains; host in the path gives a natural cache key; no tenant id in URLs.
**Also.** `/s/{storeSlug}` path-based URLs from the blueprint are **not** implemented. They would put all stores on one origin (shared cookies/localStorage across tenants). Subdomains work locally via `acme.localhost:3000`.

## ADR-005 — Tenant resolution only from verified `domains` rows · Accepted
Every store gets a `domains` row for its platform subdomain (type `platform_subdomain`, auto-verified) and one per custom domain (verified by DNS TXT).
`tenantDirectory.findByHost()` reads **verified** rows only. The `[host]` segment must equal the proxy-verified `x-paliya-host` header or the request 404s.
Inbound `x-paliya-host` headers from clients are stripped.

## ADR-006 — Supabase key usage · Accepted
- Publishable key + user session for all tenant data (RLS enforced).
- Secret key (`SUPABASE_SECRET_KEY`) only in `lib/supabase/admin.ts`, guarded by `server-only`, for: host→tenant lookup, verified webhooks, platform ops after an explicit platform-permission check, background jobs.
- ESLint forbids `createClient` from `@supabase/supabase-js` outside `lib/supabase/*`.
- Server identity via `auth.getClaims()`, never `getSession()`.
- Env names follow Supabase's new API keys (`sb_publishable_…`, `sb_secret_…`); the legacy anon/service_role JWT keys also work in the same variables.


**Additions (2026-10-02, social suite):** the secret-key client is also used for (1) `platform_app_credentials` (platform permission check first; ciphertext only), (2) inbox webhooks writing `social_conversations`/`social_messages` after the Meta `X-Hub-Signature-256` check, with the store resolved from a connected integration, (3) `ai_generations` logging and (4) `gbp_reviews` sync, both after a `marketing.write` check with a server-resolved tenant.

## ADR-007 — Edge → origin trust via HMAC-signed host · Accepted
The Worker forwards the original hostname with `x-paliya-edge-{host,ts,sig}` where `sig = HMAC-SHA256(EDGE_SHARED_SECRET, host + "\n" + ts)`.
The proxy accepts it only if the signature is valid and ≤ 300 s old; otherwise it falls back to the literal Host header. Anyone hitting the origin directly cannot claim a tenant host.

## ADR-008 — Money as integer paise · Accepted
TS uses integer minor units; DB uses `numeric(12,2)`; conversion only in the data layer (`lib/money.ts`). Discount percentage rounds down.

## ADR-009 — Permissions matrix in code, seeded to DB · Accepted
`lib/permissions/matrix.ts` is the single source. Phase 2 seeds `roles/permissions/role_permissions` from it; RLS helper
`has_tenant_permission(tenant_id, perm)` is `SECURITY DEFINER` with `search_path = ''` and schema-qualified references.
V1 uses the five system roles only; tenant-defined custom roles are a later feature.

## ADR-010 — Caching strategy for storefront · Accepted (dynamic for v1)
Next 16 **Cache Components** (`cacheComponents: true`, `"use cache"`, `cacheTag`) fits catalog pages well (static shell + streamed dynamic cart/account),
but it changes the rules for every route (dynamic access must sit under `<Suspense>`). Phase 1 leaves it **off** and renders storefronts dynamically.
Proposal: enable it at the start of Phase 7 with tags `tenant:{id}`, `tenant:{id}:product:{id}`, `tenant:{id}:theme`, invalidated from catalog/theme services.


**Update (2026-10-02):** cross-request caching is now done with `unstable_cache` (`src/lib/cache/storefront.ts`; production only): tenant directory (tags `tenant-directory`, `host:<host>`), published theme, store profile and features (`tenant:<id>:storefront`), 120 s TTL. Every mutation that changes them calls `revalidateStorefront(tenantId)`; plan/flag changes call `revalidateAllStorefronts()`. Draft preview and Live Preview are never cached; product, price and stock reads are not cached.

## ADR-011 — Hosting target for the Next.js app · Open (needed by Phase 11; affects nothing before)
Options:
1. **Vercel** for Next.js + Cloudflare in front (DNS, Cloudflare for SaaS custom hostnames, Worker). Most compatible with Next 16 features; two vendors; custom hostnames must also be added to Vercel via its API.
2. **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) — one vendor, custom hostnames handled natively by Cloudflare for SaaS; some Next features lag (check Cache Components/ISR support at the time).
Code is kept host-agnostic (Node runtime, no Vercel-only APIs) so either works.

## ADR-012 — `tenants` vs `stores` · Accepted
The blueprint has both with overlapping columns (name, slug, logo, currency, timezone). Proposal: `tenants` = account/billing/status/plan;
`stores` = 1:1 storefront profile with `tenant_id` as its **primary key** (logo, favicon, contact, social, locale). No duplicated columns.

## ADR-013 — Composite tenant foreign keys · Accepted
Every tenant table gets `unique (tenant_id, id)`; child tables reference `(tenant_id, parent_id)`. Join tables (`collection_products`,
`variant_option_values`, `product_tag_map`, `wishlist_items`, `cart_items`, `discount_products`, `discount_collections`, `return_items`) also carry `tenant_id`.
This makes a cross-tenant link (tenant A's product in tenant B's collection) impossible at the constraint level, and keeps RLS policies simple (`tenant_id` on every row).

## ADR-014 — Single source of truth for stock · Accepted
The blueprint stores stock twice (`product_variants.stock_quantity/reserved_quantity` **and** `inventory_levels`). Proposal: `inventory_levels` is authoritative
(one default location per tenant in V1); variants carry no stock columns. Reservations and decrements run in a Postgres function using
`UPDATE … SET available = available - $n WHERE available >= $n` (row-level lock, no negative stock) and write an `inventory_movements` row in the same transaction.

## ADR-015 — Order numbers & price integrity · Accepted
Per-tenant, gap-tolerant order numbers from a `tenant_counters` row locked `FOR UPDATE` inside the order-creation function.
`cart_items.unit_price_snapshot` is display-only; checkout **re-prices server-side** from current variant prices and discount rules, then snapshots into `order_items`.

## ADR-016 — Customer identity across stores · Accepted
Supabase Auth cookies are per host, so shoppers sign in on each store's domain. One `auth.users` identity can map to separate `customers` rows in
several tenants; each tenant sees only its own `customers` row (RLS). Seller accounts (tenant memberships) sign in only on the platform domain.

## ADR-017 — Theme versions are immutable once published · Accepted
`theme_versions` rows: one mutable `draft` per tenant theme; publishing copies the draft into a new immutable `published` version; rollback re-publishes an
older version as a new version (history stays linear and auditable). Section settings are validated against each section's zod schema on save **and** on render.

## ADR-018 — Security headers now, CSP later · Accepted
Baseline headers ship now (`nosniff`, HSTS, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, COOP).
CSP with nonces is deferred to hardening, when the payment provider's checkout script is known.
**Resolved (2026-09-25):** framing is set per request by `src/proxy.ts` via `framingHeaders()`: storefront responses send
`Content-Security-Policy: frame-ancestors 'self' <platform origin>` (no XFO, which can't name another origin) so the theme editor can
iframe them; platform responses send `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`. Full script-src CSP remains open.

## ADR-019 — Fonts · Accepted
No `next/font/google` for now (it fetches at build time). Platform uses system stacks via tokens; storefront theme fonts will be self-hosted files in Storage/`public` chosen by theme settings (Phase 6).

## ADR-020 — Payments & shipping providers · Accepted (Razorpay + COD, Shiprocket)
Provider abstraction either way (`PaymentProvider`, `ShippingProvider` interfaces; webhook signature verification per adapter). COD is built in.
Suggested first adapters for Indian D2C: **Razorpay** (payments) and **Shiprocket** (shipping). Please confirm or name your preferred providers.

## ADR-021 — Platform brand & root domain · Open
Placeholder brand "The Paliya" (`src/config/platform.ts`) and example root domain `paliya.store` in tests/docs. Tell me the real brand name and platform domain.

## ADR-022 — Signed cart cookie · Accepted
Carts are server rows; the browser holds only `paliya_cart` = HMAC-signed `{tenantId}:{cartId}` (key derived from `APP_SECRET` via HKDF).
A cookie from another store or with a bad signature is ignored. Checkout re-prices from the DB (ADR-015); the cookie is never trusted for prices.

## ADR-023 — Variant options as `option1..3` · Accepted
Fashion variants need at most three axes (size, colour, fit/material). Variants carry `option1..3` values plus product-level option names,
which keeps filters, CSV import/export and uniqueness constraints simple. Swatch colours live in `variant_option_values`.

## ADR-024 — Theme config as versioned JSON + section registry · Accepted
A theme is `{ tokens, header, productCard, layout: {header, footer}, templates: {home, collection, product} }` where each list is
`SectionInstance[]` (`{id, type, settings, blocks?, visibility}`) over 23 section types. `SECTION_DEFINITIONS` describes each type's
editor fields; the storefront `REGISTRY` maps type → server component. Configs are zod-validated on save; unknown types are dropped at
render. Drafts use optimistic concurrency (`updated_at` base, explicit force); publish copies the draft into an immutable version (ADR-017).

## ADR-025 — Postgres-backed rate limiting · Accepted
`public.svc_rate_limit(key, limit, window_seconds)` (fixed window, `security definer`, executable by service_role only) is called by `lib/rate-limit.ts`
from server actions. Works on any host without Redis; edge rules (Cloudflare) can be added in front later.

## ADR-026 — `typedRoutes` off · Accepted
Dynamic hrefs built from data (store hosts, slugs, admin filters) made `typedRoutes` noisy without catching real bugs. Route params and
page props stay typed via `next typegen` (`PageProps<"/route">`, `LayoutProps`).

## ADR-027 — Support access is read-only and time-boxed · Accepted
Platform staff never impersonate a user. `start_support_session(tenant, reason, minutes)` (reason ≥ 10 chars, 15–240 min, audited in the
store's log) lets `app.has_permission` grant the **viewer** permission set for that tenant until expiry. The support view reads through the
staff member's own RLS session; there are no write paths. Ending or expiry removes access immediately.

## ADR-028 — Marketing site on the platform host · Accepted
Route group `src/app/(marketing)` (`/`, `/pricing`, `/features`, `/privacy`, `/terms`, `/og`). Pricing reads active `plans` with the anon
client (RLS `plans_public_select`), revalidated hourly, falling back to `FALLBACK_PLANS` if the database is unreachable. Demo content is
fictional and labelled as such.

## ADR-029 — Edge Worker for custom domains · Accepted
`workers/domain-router` fronts Cloudflare for SaaS custom hostnames: strips client `x-paliya-*` headers, adds the signed host (ADR-007),
proxies to `ORIGIN_URL`, maps origin-host redirects back to the customer host and strips `x-middleware-rewrite`. It holds no tenant data.


## ADR-030 — Per-store integrations in one encrypted table · Accepted
Payment, shipping, tracking and social connections live in `tenant_integrations` (one row per store + provider). Secrets are a single AES-256-GCM JSON blob; public settings sit in `public_config`. The table has RLS enabled with no policies, so only server code with the secret key (ADR-006) reads it, always with a server-resolved tenant id after a permission check. Status is set only by a real provider test or OAuth result (`not_connected | connected | error | expired | disabled`), and a provider can be enabled only when connected. Replaces `tenant_payment_settings` (migrated) and the platform-level Shiprocket env credentials.

## ADR-031 — Theme marketplace as style presets · Accepted
Marketplace themes are presets (tokens, layout, per-section style settings) applied onto the store's existing config as a draft. Content is kept, style is replaced, then the store publishes through the normal publish/rollback flow. We chose this over copying whole demo configs, which would inject another store's text and images, and over separate theme codebases, which would multiply renderer maintenance.

## ADR-032 — One SVG renderer for creative preview and output · Accepted
Creative templates are data (layers + fields) rendered by one pure function to SVG: in the browser for preview, and rasterised with sharp on the server for the saved PNG. Standard serif/sans fonts are used in both, so output matches preview without shipping font files to the renderer.
