# UI / UX Audit

_2026-09-25. Based on browser walkthroughs at 1440×900 of the storefront, seller dashboard and platform console.
The reference stores listed in the brief were **not** re-surveyed live in this pass. The recommendations below
follow established Indian fashion D2C patterns (announcement bar, category mega menu, 4:5 imagery, size guide,
PIN-code delivery check, COD messaging) without copying any store's branding, content or layout._

## Three experiences, one system

| Surface | Palette / identity | Change in this pass |
|---|---|---|
| Storefront | Theme tokens (`--sf-*`), serif headings, ivory ground, per-tenant configurable | chrome rebuilt (below) |
| Seller dashboard | Warm neutrals (`:root` tokens), light/dark | real home overview |
| Platform console | **New `.theme-console`**: cool neutrals + blue accent, light/dark | staff can always tell they are operating the platform, not a store |

All three share `components/ui/*` (buttons, fields, cards, tables, badges), so styles stay consistent.

## Storefront — found → fixed

| Found | Fixed |
|---|---|
| Nav items doubled (duplicate seed rows) | seed idempotent + cleanup SQL |
| Hero shrank to a narrow panel; "New arrivals" cards ~5% wide | `.sf-scroll-row` flex fix (hero full-bleed, 4-up rows) |
| No product imagery; grey boxes everywhere | original generated demo art (3 views per product, hero, editorial, category tiles) via `scripts/dev/demo-media` |
| Header icons were text glyphs (⌕ ◯ ♡ 👜 ☰) | SVG line-icon set (`components/icons.tsx`), 40 px touch targets |
| Search = plain input to the results page | search overlay: live suggestions (products with image/price, categories, collections), recent searches, popular links, no-result guidance |
| Add to bag gave only inline text | cart drawer slides in: lines, qty, remove, save for later, subtotal, free-shipping progress, Checkout / View bag |
| Mobile menu was a `<details>` panel | left drawer (native `<dialog>`: focus trap, Esc, backdrop close, scroll lock), accordion sub-menus, account/wishlist/track-order links |
| Sticky header had no scroll state | subtle shadow once scrolled |
| PDP rating below the CTAs | rating under the title (links to reviews), SKU of the selected variant shown |
| Hero ignored the "mobile image" setting | separate mobile art on small screens |
| Shoppers couldn't reset a password | forgot/reset flow on the store's own domain |

Motion: drawers 260 ms, overlay 220 ms, backdrop fade. All disabled by the global `prefers-reduced-motion` rule.

## Seller dashboard — found → fixed

| Found | Fixed |
|---|---|
| Home was a greeting only | overview: setup checklist (auto-hides at 5/5), KPI strip with period-over-period change, 30-day revenue chart, recent orders, orders to fulfil, low stock list, top products; panels hidden when the role lacks the permission; no invented numbers |
| Revenue chart one solid block | zero-filled days, date captions, hover values, screen-reader values |
| Theme preview cramped (desktop showed mobile layout) | editor page full width; preview renders at 1280/390 px and scales to fit |
| Seller vs customer vs staff login unclear | `/seller/login` "Seller centre" screens; staff `/admin/login` in console styling; shoppers sign in on the store |

## Platform console — found → fixed

- Tenants table now shows **Owner, Plan, Status (+ trial end), Products, Orders, GMV, Created**.
- Sign-out returns staff to the console sign-in, not the seller one.

## Remaining UI/UX work (honest list)

1. **Responsive sweep** at 320/375/390/414/768/1024/1280/1440/1920 with screenshots. Layouts use container queries and were designed mobile-first, but not every page was checked visually at every width in this pass.
2. Mega menu "featured" tile (image + CTA) per top-level item; seed menus currently have no children to show.
3. Product card: colour-swatch dots and a size preview on hover.
4. Theme editor: drag-and-drop ordering, section duplicate, inline image picker backed by a media library.
5. Dashboard tables on mobile: convert the widest tables (orders, products) to card lists below 640 px (currently they scroll horizontally).
6. Reviews: rating distribution bars and photo reviews.
7. Collection page: optional "load more" instead of numbered pagination on mobile.

## Files changed (UI)

`src/features/theme/storefront.css`, `src/features/theme/render/chrome.tsx`, `src/features/theme/render/sections.tsx`,
`src/features/storefront/components/{icons,header-islands,islands,pdp}.tsx`, `src/features/cart/components/cart-drawer-content.tsx`,
`src/app/store/[host]/products/[slug]/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/layout.tsx`,
`src/app/dashboard/theme/page.tsx`, `src/features/theme/editor/theme-editor.tsx`, `src/features/analytics/components/revenue-chart.tsx`,
`src/app/dashboard/analytics/page.tsx`, `src/app/globals.css`, `src/app/admin/login/page.tsx`, `src/app/admin/(console)/{layout,tenants/page}.tsx`,
`src/app/(auth)/seller/*`, `src/features/auth/forms.tsx`, `src/features/customer-account/components/forms.tsx`.
