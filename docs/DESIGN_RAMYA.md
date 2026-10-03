# Design pass: opt-in theme features (Ramya, 2026-10)

All of these are **opt-in**. Every new setting defaults to the previous behaviour, so existing stores (including The Paliya) render pixel-identically. Ramya turns them on in `scripts/dev/ramya/apply-theme.mts`.

| Setting | Where | Default | What it does |
|---|---|---|---|
| `Header.layout: "logo-left-nav-center"` | section `Header` | `logo-center` | Large logo (or text wordmark) with a tagline on the left, centred inline menu, search and bag with an inline count on the right. Menu items with children open a full-width mega panel on hover or keyboard focus (`:focus-within`), with columns, grandchildren and optional item images. Below 64rem it uses the hamburger drawer. |
| `header.wordmark` | global header settings | `""` | Text wordmark used instead of the logo image (large-logo layout only). |
| `header.logoTagline` | global header settings | `""` | Small, spaced, uppercase line under the logo (large-logo layout only). |
| `header.bottomNav` | global header settings | `false` | Fixed bottom navigation on phones: Home, Search, Wishlist, Bag (count badge), Account and Orders. Safe-area aware, 60px tall, labelled icons, active state with `aria-current`, hidden at 768px and up. The page gets matching bottom padding. |
| `ProductCarousel.autoScroll` | tilt variant only | `false` | Continuous marquee (`AutoScrollRow`): the track is duplicated, and a rAF loop advances native `scrollLeft`. Pauses on hover, focus, touch and drag. Drag and arrows still work. No motion with `prefers-reduced-motion`. |
| `DecorDivider` section | home, collection, product | — | Line ornament between sections: `motif` (krishna / bansuri / peacock / lotus / kadamba), `layout` (divider / margins), optional public-domain painting (`artwork`), with a heading and text. |
| `Footer.decor: "krishna"` | section `Footer` | `none` | A kadamba vine and faint peacock feathers in the footer. |
| `tokens.finish: "refined"` | tokens | `standard` | Polish for the editorial sections: heading scale, gold eyebrows, button hover in the secondary colour, card, arch and tile hover states. Scoped by a marker element after the tokens `<style>` (`[data-sf-finish="refined"] ~ *`). |

## Illustrations

- `public/illustrations/*.svg`: original line motifs drawn in code (`scripts/dev/ramya/illustrations.py`). They are used as CSS masks, so they take the theme colour (`.sf-motif-*`).
- `public/illustrations/art/`: public-domain paintings from The Metropolitan Museum of Art Open Access (CC0). They are listed in `DECOR_ARTWORKS` (definitions.ts), and the credit is rendered in the figcaption.
  - *Krishna and Radha in a Bower*: page from a dispersed Gita Govinda, Mewar, ca. 1665. Met object 38027.
  - *Radha and Krishna Walk in a Flowering Grove*: Kota, ca. 1720. Met object 65594.
