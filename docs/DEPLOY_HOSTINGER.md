# Deploying on Hostinger (Node.js app)

Hostinger's build servers run an older Linux (glibc < 2.29), so Next.js can't load its native
compiler (`GLIBC_2.29 not found`) and falls back to the WebAssembly one. Two consequences:

1. The config must be plain JavaScript: **`next.config.mjs`** (a `next.config.ts` fails with
   "Cannot find module … next.config").
2. Turbopack (the default `next build`) needs the native compiler, so build with **webpack**:
   **`pnpm run build:webpack`** (`next build --webpack`). Verified: this builds and serves with only
   the WebAssembly compiler available (about 3 minutes).

Vercel keeps using `pnpm run build` (Turbopack).

## hPanel settings

| Setting | Value |
|---|---|
| Node.js | 20 (or 22) |
| Package manager | pnpm |
| Build command | `pnpm run build:webpack` |
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
