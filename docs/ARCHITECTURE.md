# Architecture — The Paliya (as built)

> Living document. Describes what exists in the code **now** and the contracts later slices must follow.
> Blueprint/intent lives in `02_ARCHITECTURE.md`; decisions and their rationale live in `DECISIONS.md`;
> progress lives in `IMPLEMENTATION_STATUS.md`.

_Last updated: 2026-09-24 (Phase 0 + Phase 1)_

## 1. System shape

A **modular monolith**: one Next.js 16 App Router application serves three surfaces from one codebase,
distinguished by **hostname**, backed by one Supabase project.

| Surface | Where it is served | Who uses it |
|---|---|---|
| Platform (marketing, seller auth, **seller dashboard** `/dashboard`, **super admin** `/admin`) | `{root}` and `www.{root}` | Sellers, platform staff |
| Storefront (one per tenant) | `{slug}.{root}` and verified custom domains (`www.brand.in`) | Shoppers |
| API route handlers `/api/*` | every host (handlers read the verified host themselves) | Storefront JS, webhooks |

`{root}` = `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN` (e.g. `paliya.store`; `localhost` in dev).

## 2. Request flow

```
Browser
  │
  ▼
Cloudflare (DNS, SSL for SaaS custom hostnames, WAF/rate limits)            [Phase 11]
  │  domain-router Worker: forwards original host as
  │  x-paliya-edge-host + x-paliya-edge-ts + x-paliya-edge-sig (HMAC-SHA256)
  ▼
Next.js  src/proxy.ts   (Node runtime, runs before every non-static request)
  1. effective host = signed edge host if signature valid (≤300s old) else Host header
  2. strip client-supplied internal headers; set x-paliya-host + x-request-id
  3. refresh Supabase session cookie — only if an sb-*-auth-token cookie exists
  4. decideRoute(host, path):
       platform host        → pass through (but /store/* → 404)
       store host / custom  → rewrite to /store/{host}{path}  (/dashboard,/admin,/login… → 404)
       reserved / invalid   → 404
  ▼
App Router
  /store/[host]/layout.tsx
     resolveStorefrontTenant(host)
       ├─ route segment must equal proxy-verified x-paliya-host (else 404)
       └─ tenantDirectory.findByHost(host)  → verified `domains` row → tenant   [Phase 2]
     status: trial/active → render · suspended → controlled page · cancelled/unknown → 404
  ▼
Feature services (src/features/*/server)  → Supabase (user session ⇒ RLS enforced)
```

Unknown, unverified and cancelled hosts all produce the **same generic 404**, so the platform never reveals
whether a hostname belongs to a tenant.

## 3. Repository layout

```
src/
  proxy.ts                 request entry: host → route decision, session refresh, framing headers
  app/
    layout.tsx             root html shell (no tenant data)
    (marketing)/           landing, pricing, features, legal, OG image (platform host)
    (auth)/, auth/         login, signup, reset, OAuth/OTP callbacks
    onboarding/, invite/   store creation, team invites
    dashboard/             seller dashboard (tenant = membership)
    admin/                 super-admin console (platform membership + permission; 404 otherwise)
    store/[host]/          ALL storefront routes (reached only via proxy rewrite)
    api/                   webhooks (razorpay, cashfree, payu), oauth/{network}/{start,callback}, cron (expire-orders, domains, social-publish), health
  features/<domain>/       actions.ts (server actions) · server/* (services, queries) · schemas.ts · components/*
                           domains: analytics auth cart catalog checkout content customer-account customers dashboard-ui
                           domains inventory marketing marketing-site notifications orders-admin payments platform reviews
                           settings shipping storefront team tenants theme
  components/ui/           design-system primitives; components/dashboard/ nav
  config/platform.ts       platform constants
  lib/                     env, supabase clients, tenant routing/context, permissions, validation, actions, errors, money,
                           crypto (HKDF/HMAC/AES-GCM), audit, rate-limit, storage, http/safe-redirect, security/headers,
                           observability/logger, platform/access
supabase/migrations        13 ordered migrations (schema, RLS, SQL functions, storage, reference data)
supabase/seed.sql, supabase/tests/supabase-shim.sql, scripts/db/*   local Postgres test harness + type generator
workers/domain-router      Cloudflare Worker for custom domains (ADR-029)
tests/unit (vitest)        tests/rls (Postgres, `pnpm test:db`)
docs/
```

### Module boundaries (enforced by convention + review)

- `app/**` files are thin: read params → call a feature service → render. No SQL, no business rules in JSX.
- `features/<a>` may import `lib/*` and another feature's **public** `index.ts` only, never its internals.
- Only `lib/supabase/*` may construct Supabase clients (ESLint `no-restricted-imports`).
- Anything importing `lib/supabase/admin.ts` or `lib/env/server.ts` is server-only (the `server-only` package makes a client import a build error).

## 4. Tenancy & data isolation model

- **Tenant = one store** in V1 (see ADR-012 for the proposed `tenants`/`stores` split).
- Every tenant-owned table carries `tenant_id`; composite FKs `(tenant_id, id)` stop cross-tenant references (ADR-013).
- **RLS is the last line of defence, not the only one**: server services also authorize explicitly via `lib/permissions`.
- The browser never sends a tenant id that is trusted. Tenant comes from (a) the verified host for storefront requests, or (b) the user's active membership for dashboard requests.
- Super admin access is via `platform_memberships` + platform permissions, never via a client-supplied role.

### Supabase clients

| Client | Key | RLS | Allowed use |
|---|---|---|---|
| `createSupabaseServerClient()` | publishable + user session cookie | **enforced** | all normal reads/writes (dashboard, storefront, customer account) |
| `getSupabaseBrowserClient()` | publishable | **enforced** | auth UI, realtime; no business mutations |
| `createSupabaseAdminClient()` | secret | **bypassed** | host→tenant lookup, verified webhooks, platform ops after permission check, jobs (ADR-006) |

Server-side identity uses `auth.getClaims()` (JWT verified), never `getSession()`.

## 5. Authorization model

`src/lib/permissions/matrix.ts` defines:

- **Tenant roles** `owner > admin > manager > staff > viewer` (monotonic; owner-only: `billing.manage`).
- **Platform roles** `super_admin`, `support`, `finance`.

Phase 2 seeds these into `roles/permissions/role_permissions`; RLS calls `has_tenant_permission(tenant_id, key)`
(`SECURITY DEFINER`, `search_path` pinned). The same keys gate UI and server services, so the three layers cannot drift.

## 6. Server mutation contract

Every server action / mutating route handler:

```
runAction("catalog.createProduct", async () => {
  const input = parseInput(schema, raw);        // 1 validate (zod)
  const ctx   = await requireTenantMember();     // 2 authenticate + resolve tenant from membership  [Phase 3]
  requirePermission(ctx, "catalog.write");       // 3 authorize
  const row   = await createProduct(ctx, input); // 4 execute (single RPC/transaction when multi-row)
  await audit(ctx, "product.created", row.id);   // 5 audit (sensitive actions)
  return { id: row.id };                         // 6 safe result
});
```

Errors surface as `{ ok: false, error: { code, message, fieldErrors? } }` with generic messages; details go to logs only.
Server Actions get Next's built-in Origin check for CSRF; route handlers that mutate must verify Origin or a signature.

## 7. Rendering & caching

- Storefront pages are Server Components; client components only for interactive islands (variant picker, cart drawer, gallery zoom).
- Storefronts render dynamically per request (ADR-010); sitemap/robots are cacheable for an hour. Marketing pages are static with hourly revalidation.
- Theme preview: the dashboard iframes `{store}/preview?token=…`, which verifies the signed, tenant-bound token and sets it as a short-lived httpOnly `sf_preview` cookie so the store renders the draft (framing policy in ADR-018).
- Anonymous storefront traffic skips the Supabase session refresh entirely (proxy checks for an auth cookie first).
- Images: Supabase Storage public bucket via `next/image` (`remotePatterns` limited to `/storage/v1/object/public/**` on the project host).

## 8. Money

Integers in **paise** throughout TypeScript (`lib/money.ts`); `numeric(12,2)` in Postgres. Conversion only at the
data layer. Discount % rounds **down** so the storefront never overstates a saving. Orders snapshot every price.

## 9. Configuration

All config via env, validated with zod (`lib/env/schema.ts`). Validation is lazy (first use) and `createSupabaseServerClient` reads cookies before env, so `next build` works
without secrets, but any request needing config fails fast listing the **names** (never values) of bad variables.
See `.env.example`.

## 10. Quality gates

`pnpm check` = `typecheck → lint (0 warnings) → vitest → next build`. Must pass before a slice is marked done.
