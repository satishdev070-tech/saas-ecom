# The Paliya — multi-tenant fashion commerce SaaS

Shopify-style platform for Indian fashion brands: each seller gets a storefront on its own subdomain or custom domain, a seller dashboard, and a configurable theme. The platform itself is run from a super-admin console.

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage, RLS) · Cloudflare (edge/domains) · Zod · Vitest
- **Docs:** start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). The original blueprint is `docs/00`–`10`.

## Getting started

```bash
# Node >= 20.9, pnpm 10
pnpm install
cp .env.example .env.local     # fill in Supabase URL + keys
pnpm dev
```

Open:
- Platform: http://localhost:3000
- A storefront: http://acme.localhost:3000 (404 until the store exists in the database: Phase 2+)

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm typecheck` | Generate route types + `tsc --noEmit` |
| `pnpm lint` | ESLint, zero warnings allowed |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm build` | Production build |
| `pnpm check` | All of the above, in order: the gate for every slice |
| `pnpm db:types` | Regenerate Supabase types (requires Supabase CLI + local stack) |

## Ground rules

- Never trust a tenant id from the browser. Tenant comes from the verified host or the user's membership.
- Supabase clients are created only in `src/lib/supabase/*`. The secret-key client is server-only and reserved for the cases in ADR-006.
- Every mutation: validate → authenticate → authorize → transaction → audit → safe result (`runAction`).
- No tenant content, brand or navigation hard-coded in code; storefronts are theme-config driven.
