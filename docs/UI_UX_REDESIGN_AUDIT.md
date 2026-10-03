# UI / UX Redesign Audit (phase 2)

## Found

| Area | Issue |
|---|---|
| Tokens | Dark mode followed the OS automatically (light was not the default); no secondary/subtle/elevated tokens; ad-hoc `text-sm`/`text-xs` everywhere; no type scale |
| Icons | None in navigation; storefront used text glyphs |
| Shell | Text-only sidebar, no collapse, `<details>` mobile menu, no breadcrumbs, search, notifications or account menu |
| Auth | Seller, staff and shopper logins shared one small centred card; no password visibility; seller sign-up didn't ask for a store |
| Admin home | 4 stats and one weekly chart; no users, storage, GMV trend, plan mix or activity |
| Seller home | (Fixed in phase 1) |
| Team | 4 fixed roles, no status/last-active, no resend/deactivate |
| Media | No library (see MEDIA_LIBRARY_AUDIT.md) |
| Storefront fonts | Theme font keys pointed at fonts that were never loaded |
| Customer account | Opened on the profile form; no overview |

## Changed

- **Design system** (docs/DESIGN_SYSTEM.md): semantic tokens, light default, designed dark palette, console palette, type scale utilities,
  radius and shadow scales, Inter + Fraunces self-hosted, refreshed Button (6 variants), fields, PasswordField, Card, Badge, Table, states.
- **App shell** for both consoles: lucide icons for every module, grouped nav (Overview · Commerce · Marketing · Store · Analytics · Settings),
  collapsible sidebar with tooltips, mobile drawer, breadcrumbs, ⌘K quick jump, notifications from real counts, account menu with store
  switcher and appearance toggle.
- **Auth**: 60/40 split layouts. Merchant screens use a warm block-print panel with value points; staff sign-in uses a dark security
  panel with only true statements and no live metrics before login. Password toggles, "Forgot?" beside the password label,
  success states, terms/privacy. Seller sign-up asks for a store name and creates the store immediately when possible.
- **Customer auth**: sign-in, register and forgot-password inside the store's own chrome and fonts, with the store's hero art at 60%
  and benefits on registration.
- **Customer account**: overview with latest order status and order/address/wishlist counts.
- **Super admin dashboard**: 8 KPIs (stores, active, trial, GMV month, orders, 6-month GMV, users split, storage), GMV trend,
  plan distribution, weekly new stores, status mix, top stores, recent activity. All from the database (`platform_dashboard` RPC).
- **Team & roles** screens (docs/RBAC_AUDIT.md). **Media library** (docs/MEDIA_LIBRARY_AUDIT.md).

## Screens checked visually (Playwright screenshots, 1440 and 390 px)

Staff sign-in (light), seller sign-in (light, dark, mobile), seller registration, customer registration (desktop, mobile), customer account.

## Not yet checked visually (need `supabase/dev/apply-phase2.sql` on the cloud DB)

Seller dashboard shell and home, team, roles, media library and picker, super-admin dashboard, the 10 storefronts, and the
full 320–1920 px sweep. The code for these compiles, lints and passes unit and database tests.

## Remaining ideas (not started)

- Convert the widest dashboard tables to card lists below 640 px.
- Drag-and-drop ordering in the theme editor.
- Customer account light/dark: account pages live inside the storefront and follow the store theme (the brief's own rule 45
  says not to force platform dark mode onto storefronts), so they have no separate dark mode.
