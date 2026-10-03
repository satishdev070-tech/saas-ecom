# Going live on Vercel

The app runs on **Vercel** (Next.js), with **Supabase** (database, auth, storage), **Resend**
(email, see [EMAIL.md](./EMAIL.md)) and the **WhatsApp Cloud API** (see
[WHATSAPP_NOTIFICATIONS.md](./WHATSAPP_NOTIFICATIONS.md)). This guide is the full checklist.
The Cloudflare setup (`workers/domain-router`, Cloudflare for SaaS) is an alternative edge and is
not needed on Vercel.

## 1. Vercel project

1. Vercel → **Add New → Project** → import the Git repository. Framework preset: **Next.js**.
   Install command `pnpm install`, build command `pnpm build` (defaults are fine).
2. Pick the **Pro** plan for production. Hobby only allows daily cron jobs (the deploy fails with
   the `vercel.json` below) and limits a project to 50 custom domains.
3. Region: pick the one closest to your Supabase region (Mumbai `bom1` for an `ap-south-1` database).
4. Add the environment variables below (Settings → Environment Variables, **Production** and
   **Preview**), then deploy.

### Environment variables

From `src/lib/env/schema.ts`, plus the Vercel domain variables read by `src/lib/vercel/domains.ts`.
Secrets are never exposed to the browser: only `NEXT_PUBLIC_*` values are.

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key (RLS protects data) |
| `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN` | yes | Bare root domain, e.g. `paliya.store`. Stores live at `{slug}.{root}` |
| `NEXT_PUBLIC_PLATFORM_URL` | recommended | `https://paliya.store` (links in emails; defaults from the root domain) |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret key (server only, bypasses RLS; uses limited by ADR-006) |
| `APP_SECRET` | yes | 32+ random characters (`openssl rand -base64 48`). Signs cart/session tokens and encrypts stored credentials. **Never rotate casually**: stored credentials become unreadable |
| `CRON_SECRET` | yes | 24+ random characters. Vercel sends it as `Authorization: Bearer …` to cron routes |
| `VERCEL_TOKEN` | for custom domains | Vercel access token (Account Settings → Tokens), scoped to the team that owns the project |
| `VERCEL_PROJECT_ID` | for custom domains | Project → Settings → General → Project ID (`prj_…`) |
| `VERCEL_TEAM_ID` | if the project is in a team | Team → Settings → General → Team ID (`team_…`), sent as `teamId` |
| `RESEND_API_KEY` | for email | Without it emails are logged instead of sent ([EMAIL.md](./EMAIL.md)) |
| `EMAIL_FROM` | for email | e.g. `The Paliya <orders@mail.paliya.store>` (verified Resend domain) |
| `LOG_LEVEL` | no | `info` (default), `debug`, `warn`, `error` |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `META_WEBHOOK_VERIFY_TOKEN` | optional | Fallbacks: set these in Admin → Social apps instead |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | optional | Fallback for Admin → Social apps |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | optional | Fallback for Admin → Social apps (Google Business) |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY` | optional | AI fallbacks for Admin → Social apps |
| `EDGE_SHARED_SECRET` | no (Cloudflare only) | Only for the Cloudflare Worker; leave unset on Vercel |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN_CNAME_TARGET` | no (Cloudflare only) | Ignored for new domains when the Vercel variables are set |

WhatsApp and email notification variables, if any, are listed in
[WHATSAPP_NOTIFICATIONS.md](./WHATSAPP_NOTIFICATIONS.md) and [EMAIL.md](./EMAIL.md).

`VERCEL_*` are read straight from the environment (not yet in `src/lib/env/schema.ts` or in
Admin → Social apps). The token is used only on the server and never logged.

## 2. Platform domain and store subdomains

Every store gets `{slug}.{root}` (for example `ramya-by-ayushi-paliya.paliya.store`). This needs
a **wildcard domain** on the Vercel project:

1. Project → Settings → **Domains** → add `paliya.store`, `www.paliya.store` (redirect to the
   apex) and `*.paliya.store`.
2. Wildcards need Vercel to answer DNS challenges for the certificate. Easiest: at your registrar,
   change the domain's **nameservers** to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
   **Before switching**, copy every existing record (MX for email, Resend's SPF/DKIM TXT records,
   other TXT verifications) into Vercel DNS.
   If you can't move nameservers, Vercel documents a fallback: delegate `_acme-challenge` with two
   `NS` records to `ns1.vercel-dns.com.`/`ns2.vercel-dns.com.` and add `CNAME *` to the value Vercel shows.
3. Set `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN=paliya.store` and redeploy.

The proxy (`src/proxy.ts`) reads the `Host` header, classifies it and rewrites store hosts to
`/store/[host]`. A store subdomain resolves only through the `domains` table (`status = 'verified'`).

## 3. Supabase production settings

1. Run every file in `supabase/migrations/` in order (or paste the `supabase/dev/apply-*.sql`
   files in order into the SQL editor; migration 21 is `apply-2100.sql`).
2. Authentication → URL Configuration:
   - **Site URL**: `https://paliya.store`
   - **Redirect URLs**: `https://paliya.store/**`, `https://*.paliya.store/**`, and each custom
     store domain, e.g. `https://thepaliya.com/**` and `https://www.thepaliya.com/**`. Add a
     store's custom domain here when it goes live, or shopper login on that domain fails.
3. Authentication → SMTP: use Resend's SMTP so auth emails come from your domain. Full steps in
   [EMAIL.md](./EMAIL.md).
4. Google sign-in (optional): [GOOGLE_LOGIN.md](./GOOGLE_LOGIN.md).
5. Storage buckets and RLS come from the migrations. Don't change them in the dashboard.

## 4. Cron jobs

`vercel.json` registers the cron routes. Vercel calls each one with `GET` and
`Authorization: Bearer $CRON_SECRET`, which `isAuthorizedCronRequest` checks (constant-time).

| Route | Schedule | Does |
|---|---|---|
| `/api/cron/social-publish` | every 5 min | Publishes scheduled social posts |
| `/api/cron/expire-orders` | every 5 min | Cancels unpaid orders whose stock hold expired |
| `/api/cron/domains` | every 15 min | Re-checks custom domains (ownership, Vercel status, SSL) |
| `/api/cron/gbp-reviews` | every 6 h | Refreshes cached Google reviews |

<!-- TODO(notifications): roles C/D add `/api/cron/notifications` (retries / abandoned carts).
     When the route exists, add it to vercel.json, e.g.
     { "path": "/api/cron/notifications", "schedule": "*/10 * * * *" } -->

Hobby plans reject anything more frequent than daily, so use Pro. Test a route by hand:
`curl -H "Authorization: Bearer $CRON_SECRET" https://paliya.store/api/cron/domains`.

## 5. Custom domains for sellers (Dashboard → Settings → Domains)

With `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` set:

1. **Add**: the seller enters `brand.in` or `www.brand.in`. We insert a pending row (the hostname
   is unique across stores), then add it to the Vercel project
   (`POST /v10/projects/{id}/domains`). If the apex/www companion is free, it is added too, as a
   **308 redirect** to the domain the seller entered. If Vercel refuses (the domain is on another
   Vercel project), the row is released and the seller sees why.
2. **DNS records shown** (exact values from the Vercel API, stored in `domains.dns_records`):
   - `TXT _paliya-verify.<host>` = the store's token: proves the store owns the domain.
   - Apex: `A <host>` = Vercel's rank-1 `recommendedIPv4` (`GET /v6/domains/{d}/config`).
   - Subdomain: `CNAME <host>` = Vercel's rank-1 `recommendedCNAME` (project-specific,
     e.g. `….vercel-dns-017.com`). `76.76.21.21` / `cname.vercel-dns.com` are used only if the API
     returns no recommendation.
   - `TXT` records from Vercel's `verification[]`, when Vercel needs proof (the domain is used by
     another Vercel account).
   - The companion's A/CNAME record.
3. **Check now / cron**: our TXT check over DNS-over-HTTPS, plus `GET /v9/projects/{id}/domains/{d}`
   (and `POST …/verify` while unverified), plus the config call. `domains.provider_status`:
   - `verifying`: Vercel needs its TXT record
   - `pending_dns`: nothing points at Vercel yet
   - `misconfigured`: DNS points elsewhere or conflicts
   - `active`: Vercel reports `misconfigured: false`, so it can issue the certificate
   - `error`: Vercel couldn't be reached; the last known state is kept
4. **Routing**: the row becomes `verified` (and so resolves to the store) only when our TXT matches
   **and** Vercel says `verified: true`. `ssl_status = 'active'` only when the state is `active`.
   Nothing is ever marked active without the API saying so.
5. **Primary**: allowed only once SSL is active. The primary host is the canonical URL for SEO.
6. **Remove**: soft-removes the row (the host stops resolving immediately), then
   `DELETE /v9/projects/{id}/domains/{d}` with `removeRedirects: true`, which also removes the
   companion. Unverified domains are released after 30 days and removed from Vercel too.

Domains that were verified before Vercel was configured are registered on Vercel by the next
cron run (verified rows are re-checked daily, or every run while SSL isn't active).

## 6. Store go-live steps

### The Paliya (`thepaliya.com`, live store)

Its data must not change during the move. Only the DNS and Vercel project change.

1. A day before: lower the TTL of the current `thepaliya.com` and `www` records to 300 s.
2. Deploy to Vercel with all variables set. Confirm the store works on
   `the-paliya.<root>` (its platform subdomain).
3. Dashboard → Settings → Domains (as The Paliya's owner). If `thepaliya.com` is already listed
   as verified, press **Check now**: it is registered on Vercel and the records appear.
   Otherwise add `thepaliya.com`. The `www` redirect is added automatically.
4. At the registrar: keep the `_paliya-verify` TXT, set `A @` and `CNAME www` to the values shown,
   and delete any other A/AAAA/CNAME records for those names. Add Vercel's TXT record if shown.
5. Press **Check now** until it shows **Live with SSL**, then **Make primary**.
6. Add `https://thepaliya.com/**` and `https://www.thepaliya.com/**` to the Supabase redirect URLs.
7. Payment gateways and webhooks: update any provider dashboards that list the old domain.

### Ramya By Ayushi Paliya

1. It works right away at `ramya-by-ayushi-paliya.<root>` once the wildcard (section 2) is live.
2. For a custom domain, open Dashboard → Settings → Domains as Ramya's owner and repeat steps
   3–6 above with that domain (the plan must include custom domains).

## 7. After deploy

- Admin → Social apps: enter the Meta/Pinterest/Google/AI credentials.
- Send a test order email and WhatsApp message ([EMAIL.md](./EMAIL.md), [WHATSAPP_NOTIFICATIONS.md](./WHATSAPP_NOTIFICATIONS.md)).
- Check Vercel → Logs for `domains.vercel_*` errors after the first cron runs.
