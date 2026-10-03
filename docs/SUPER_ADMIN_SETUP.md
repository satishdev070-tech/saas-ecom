# Super admin setup

The platform super admin is created from environment variables by a one-off script. No credentials
live in code, in the browser bundle, in API responses or in logs.

## First-time bootstrap

1. Apply all migrations (fresh project: `supabase/setup-all.sql`; existing project: `supabase/dev/apply-phase3.sql`).
2. Set, only in the shell or a local untracked env file:
   ```bash
   SUPER_ADMIN_EMAIL=you@company.com
   SUPER_ADMIN_INITIAL_PASSWORD='a-long-unique-passphrase-1A'
   ```
   The password must be ≥ 12 characters with upper-case, lower-case and a digit.
3. Run `pnpm admin:bootstrap`. It reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env` / `.env.local`.
4. Sign in at `/admin/login`, then **remove `SUPER_ADMIN_INITIAL_PASSWORD`** from the environment and change the password.

What the script does (`scripts/admin/bootstrap-super-admin.mts`):

- Creates the auth user with a confirmed email through the Supabase Admin API, or finds the existing one.
- Upserts `platform_memberships (role = super_admin, status = active)`.
- Writes an `audit_logs` row `platform.super_admin_bootstrapped` (actor type `system`, no password).
- Is idempotent: an existing user keeps their password unless you pass `--reset-password`.
- Prints only the email and outcome, never the password.

## Local development

`supabase/seed.sql` still creates `admin@paliya.test` for local and demo databases only. Never load
the seed into production. In production, create admins only with the bootstrap script, or invite
more staff from **Admin → Platform users**.

## Store directory (`/admin/stores`)

`/admin/tenants` redirects here and keeps its filters. One SQL call (`platform_list_stores`, which
checks `platform.tenants.read`) does the work:

- Columns: store, owner email, plan, status, domain, products, orders, customers, revenue (paid orders), created, last activity, actions.
- Search: store name, slug, owner email, domain or tenant ID (server-side, parameterised).
- Filters: status, plan, created-from/to dates (IST). Sort: newest, oldest, revenue, orders, products, last activity.
- Server-side pagination (25 per page).

Store detail (`/admin/tenants/{id}`): usage meters, monthly sales, profile, domains, team, feature
flags with overrides, a **Configuration** card (published theme, COD, default courier, status of
every payment, shipping, analytics and social integration, never credentials) and recent activity.
Suspend, reactivate, change plan and extend trial all need a written reason and are audited.
Support access is read-only, time-boxed and audited (ADR-027).

## Store integrations overview (`/admin/integrations`)

Counts per provider (active, live mode, failing, configured) and a list of failing or expired
connections with a link to each store. The query selects status columns only; `public_config` and
`secrets_encrypted` are never read for this page.
