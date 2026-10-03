# Multi-category theme ecosystem — audit & plan

_2026-09-30. Audit made before implementation (read-only)._

## 1. Existing architecture

- Next.js 16 App Router. `proxy.ts` resolves the host: a platform host (dashboard/admin) or a store host, rewritten to `/store/[host]/…`. Tenant = verified domain (`domains` table).
- Supabase Postgres with RLS on every table. Server clients live in `src/lib/supabase/*`; the secret-key client is used only for platform operations and scripts.
- **Theme engine:** each store has `theme_versions` rows (draft / published / archived, one JSON config each). A config holds tokens, header, productCard, a layout (header/footer sections) and templates (home / collection / product), built from 30 section types (`features/theme/sections`). The renderer is `features/theme/render/*`, and the editor is `/dashboard/theme`.
- **Marketplace:** `/dashboard/themes`. Themes are code presets (`features/theme/marketplace/catalog.ts` + `presets.json`). Applying one builds a DRAFT with preset style plus the store's own content (`applyThemePreset`).

## 2–4. Stores (14) and classification

| Tenant | Slug | Owner | Products | Class |
|---|---|---|---|---|
| `71458ab4-6b05-4798-bc95-acfe1fd15420` | **the-paliya** | admin@paliya.test | 10 | **REAL — PROTECTED** |
| `10000000-…000a` | aangan | owner@aangan.test | 6 | TEST (seed.sql, DB tests, 2 test orders) |
| `10000000-…000b` | rangrez | owner@rangrez.test | 1 | TEST (seed.sql) |
| `2b675d91-…` | ind-card-1-png | shopper@example.test | 0 | **UNKNOWN — do not touch** |
| chinar, gulaabrang, pinkcity, mitti, rangeela, noor, vivaah, studioneel, desidrip, anaya | | owner@<slug>.test | 6–10 each | DEMO (created by `scripts/dev/demo-stores`, all ethnic fashion) |

The Paliya was fingerprinted before any change (`scripts/dev/protect/snapshot-tenant.mts`): a SHA-256 over every row in 30 tenant tables. Full-page screenshots of 6 pages were taken on desktop and mobile (`scripts/dev/protect/visual-baseline.mts`).

## 5–7. Themes and categories

- 11 marketplace themes, all fashion (10 derived from the demo stores, plus Jaipur Boutique). Metadata has a style "category" (heritage, craft, …) but no industry.
- The `themes` DB table exists but is empty (reserved for platform-published themes).
- There are no store/business categories anywhere, and no demo/real flag on tenants.

## 8–9. Demo data and images

- `scripts/dev/demo-stores/run.mts` creates the 10 ethnic-fashion demo stores. Product imagery is **procedurally drawn SVG garments** (`scripts/dev/demo-media/art.mjs`). It isn't AI-generated, but it is obviously illustrative and looks fake next to real photography.
- Storefront images go through `next/image` (`StoreImage`) from Supabase Storage.

## 10. Problems

1. Everything is fashion: themes, demo stores, section defaults ("The festive edit") and product attributes (fabric/length/work/occasion).
2. Presets carry style only, so different industries would reuse fashion composition.
3. There's no way to preview a theme live without applying it.
4. Demo imagery is illustrative, not photographic.
5. Store and product types are fashion-only: `product_type` has a DB check limited to fashion types plus `other`.

## 11. Modules to change

- `features/theme/marketplace/*`: industry + style metadata, per-industry theme modules, slot-aware apply.
- `features/theme/server/queries.ts`: live-preview override (demo tenants only).
- `app/store/[host]/theme-preview/*`: enter/exit preview routes.
- `app/dashboard/themes/*`: filters, search, sort, desktop/mobile/live preview.
- `features/theme/sections/*`: new `BrandStrip` section, industry-neutral defaults.
- `features/catalog/*` and the product editor: extensible `specs` (label/value) inside `attributes`.
- Storefront PDP: specs table, and the "Type" row hidden when it's "other".
- Super admin store list: category + store type.

## 12. Database changes

Migration `20260930001800_store_categories.sql` (additive, reversible):
- `store_categories` (slug, name, description, icon, position, active) with 20 seeded rows.
- `stores.category_id` (nullable).
- `tenants.store_type` (`real` | `demo` | `test`, default `real`).
- `platform_list_stores` returns category and type.

The Paliya gets **no values set**: its store_type stays the default `real` and its category stays NULL.

## 13. Theme architecture

A theme = industry + style + design tokens + header/card settings + an ordered home composition + optional collection/product templates. Home items can reference **content slots** (for example `deals`, `brands`, `smart-home`): named sections in a demo store's content pool. That lets the 5 themes of one industry compose different merchandising from the same catalogue without duplicating components. For a real store the fallback is matching by section type, which is the existing behaviour.

## 14–16. Demo, seed and preview strategy

- One showcase demo store per industry (real CC0 photography from StockSnap via Openverse, about 20 products). Its published config is a *content pool* containing every slot its themes use.
- Seeders are tenant-scoped and idempotent. They refuse to run against any slug that isn't in the demo registry, and never truncate or delete outside that tenant.
- **Live Preview:** `https://{demo}/theme-preview/{theme}` sets a preview cookie **on the demo host only**. While present, the demo store renders with that theme applied in memory: nothing is written, and it's ignored for non-demo tenants. The marketplace embeds the same URL in desktop and mobile frames.

## 17. Risks

- Shared renderer changes could alter The Paliya's look. Mitigated by the visual baseline and data-fingerprint comparison.
- Migration 1800 must be applied by the operator; the code works without it (the category and type columns just stay hidden).
- Openverse rate limits: results are cached and every image is downloaded once.
