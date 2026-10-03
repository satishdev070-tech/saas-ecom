# Design System

_Platform UI (seller dashboard, platform console, auth, marketing). Storefronts use tenant theme tokens (`--sf-*`)._

## Appearance

- **Light is the default.** Light / Dark / System via `AppearanceToggle` (`components/ui/appearance-toggle.tsx`), saved in
  `localStorage["paliya-appearance"]` per origin. An inline boot script (`lib/appearance`) applies dark before first paint (no flash).
- Tokens live on `:root, [data-theme="light"]` and `[data-theme="dark"]` in `app/globals.css`. Any subtree can pin a theme with
  `data-theme` (the auth side panels pin dark).
- Dark is a separate palette (charcoal surfaces, softened text, brighter accent), not an inversion.
- `.theme-console` re-tones the same tokens for the platform console (cool slate + blue accent) in both modes.
- Storefronts are never switched: store origins have their own storage and use `--sf-*` tokens from the tenant theme.

## Semantic tokens (Tailwind colour names)

| Token | Use |
|---|---|
| `background` | App canvas |
| `surface` / `surface-secondary` / `surface-elevated` | Cards and panels / subtle fills, table headers / popovers |
| `foreground` / `muted` / `subtle` | Primary text / secondary text / tertiary text and icons |
| `border` / `border-strong` | Hairlines / hover and input emphasis |
| `primary` / `primary-foreground` | Main actions |
| `accent` / `accent-foreground` / `accent-soft` | Brand highlight, active nav icon, badges |
| `success` `warning` `error` (`danger`) `info` | Status |

## Typography

Inter (UI) and Fraunces (brand/marketing display), self-hosted from `@fontsource` via `next/font/local` (`app/fonts.ts`).

| Utility | Size / line | Weight |
|---|---|---|
| `text-display` | 32 / 38 | 600, −0.025em |
| `text-h1` | 24 / 32 | 600, −0.02em |
| `text-h2` | 18 / 26 | 600 |
| `text-h3` | 15 / 22 | 600 |
| `text-h4` | 13 / 20 | 600 |
| `text-body` | 14 / 22 | 400 |
| `text-small` | 13 / 20 | 400 |
| `text-caption` | 12 / 16 | 400 |
| `text-label` | 13 / 18 | 500 |
| `text-overline` | 11 / 16 | 600, 0.08em, uppercase |

## Spacing, radius, elevation

- Spacing: Tailwind's 4px scale only (page padding `px-4 sm:px-6 lg:px-8`, card padding `p-4 sm:p-5`, stacks `space-y-6`).
- Radius: `sm` 4 · `md` 6 (inputs, buttons) · `lg` 10 (cards) · `xl` 14 (dialogs) · `2xl` 20. Pills only for avatars and counters.
- Shadows: `shadow-xs` (cards, inputs), `shadow-sm`, `shadow-md` (tooltips), `shadow-lg` (dialogs, popovers). No glows, no gradients on components.

## Components (`components/ui`, `components/app-shell`, `components/auth`)

| Component | Notes |
|---|---|
| `Button` / `buttonClass()` | `primary` `accent` `secondary` `outline` `ghost` `danger`; `sm` 32px, `md` 36px, `lg` 40px; `pending` shows a spinner and disables |
| `TextField` `TextAreaField` `SelectField` `CheckboxField` | Label, hint, error (`role="alert"`), `aria-invalid` + `aria-describedby` |
| `PasswordField` | Adds a show/hide toggle (`aria-pressed`) |
| `Card` `PageHeader` `StatCard` `Badge` `Table` (`th`/`td`) | Badges are soft fills with an inset ring; tables scroll horizontally on small screens |
| `EmptyState` `ErrorState` `Skeleton` | Empty states take an optional icon and action |
| `AppShell` | Collapsible sidebar (saved), tooltips when collapsed, mobile drawer (native `<dialog>`), breadcrumbs, ⌘K quick jump |
| `Popover` / `PopoverItem` | Topbar menus; Esc and outside click close them and focus returns to the trigger |
| `AuthSplit` / `AuthHeading` | 60/40 auth layout, `merchant` and `console` variants |
| `ColumnChart` / `BarList` / `RevenueChart` | Server-rendered charts with screen-reader values |

## Icons

One library: **lucide-react**, stroke 1.75, 16px in navigation (`components/app-shell/icons.ts`). Navigation configs reference icons
by name so they serialise from server to client. No emoji in the product UI (the Gen-Z demo store's announcement copy is tenant content).

## Motion

Drawers 200–260 ms, popovers 140 ms, hover colour transitions 150 ms. Everything is disabled by the global `prefers-reduced-motion` rule.

## Accessibility checklist

Visible `:focus-visible` ring on every control · labelled inputs · dialogs via native `<dialog>` (focus trap, Esc) · icon-only buttons
have `aria-label` · `aria-current` on active nav · charts expose values to screen readers · colour is never the only signal (badges have text).
