# Build Brighten brand system

Applies to the public marketing site (`src/app/(marketing)`), seller sign-in / sign-up
(`AuthSplit variant="merchant"`) and onboarding (`src/app/onboarding`). The seller dashboard,
platform console and storefronts keep their own design systems.

## Logo

The official logo file was **not available** when this system was built: it is not in the
repository, and the live site and design reference were unreachable from the build environment.
Until it is added, `BrandLogo` (`src/features/marketing-site/components/brand-logo.tsx`) renders
the name "Build Brighten" as a plain text wordmark. This stands in for the logo; it is not a redesign of it.

To use the real logo:

1. Add the file, e.g. `public/brand/build-brighten-logo.svg`.
2. Set `PLATFORM_LOGO` in `src/config/platform.ts` to `{ src, width, height }`.
3. Sample the logo's colours and replace the `--brand-*` values in `src/app/globals.css`
   (`.theme-brand`), then re-check the contrast pairs below.

## Colour tokens (provisional)

Defined once in `src/app/globals.css` under `.theme-brand`, exposed to Tailwind as `brand-*`.
These values were **not** taken from the logo (see above). They are a placeholder palette, so
the site is consistent now and can be re-themed later by changing only these lines.

| Token | Value | Use |
|---|---|---|
| `--brand-primary` | `#4338ca` | Primary buttons, links, active states, icons |
| `--brand-primary-hover` | `#3730a3` | Primary hover |
| `--brand-primary-soft` | `#eef0ff` | Tinted backgrounds, chips, hero wash |
| `--brand-ink` | `#0b1b3f` | Headings, footer, dark CTA band |
| `--brand-accent` | `#f5a524` | Highlights (always with dark text) |
| `--brand-accent-soft` | `#fff5db` | Notes, demo-data badges |
| `--brand-mint` | `#e7f7ef` | Success / included ticks |
| `--brand-canvas` | `#f7f8fc` | Alternate section background |

Inside `.theme-brand`, the shared platform tokens (`--primary`, `--accent`, `--muted`, `--border`, ...) map to these, so existing form
components (`Button`, `TextField`) follow the brand automatically.

Measured contrast: white on primary 7.9:1, ink on accent 8.3:1, muted (#4b5568) on white 7.5:1,
subtle (#5f6a7d) on white 5.5:1, primary on primary-soft 7.0:1, green on mint 4.5:1.

## Type, radius, shadow

- Display: Manrope (`font-brand`), already self-hosted for storefront themes. Body: Inter.
- Radius: `rounded-brand-sm` 8px, `-md` 12px, `-lg` 18px, `-xl` 28px. Buttons are pills.
- Shadows: `shadow-brand-card` (cards), `shadow-brand-float` (product visuals).
- Motion: colour/shadow transitions only; `prefers-reduced-motion` is honoured globally.

## Content rules

- No testimonials, customer logos, merchant counts or revenue claims.
- Product visuals that show sample values carry a "Demo data" badge.
- Capabilities are only described where the code supports them (see the header of
  `src/features/marketing-site/content.ts` for the source of each claim).
