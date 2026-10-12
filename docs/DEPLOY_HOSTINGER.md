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
- **Store subdomains** (`<store>.buildbrighten.in`): need a wildcard DNS record
  (`*.buildbrighten.in` → the Hostinger server) and a certificate that covers the wildcard. Check
  that hPanel can attach the wildcard subdomain to the Node.js app.
- **Seller custom domains** (e.g. thepaliya.com): the dashboard's automatic connection uses the
  Vercel API. On Hostinger each custom domain must be added in hPanel by hand (domain + SSL),
  pointing to the same Node.js app; the app then routes it to the right store once the domain is
  verified in Settings → Domains.
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
