# Security Audit

_2026-09-25. Scope: auth, authorization, tenant isolation, RLS, server actions, route handlers, uploads,
webhooks, secrets. No critical or high findings._

## Verified controls

| Control | Evidence |
|---|---|
| Tenant never from the client | storefront: `resolveStorefrontTenant` requires route host == proxy-verified `x-paliya-host`; dashboard: `requireTenant()` from memberships; admin: `requirePlatform()` from `platform_memberships` |
| RLS everywhere | RLS enabled on every table in the migrations; composite `(tenant_id,id)` FKs; guard triggers on privileged columns |
| Isolation tests | 74 DB tests incl. tenant A/B read/update/delete/move, anon limits, customer A/B (orders, addresses, wishlist, customers), shopper → seller/platform denial, support-session expiry |
| Admin console | 404 for non-staff (no existence leak); separate `/admin/login`; role from DB, not UI |
| Server actions | zod validation + permission checks; Next Origin check (CSRF) |
| Route handlers | Razorpay HMAC signature verified; cron endpoints require `CRON_SECRET` bearer; new `/search/suggest` is read-only, host-scoped, rate-limited (120/min/IP) |
| Open redirects | `safeRedirectPath` on every `next`; admin login only redirects within `/admin` |
| XSS | `dangerouslySetInnerHTML` only for JSON-LD via escaped serializers (7 call sites); no tenant HTML rendered |
| Uploads | magic-byte sniffing (no SVG), 10 MB per image, tenant-prefixed paths enforced by storage RLS **and** a DB check |
| Secrets | `SUPABASE_SECRET_KEY` only read in `lib/env` + `lib/supabase/admin.ts` (`server-only`); never `NEXT_PUBLIC_`; payment secrets AES-GCM encrypted; admin integrations page shows presence only |
| Rate limits | login, OTP, signup, reset, cart, checkout, forms, search suggest |
| Framing | storefront `frame-ancestors 'self' <platform>`; platform `frame-ancestors 'self'` + XFO |

## Secret-key client usage (ADR-006 review)

Used in 29 files. All follow one of: server-resolved tenant (cart/checkout, storefront forms, events), verified
webhook, platform action after `requirePlatform`, cron, audit/rate-limit infrastructure, or server-only settings
after `assertPermission` (`getRazorpaySettings`). No path takes a tenant id from input. **Recommendation:** add a
lint rule or CODEOWNERS entry for new `createSupabaseAdminClient` imports, as the list has grown past ADR-006's text.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | Medium | Server Actions capped at 1 MB made uploads fail. Not a vulnerability, but it pushed users toward workarounds | fixed (25 MB request cap, 10 MB per image unchanged) |
| S2 | Low | Staff sign-in page claimed "Access is logged" when sign-ins aren't audited | copy corrected |
| S3 | Low | Full CSP (script-src nonces) not enabled | open (ADR-018) |
| S4 | Low | `.env` contains the publishable key only; `.env.local` holds secrets and is git-ignored (`.env*`) | OK, but the repo is not under git yet: initialise git before sharing |
| S5 | Info | Seed accounts share password `Paliya@12345` | dev-only; never run `seed.sql` or `setup-all.sql` on production |
| S6 | Info | Sign-ins to `/admin/login` are not written to the platform audit log | recommend auditing staff sign-ins |

## Files changed for security

`next.config.ts`, `src/lib/auth/landing.ts`, `src/lib/auth/session.ts`, `src/lib/tenant/membership.ts`,
`src/lib/tenant/routing.ts` (`/seller` platform-only), `src/app/admin/login/page.tsx`,
`src/app/store/[host]/account/auth/callback/route.ts`, `tests/rls/tenant-isolation.test.ts`, `tests/rls/platform.test.ts`.
