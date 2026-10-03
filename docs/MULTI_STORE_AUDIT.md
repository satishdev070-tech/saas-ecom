# Multi-Store Audit

## Theme system capability (what makes stores differ)

Per store: colours (7 tokens), heading and body fonts (now **real self-hosted fonts**: Cormorant Garamond, Fraunces, Bodoni Moda,
Playfair Display, Marcellus, Inter, Jost, Manrope, Space Grotesk, DM Sans), heading case, button shape and style, card radius, container
width, spacing scale, header layout (logo left or centred, inline menu or mega menu), sticky header, product-card ratio / alignment /
badges / rating / quick add / hover image, and the **composition** of 23 section types on the home, collection and product templates.

Before this phase, every font key pointed at fonts that were never loaded, so all stores fell back to system fonts.

## The 10 demo stores (`scripts/dev/demo-stores`)

| Store | Slug | Direction | Type | Layout | Signature sections |
|---|---|---|---|---|---|
| Chinar & Loom | `chinar` | Kashmir heritage | Cormorant + Manrope | centred logo, mega menu, tall cards | full-bleed hero, artisan story with stats, 3-col heirloom grid, editorial, patron letters |
| Gulaab Rang | `gulaabrang` | colourful Jaipur block print | Playfair + DM Sans, pill buttons | centred, filled badges, quick add | circle category tiles, promo pair, sale band with code, #GulaabRangGirls social |
| Pinkcity Threads | `pinkcity` | contemporary commercial | DM Sans, rounded | logo left + mega menu | trust bar, category-led grids, collection edits, FAQ |
| Mitti & Maati | `mitti` | earthy minimal handloom | Fraunces + Manrope, outline buttons | logo left inline, non-sticky | materials editorial, row lookbook, slow-craft story |
| Rangeela Jaipur | `rangeela` | high-conversion D2C | Jost uppercase, full width | inline menu, dense | sale band, sale carousel, 3 promo tiles, dark trust bar |
| Noor Ethnica | `noor` | contemporary feminine | Playfair + DM Sans | centred, rating on cards | occasion collection grid, embroidery editorial, testimonials + reviews |
| Vivaah Couture | `vivaah` | wedding and occasion | Marcellus uppercase | centred, tall cards, dark product art | full-screen hero, masonry lookbook, dark atelier editorial, bridal FAQ |
| Studio Neel | `studioneel` | monochrome minimal | Inter only, black/white | logo left inline, no badges | 4-col essentials grid, fabric note |
| Desi Drip | `desidrip` | Gen-Z drops | Space Grotesk uppercase, pills, large radius | inline, square cards | drop announcement, new-drops carousel, social wall, promo tiles |
| Maison Anaya | `anaya` | understated luxury | Bodoni Moda + Jost, outline buttons | centred, non-sticky, no badges | 2-col collections, Maison story, Kadhwa editorial |

Each store has: owner account (`owner@<slug>.test`), store profile (tagline, contact, address, GSTIN, legal name, social, SEO),
favicon, 4–6 categories, 2–4 collections (manual and rule-based), 6–10 products with size (and some colour) variants, prices/MRP,
stock (including low-stock and sold-out sizes), 3 generated images each, size chart, main menu with mega-menu children,
shop and help footer menus, About/Shipping/Returns/Contact/Privacy pages, FAQs, approved reviews, testimonials,
and a published theme (built through the app's own theme validator).

All imagery is **original, procedurally drawn artwork** (`scripts/dev/demo-media/art.mjs`): garment silhouettes with textile patterns
(dabu, sanganeri, bagru, ajrakh, leheriya, kalamkari, paisley, bandhani, ikat, zari, chevron, stripes, checks, polka, bold floral,
solids) on per-store backdrops. Nothing is taken from the reference sites; names, copy and art are original.

## Status

- ✅ Store definitions, generator and art written; generator typechecks and reuses the real `save_product` RPC.
- ⏳ **Not yet generated in your Supabase project**: the generator writes the new media columns and theme data, so it needs
  `supabase/dev/apply-phase2.sql` first. Then run:
  `pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/demo-stores/run.mts`
- ⏳ Visual QA of the 10 stores happens after that run.

## Tenant isolation

Unchanged model (verified host → tenant; RLS per tenant). New isolation tests cover custom roles and media.
