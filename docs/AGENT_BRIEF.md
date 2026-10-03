# Multi-agent build brief (Phases 4–11)

Repository: `/home/claude/saas-ecom` (Next.js 16 App Router, TypeScript strict, Tailwind 4, Supabase).
Read first: `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, blueprint `docs/00`–`10`, and the migrations in `supabase/migrations/` (the schema is DONE and tested — build on it).
Next 16 differs from older versions: read `node_modules/next/dist/docs/` for anything you're unsure of (params/searchParams/cookies/headers are async; `proxy.ts` not middleware; error boundaries get `retry`, not `reset`; `PageProps<"/route">`/`LayoutProps<"/route">` are global helpers after `pnpm typecheck`).

## Contracts you MUST use (do not re-implement)

| Need | Use |
|---|---|
| DB types | `src/lib/supabase/database.types.ts` (`Tables<"products">`, etc.) |
| User-scoped DB client (RLS enforced) | `createSupabaseServerClient()` from `@/lib/supabase/server` |
| Anonymous public reads (storefront catalog, cacheable) | `createSupabasePublicClient()` from `@/lib/supabase/public` |
| Secret-key client (bypasses RLS) | `createSupabaseAdminClient()` from `@/lib/supabase/admin` — ONLY for: host lookup, carts/checkout (signed cart token), webhooks after signature check, platform ops after `requirePlatform()`, cron, audit writes. Always filter by a server-resolved tenant id. |
| Dashboard context | `requireTenant()` / `requireTenantPermission(perm)` / `assertPermission(ctx, perm)` / `can(ctx, perm)` from `@/lib/tenant/membership` |
| Platform (super admin) context | `requirePlatform(perm?)` / `assertPlatformPermission` from `@/lib/platform/access` |
| Storefront tenant | `resolveStorefrontTenant(params.host)` from `@/lib/tenant/resolve` (returns `{tenantId, slug, name, status, host, primaryHost}` or null) |
| Signed-in user | `getSessionUser()` / `requireUser(next)` from `@/lib/auth/session` |
| Server actions | `runAction(name, fn)` + `parseInput(schema, formToObject(fd))` → `ActionResult`; forms use `useActionState` + `FormMessage`/`fieldErrors`/`SubmitButton` from `@/components/ui/form` |
| DB error → safe error | `mapDbError(error)` from `@/lib/supabase/errors` |
| Validation primitives | `@/lib/validation/common` (slug, email, indianMobile, pincode, gstin, moneyMinor, pagination) |
| Money | `@/lib/money` (`toMinor`, `toDecimalString`, `formatMoney`, `discountPercent`). PostgREST returns numeric as JS number (rupees); convert with `toMinor()` before arithmetic. |
| Images | `uploadTenantImage(tenantId, area, file)` from `@/lib/storage/upload`; display with `assetUrl(path)` from `@/lib/storage/assets` + `next/image` |
| Audit | `audit({ tenantId, actorUserId, action: "product.deleted", entityType, entityId, metadata })` from `@/lib/audit` |
| Rate limit | `rateLimit(bucket, subject, limit, windowSeconds)` + `clientIpKey()` from `@/lib/rate-limit` |
| Signed tokens / secrets | `signToken`, `verifyToken`, `encryptSecret`, `decryptSecret`, `hashToken`, `randomToken` from `@/lib/crypto` |
| Safe redirects | `safeRedirectPath()` from `@/lib/http/safe-redirect` |
| URLs | `platformOrigin()`, `storeOrigin(host)`, `storeSubdomain(slug)` from `@/lib/platform/urls` |
| UI primitives | `@/components/ui/*`: `Button`, `TextField`/`TextAreaField`/`SelectField`/`CheckboxField`/`inputClassName`, `PageHeader`, `Card`, `Badge`, `StatCard`, `Table` + `th`/`td`, `Pagination`, `ConfirmButton`, `Skeleton`/`EmptyState`/`ErrorState` |
| Dashboard nav | `src/components/dashboard/nav.ts` already lists every dashboard route; build pages at those hrefs |

Key SQL RPCs already implemented (see migrations): `create_tenant`, `accept_invitation`, `adjust_inventory`, `set_inventory`, `variant_stock` (public), `cancel_order`, `update_fulfillment`, `update_return_status`, `publish_theme`, `rollback_theme`, `start_support_session`, `end_support_session`, `set_tenant_status`, and service-role-only `svc_place_order`, `svc_mark_order_paid`, `svc_cancel_order`, `svc_expire_unpaid_orders`, `svc_create_return`, `svc_record_refund`, `svc_issue_invoice`, `svc_rate_limit`.

## Resuming

An earlier run of your agent started this work and was stopped part-way. Files in your ownership may already exist (logic, schemas, some pages). **Read them first**, keep what is correct, fix what is wrong, and finish the rest. Do not rewrite working code for style.

## Shared machine (2 CPUs, 7 GB RAM, 6 agents in parallel)

- Run `pnpm typecheck` a handful of times, not after every edit. Never run `pnpm build`, `pnpm dev` or `next start`.
- Never touch the coordinator's DB on port 54329; use your own port below.
- Do not commit to git; the coordinator commits.

## Rules

1. **Own only your files** (ownership table below). Never edit files owned by another agent, and never edit shared foundation files: `src/lib/**`, `src/components/ui/**`, `src/components/dashboard/**`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/dashboard/layout.tsx`, existing migrations, `package.json`, lockfile, configs. If you need a change there, describe it in your final report under "Requests for coordinator".
2. **No new npm dependencies.** Use `fetch` for external APIs (Razorpay, Shiprocket, Resend, Cloudflare).
3. **Schema changes**: avoid. If truly required, add a NEW migration file in your number range, apply it to YOUR test DB, run `DATABASE_URL=<your db> node scripts/db/gen-types.mjs`, and report it.
4. **Security**: never trust tenant ids from the client; every mutation = validate → authenticate → authorize → execute → audit (sensitive) → safe result. No `dangerouslySetInnerHTML` except JSON-LD built with `JSON.stringify` and `<` escaped. No raw HTML from users. No open redirects.
5. **Every page**: loading state (`loading.tsx` or Suspense skeleton), empty state, error state, success feedback, permission check, responsive (mobile first), accessible labels/headings/focus.
6. **Tests**: add Vitest unit tests for pure logic in `tests/unit/<your-area>/*.test.ts`; add DB tests for any new SQL in `tests/rls/<your-area>.test.ts`.
7. **Validation before you finish** (don't run `pnpm build`; the coordinator builds centrally):
   - `pnpm typecheck` — zero errors in YOUR files (ignore errors in files another agent is mid-way through; mention them).
   - `pnpm exec eslint --max-warnings=0 <your paths>`
   - `pnpm exec vitest run tests/unit/<your-area>`
   - DB tests (only if you touched SQL or wrote DB tests): use YOUR port — `TEST_DB_PORT=<port> TEST_DB_DIR=/tmp/paliya-db-<you> scripts/db/test-db.sh reset` then `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/postgres pnpm exec vitest run --config vitest.db.config.mts tests/rls/<your file>`
8. **Final report** (your last message): files created/changed, migrations, tests + results, what's done vs not, risks, requests for coordinator. Keep it under 400 words.

## Ownership

| Agent | Owns (create/edit only these) | Migration range | Test DB port |
|---|---|---|---|
| **A — Catalog & Inventory** | `src/features/catalog/**`, `src/features/inventory/**`, `src/app/dashboard/{products,collections,categories,inventory,size-charts}/**`, `tests/unit/catalog/**` | 0800–0849 | 54331 |
| **B — Theme & Storefront** | `src/features/theme/**`, `src/features/storefront/**`, `src/app/store/[host]/**` EXCEPT `cart`, `checkout`, `account`, `orders` subtrees; `src/app/dashboard/theme/**`, `tests/unit/theme/**`, `tests/unit/storefront/**` | 0850–0899 | 54332 |
| **C — Commerce (cart, checkout, payments, shipping, customer account, notifications)** | `src/features/{cart,checkout,payments,shipping,customer-account,notifications}/**`, `src/app/store/[host]/{cart,checkout,account,orders}/**`, `src/app/api/{store,webhooks,cron}/**` (except `api/cron/domains`), `tests/unit/commerce/**`, `tests/rls/commerce*.test.ts` | 0900–0949 | 54333 |
| **D — Seller operations dashboard** | `src/features/{orders-admin,customers,marketing,content,analytics,settings,team,reviews}/**`, `src/app/dashboard/page.tsx`, `src/app/dashboard/{orders,returns,customers,discounts,reviews,content,analytics}/**`, `src/app/dashboard/settings/**` EXCEPT `domains`, `tests/unit/dashboard/**` | 0950–0999 | 54334 |
| **F — Marketing landing page (docs/08)** | `src/app/page.tsx`, `src/app/(marketing)/**`, `src/features/marketing-site/**`, `public/marketing/**`, `tests/unit/marketing-site/**` | none | none |
| **E — Platform, super admin, domains & edge** | `src/features/{platform,domains}/**`, `src/app/admin/**`, `src/app/dashboard/settings/domains/**`, `src/app/api/cron/domains/**`, `workers/domain-router/**`, `tests/unit/platform/**`, `tests/unit/domains/**` | 1000–1049 | 54335 |

## Cross-agent interfaces (agree on these names)

- **B → C**: storefront header shows a cart link to `/cart` and account link to `/account`; product page "Add to cart"/"Buy now" call C's server actions `addToCartAction(fd)` (fields `variantId`, `quantity`, optional `buyNow=1`) exported from `@/features/cart/actions`. C creates that file early with this exact signature: `export async function addToCartAction(prev: ActionResult<{ count: number }> | null, fd: FormData): Promise<ActionResult<{ count: number }>>`. Cart count for the header: `getCartCount(tenantId): Promise<number>` exported from `@/features/cart/queries`. B may import these; if not yet present when you typecheck, write the import anyway and note it.
- **B → C**: wishlist toggle `toggleWishlistAction(fd)` (`productId`) lives in `@/features/customer-account/actions` (C).
- **B (theme) exposes** for others: `getPublishedThemeConfig(tenantId)` and `ThemeTokensStyle` from `@/features/theme` so C's cart/checkout/account pages render inside the same storefront chrome (the `/store/[host]/layout.tsx` owned by B wraps all store routes, including C's).
- **D ↔ C**: order refunds from the dashboard call `refundOrder()` exported by C in `@/features/payments/refunds.ts` (`refundOrder({ ctx, orderId, amountMinor, reason, returnId? })`), which calls Razorpay when the payment was online and then `svc_record_refund`. D builds the UI; C builds the function.
- **D uses** `sendOrderNotification(tenantId, orderId, key)` from `@/features/notifications/send.ts` (C) after fulfilment updates.
- **E exposes** `lib`-level domain helpers only inside `src/features/domains/**`; D's settings pages link to `/dashboard/settings/domains` (E).
