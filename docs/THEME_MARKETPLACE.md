# Theme marketplace

Route: **Dashboard → Theme marketplace** (`/dashboard/themes`, detail at `/dashboard/themes/{key}`).
Permission `theme.edit` to apply, `theme.publish` to publish. Feature flag `theme_marketplace`.

## Catalogue (multi-industry)

Themes are code presets grouped by **industry** (`src/features/stores/industries.ts`, 20 industries,
mirrored by the `store_categories` table from migration 1800) and **style** (minimal, modern,
luxury, editorial, bold, marketplace, premium, heritage, conversion). Registry:
`features/theme/marketplace/catalog.ts`, with one module per industry in `marketplace/themes/*.ts`.

| Industry | Themes | Demo (Live Preview) |
|---|---|---|
| Fashion | 12: 10 original ethnic presets (Heritage Kashmir, Jaipur Craft, Contemporary Ethnic, Color Pop, Contemporary Feminine, Occasion Luxury, Minimal D2C, Social Fashion, Luxury Indian, Jaipur Boutique) + Runway Editorial, Fashion Marketplace | each original on its own demo store; new ones on `kaya-studio` |
| Electronics | Premium Tech, Smart Living, Gadget Marketplace, Minimal Electronics, Tech Deals | `voltnest` |
| Beauty | Luxury Beauty, Clean Skincare, Modern Cosmetics, Organic Beauty, Editorial Beauty | `dewbloom` |
| Home & Furniture | Scandinavian Home, Luxury Interiors, Modern Living, Home Décor Market, Artisan Home | `kasa-living` |
| Grocery | Fresh Market, Organic Grocery, Supermarket, Gourmet Pantry, Daily Deals | `harvest-basket` |
| Handicrafts | Earth & Artisan | `mitti` |
| Jewellery | Gilded Luxe, Temple Heritage, Everyday Fine, Jewel Journal, Jewel Bazaar | `suvarna` |
| Footwear | Street Drop, Cobbler Atelier, Minimal Sole, Shoe Bazaar, Kolhapur Heritage | `kadam` |
| Health & Wellness | Ayurveda Heritage, Clinical Wellness, Studio Wellness, Spa Sanctuary, Wellness Deals | `aarogya` |
| Sports & Fitness | Arena Bold, Match Day Deals, Sports Megastore, Studio Fit, Pro Shop | `khel-studio` |
| Kids & Baby | Toybox Pop, Little Sprout, Playground Modern, Kids Bazaar, Tiny Deals | `nanhe` |

| Books & Stationery | Margin Notes, Blank Page, Old Library, Desk Studio, Stationery Bazaar | `pustak-ghar` |
| Pet Supplies | Wag Street, Velvet Paw, Clean Coat, Pet Superstore, Treat Drop | `pawdesh` |
| Automotive | Redline Garage, Spares Market, Pit Stop Deals, Grand Tourer, Clean Cabin | `gearbay` |
| Smart Home & Appliances | Modern Kitchen, Appliance Atelier, Appliance Bazaar, Calm Home, Appliance Deals | `griha-smart` |
| Bags & Travel | Trailhead, Saddle & Stitch, Carry Light, Luggage Bazaar, Travel Journal | `safarnama` |
| Watches & Accessories | Chrono Noir, Clean Dial, Wrist Journal, Time Bazaar, Tick-Tock Deals | `ghadi-co` |
| Organic & Natural | Mitti Roots, Field Almanac, Plastic Free, Sprout Pop, Mandi Co-op | `bhoomi-organics` |
| Bakery & Gourmet | Patisserie Noir, Hearth & Crust, Frosted Pop, Hamper Counter, Flour & White | `crumb-and-co` |
| General / Multi-category | Sabkuch Bazaar, Plain Shelf, Everyday Modern, Loud Aisle, Deal Dhamaka | `sabkuch` |

**103 themes in total, covering all 20 industries** (≥ 5 each; Handicrafts has 1). Themes in one
industry differ in structure, not only colour: header layout and menu style, hero size, section
order and composition, grid density, card style, typography and footer tone. A unit test enforces
that every industry except Handicrafts has ≥ 5 themes with distinct home compositions.

### Content slots

A home/collection/product item can name a **slot**: `["ProductGrid", { columns: 5 }, "deals"]`.
When the store's config has a section with id `slot-deals`, that section's content fills the item
(grids and carousels are interchangeable). Otherwise the item falls back to matching by section
type (the original behaviour, which is what real stores use). Unused `slot-*` sections are kept
**hidden** in the config, so switching themes again still finds them. A test enforces that a slot
name maps to one section family per industry.

## Live Preview

- `https://{demo-store}/?sf_theme={key}` renders that demo store with the theme applied **in
  memory** (`getStorefrontTheme`, from the published config and `applyThemePreset`). Nothing is
  written.
- The proxy forwards the key as an internal header (clients can't inject it) and remembers it in a
  cookie for in-store navigation. `?sf_theme=exit` clears it.
- It is honoured only for showcase tenants (`SHOWCASE_STORES` allow-list) and never for ids in
  `PROTECTED_TENANT_IDS` (The Paliya). Any other store ignores the parameter.
- While a preview is active the page is `noindex`, tracking tags are off, and a banner says
  "Live preview … Nothing is saved".
- In the dashboard, **Live preview** opens a dialog with Desktop (1280 px, scaled) and Mobile
  (390 px) frames. It is shown only when the demo store exists and is open.

## Marketplace UI

Industry chips with counts, style filter, search (name, tagline, style, best-for) and sort
(featured, with the seller's own industry first; newest; name). Cards load a lazy, scaled iframe
of the actual showcase store with that theme applied in memory—not a synthetic mockup—plus
industry and style badges, and a "Current theme" / "In draft" badge. A token-driven mockup is
used only when that theme's showcase demo has not been seeded yet.

## Showcase demo stores (`scripts/dev/showcase`)

One store per industry (19 new + the original fashion demos), built by `run.mts <slug …>`. Each has about 20 products with INR
prices, MRP, variants and category **specifications** (`attributes.specs`), categories,
collections, menus, policies, FAQs and an "Image credits" page. No reviews are seeded.

- **Photography:** real photographs found through Openverse. StockSnap CC0 comes first, then CC0,
  PDM or CC BY from rawpixel, Wikimedia or Flickr. Every pick is vetted by eye on contact sheets
  (`images.mts --sheet` / `--picks`): no brand logos, no retailer catalogues. Products are
  adapted to what real photos show. Credits are listed on each store's `/pages/image-credits`.
- **Safety:** only allow-listed slugs are accepted. An existing tenant is touched only if it is
  owned by `owner@<slug>.test` and isn't protected. Writes are scoped to that tenant, and runs are
  idempotent. `--retheme` and `--refresh-images` replace only that demo tenant's theme versions
  and media rows. Owner accounts get a random, unrecorded password; sign in by magic link.
- `shots.mts <slug> <dir>` screenshots every theme of the store (desktop and mobile) via Live
  Preview and flags horizontal overflow.

## Apply to store or save a draft → customise → publish → rollback

1. **Apply to draft** (`applyMarketplaceThemeAction`) runs `applyThemePreset(current, preset)`:
   - style (enum, number and boolean settings) comes from the preset;
   - content (text, images, links, menus, product/collection picks) is kept from the store's current draft, or the published theme if there's no draft, matched by section type;
   - new sections start from the section defaults;
   - the result is strictly validated and every asset path is checked to belong to the store.
   It is written as the store's **draft** (`theme_key` = the theme). The live store does not change.
2. Customise in the theme editor (live preview iframe).
3. Publish (`publish_theme` RPC). The previous version goes to history.
4. Roll back to any earlier version from the editor history.

Sellers with `theme.publish` can also choose **Apply to store**. It builds the same safe draft
and immediately publishes it, so the storefront changes without a separate editor step. The
previous live version remains available for rollback. **Save as draft** keeps the review-first
workflow available to every seller with `theme.edit`.

No store data (products, pages, menus, images) is modified or deleted by applying a theme.
Tests: `tests/unit/theme-marketplace.test.ts` applies every theme to a store config and checks
the config validates, the brand tokens switch, hero and announcement content survive, and no
foreign asset paths appear.

The `themes` table (migration 1500) is reserved for platform-published themes beyond the built-in
catalogue (RLS: readable when active; writes need `platform.settings.manage`).

## Sections and options added with Jaipur Boutique (available to every theme)

| Addition | Where | What the seller manages in the theme editor |
|---|---|---|
| **Scrolling text** (`Marquee`) | header, home, collection, product, footer | Up to 8 phrases, link, size, speed, separator, colour. Pauses on hover; static for reduced-motion users |
| **Shoppable videos** (`VideoShop`) | home, collection, product | Up to 12 videos (upload MP4 ≤ 10 MB with the new **Upload MP4** button, or a YouTube/Vimeo link), cover image, title, product to shop. Round stories or 9:16 cards; tap opens a player with the product and "Shop now" |
| **Page content** (`PageContent`) | collection, product templates | Marker: sections above it render before the product grid/details, sections below after it. Without it, pages behave as before |
| Trust strip layout | TrustBadges | Grid or **scrolling strip** |
| Announcement display | AnnouncementBar | All in a row, or **one at a time with arrows** (auto-advances, pauses on hover); up to 5 messages |
| Desktop menu | Header | Menu bar/mega menu, or **drawer on every screen** (hides the Mega menu section) |
| Section titles | Style → Section titles | Left or **centred** |
| Product cards | Style → Product cards | **Pill** badge style (green "% off" under the price), **offer badge** text on every card (e.g. "Buy 2 Get 1"), **size chips** (sold-out sizes struck through) |

Category tiles in portrait/square shape now fill the row (one column per tile, up to 6).

The Jaipur Boutique layout takes its structure from a common Dawn-based storefront pattern. No third-party code, images, logos or copy were used. Applying it keeps the store's own banners, products and text.
`scripts/dev/import-thepaliya/theme-boutique.mts` applies it to the-paliya and fills every section with that store's content.
