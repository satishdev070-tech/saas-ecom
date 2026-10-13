# Deploying on Hostinger (Node.js app)

Hostinger's build servers run an older Linux (glibc < 2.29), so Next.js can't load its native
compiler (`GLIBC_2.29 not found`) and falls back to the WebAssembly one. Two consequences:

1. The config must be plain JavaScript: **`next.config.mjs`** (a `next.config.ts` fails with
   "Cannot find module … next.config").
2. Turbopack (the default bundler) needs the native compiler. **`pnpm run build`
   (`scripts/build.mjs`) detects this** (glibc older than 2.29, or the native compiler fails to
   load) and builds with webpack instead; everywhere else, including Vercel, it uses Turbopack.
   Hostinger doesn't let you change the build command, so no setting is needed. Force either with
   `NEXT_BUNDLER=webpack` or `NEXT_BUNDLER=turbopack`. Verified: with the native compiler hidden,
   `pnpm run build` picks webpack and builds; `next start` serves the result.

## hPanel settings

| Setting | Value |
|---|---|
| Node.js | 20 (or 22) |
| Package manager | pnpm |
| Build command | `pnpm run build` (default; picks webpack automatically) |
| Start command | `pnpm start` (`next start`, listens on `$PORT`) |
| Output directory | `.next` |

**Environment variables**: the same as Vercel (`docs/DEPLOY_VERCEL.md`): Supabase URL and keys,
`APP_SECRET`, `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN`, `NEXT_PUBLIC_PLATFORM_URL`, `CRON_SECRET`,
`EMAIL_FROM` / Resend, payment keys… Leave the `VERCEL_*` variables out.

## What works differently than on Vercel

- **Scheduled jobs**: `vercel.json` crons don't run on Hostinger. Add cron jobs in hPanel (daily is
  fine), each calling one route with the cron secret:
  ```
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.buildbrighten.in/api/cron/expire-orders
  ```
  Routes: `/api/cron/expire-orders`, `/api/cron/domains`, `/api/cron/notifications`,
  `/api/cron/social-publish`, `/api/cron/gbp-reviews`.
- **Store subdomains and custom domains**: see "Store subdomains and custom domains" below.
- **Image resizing** uses `sharp` at runtime (`/api/img`, uploads). If uploads or images fail
  with a `sharp`/`libvips` error, the server's Linux is too old for sharp's prebuilt binary;
  report it and we'll switch the copies to be made elsewhere.
- **Memory**: the build needs roughly 2 GB RAM. If the build is killed without an error,
  the plan's limit is too low; build in GitHub Actions instead and upload `.next`.

## "Something went wrong · Reference: …" on every page

The build worked but the server fails while rendering. Open
**`https://<your domain>/api/health/ready`**. It lists any missing or invalid environment
variables (names and reasons only, never values) and whether Supabase answers:

```json
{"ok":false,"env":{"ok":false,"issues":["SUPABASE_SECRET_KEY: Invalid input: expected string, received undefined"]},"supabase":{"ok":true,"detail":"reachable"}}
```

- **`env` issues**: add the named variables in hPanel → Node.js app → Environment variables
  (or `.env`), then **redeploy**. A redeploy is needed, not just a restart, because `NEXT_PUBLIC_*`
  values are baked in at build time. `APP_SECRET` needs 32+ characters; the Supabase keys
  come from Supabase → Project settings → API keys.
- **`supabase` unreachable**: wrong `NEXT_PUBLIC_SUPABASE_URL`, a paused Supabase project, or
  the server blocks outbound HTTPS.
- **`ok: true` but pages still fail**: hPanel → Node.js app → Logs. Search for the reference
  number shown on the error page; the line next to it is the real error.

## Store subdomains and custom domains

On Vercel these just worked: Vercel accepted any host (`*.buildbrighten.in`, `thepaliya.com`) and
issued certificates automatically. Hostinger serves the Node.js app only for the domain it is
attached to (`buildbrighten.in`) and does not issue wildcard certificates. Without help:
- `the-paliya.buildbrighten.in` fails with `DNS_PROBE_FINISHED_NXDOMAIN`, because the wildcard
  DNS record went away when DNS moved off Vercel;
- `thepaliya.com` still points to Vercel and shows "This deployment is temporarily paused".

The fix uses the free Cloudflare plan in front, with the domain-router Worker
(`workers/domain-router`). Cloudflare handles certificates for every store host. The Worker
forwards each request to `https://buildbrighten.in` and adds a signed header naming the real host
(`EDGE_SHARED_SECRET`). The app trusts that header only when the signature is valid, and serves
the right store.

### 1. Shared secret
Generate 40+ random characters (e.g. `openssl rand -hex 32`). Add it in hPanel → Node.js →
Environment variables as `EDGE_SHARED_SECRET`, then redeploy. Keep it: the Worker needs the same
value.

### 2. Put buildbrighten.in on Cloudflare (free)
1. In Cloudflare → Add a domain → `buildbrighten.in` → Free plan. Check that the imported
   records include your MX/TXT (email) records.
2. DNS records:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | `@` | Hostinger server IP (hPanel → Hosting → Details) | DNS only (grey) |
   | CNAME | `www` | `buildbrighten.in` | DNS only (grey) |
   | A | `*` | the same Hostinger IP | **Proxied (orange)** |
   Leaving the apex and www grey keeps Hostinger's own SSL working.
3. SSL/TLS → Overview → **Full (strict)**.
4. At your registrar, replace the nameservers with the two Cloudflare gives you. This usually
   takes minutes, but can take up to 24 h.

### 3. Put thepaliya.com on Cloudflare (free)
1. Add `thepaliya.com` as a second domain, Free plan. Keep its MX/TXT records.
2. Delete its old A/CNAME records that point at Vercel (`76.76.21.21`, `cname.vercel-dns.com`),
   then add:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | `@` | `192.0.2.1` | **Proxied (orange)** |
   | A | `www` | `192.0.2.1` | **Proxied (orange)** |
   `192.0.2.1` is a placeholder. The Worker answers every request, so nothing is ever sent to it.
3. SSL/TLS → **Full (strict)**, then change the nameservers at the registrar.

### 4. Deploy the Worker (from your computer, once)
```
cd workers/domain-router
npx wrangler login
npx wrangler secret put EDGE_SHARED_SECRET     # paste the value from step 1
npx wrangler deploy
```
`wrangler.toml` already routes `*.buildbrighten.in`, `thepaliya.com` and `www.thepaliya.com` to
the Worker. To connect another seller's domain later, add that domain as a Cloudflare zone, add its
two routes to `wrangler.toml` and deploy again. (Automating this needs Cloudflare for SaaS:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN_CNAME_TARGET`.)

### 5. Check
- `https://the-paliya.buildbrighten.in` → the store.
- `https://thepaliya.com` → redirects to `https://www.thepaliya.com` → the store.
- On a store, add to cart and log in once. If either shows "Invalid Server Actions request",
  Hostinger is overwriting `X-Forwarded-Host`; report it so the app can allow the store hosts.

- `HTTP ERROR 429` on store pages: Hostinger is throttling the burst of requests that arrives
  from Cloudflare's addresses. The Worker keeps `/_next/static/*` (hashed build files) in
  Cloudflare's cache so only page requests reach Hostinger; redeploy the Worker
  (`npx wrangler deploy`) after pulling the latest code.

Free Workers plan: 100,000 requests a day, which is plenty for now.
