# thepaliya.com → the-paliya store import

_2026-09-26._ Source: https://thepaliya.com, a custom Laravel "Shop Saas" site. Target: tenant
`the-paliya` (http://the-paliya.localhost:3000).

## How it works

- `scripts/dev/import-thepaliya/crawl.py`, `scrape_products.py`: crawl every listing page, product page and the site's own per-size price/stock endpoint (`get-products-variant-quantity`). The catalogue was confirmed complete by probing product IDs 1–40: exactly 10 products (IDs 3–12).
- `scripts/dev/import-thepaliya/data/*.json`: the frozen snapshot (products, store, categories, pages, FAQs, home layout).
- `scripts/dev/import-thepaliya/run.mts`: the importer. It is idempotent: it matches by slug and path, keeps existing products and their live stock on re-run, and refreshes media, menus, FAQs and theme. Products go through `save_product` as the store owner, so they get dashboard validation.

```bash
MEDIA_DIR=/path/to/media pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/import-thepaliya/run.mts
```

## What was imported (verified against the snapshot: 0 differences)

| Item | Result |
|---|---|
| Store | Name **Ramya Glamorous**, About text as description, email, phone 9001259163, WhatsApp 7340378934 (from the old chat widget), Jaipur address, Instagram @rbypaliya, Facebook rbyAyushi, old logo, favicon and share image, SEO title |
| Categories | Glam Baby, Glam Girl (› nanhi-pari), Glam Boy, Collections (› Summeride, Nayā Paramparā, Samkaleen Sanskruti, Sahaj Shringaar, Aaram Se Anokha, Behtarī Sahaj, Women Co-ord Set, Women Top, Women Ethnic Top, Women Tunic Top), with old slugs, order and images |
| Products | 10, with exact titles, old URL slugs, descriptions + "Additional Information" verbatim, and categories from the old breadcrumbs |
| Prices & stock | 5 sized dresses: S/M/L/XL with the old per-size price and stock. 5 floral items: single variant, price as on the old site, stock not tracked (the old site didn't track it) |
| Images | 62 product images (original files, old gallery order), 7 banners, 4 category images, logo, favicon, share image: all in the media library |
| Size chart | "Body Measurements" (XS–7XL, chest/waist) on Blue & Green Bow Dress, the only product that had one |
| Home page | 3 hero banners (2:1, uncropped), category tiles, 3 offer banners, Best Selling Products and New Arrival Products in the old order, Instagram banner → @rbypaliya. Published. |
| Pages | About Us, Contact Us (verbatim) and the 7 FAQs (verbatim) |
| Menus | Main (Home, Our Story, the 4 categories with sub-categories), footer "Information" and "Get Help" |

SKUs: the old site's SKU field repeated values across products (4, 8, 7), so new SKUs are
`RG-<old id>-<size>` (e.g. `RG-3-M`). The importer prints the full mapping.

## Old-site data quirks, handled

- On 5 sized dresses the old "original price" is *lower* than the selling price, so it isn't a real discount. It was dropped; the old site didn't show a strike-through either. Real MRPs (higher than price) were kept.
- "BLUE AND GREEN STRAIGHT PATTERN DRESS" had a junk "Color" option (₹0, stock 0); it was dropped.
- Two old slugs don't match their titles (`blue-printed-pocket-dress` is the "Blue and Green Straight Pattern Dress"; `straight-cut-v-neck-kaftan-dress` is the "Blue Printed Pocket Dress"). The slugs were kept so old links still work.
- One duplicate image (byte-identical) in the Pocket Dress gallery was skipped.
- Text kept verbatim, including the old spellings "Rajsthan", "Ramya Fashion" (FAQ) and the placeholder "[Size Guide] (link)" in FAQ 3. Edit them in the dashboard if you want them fixed.

## Not migrated (nothing usable on the old site, or blocked)

| Item | Why |
|---|---|
| Blog | The old `/blogs` page throws a server error; no posts are reachable |
| Gallery | Old gallery page is empty |
| Privacy, Refund, Terms | The old pages exist but have no content. **Write these before launch** (required for payment gateways) |
| 6 product videos | QuickTime `.mov`, 4 of them over 10 MB. The storage bucket accepts MP4 ≤ 10 MB. Convert with ffmpeg (`ffmpeg -i in.mov -vf scale=-2:1280 -c:v libx264 -crf 26 -an out.mp4`) and upload; originals are in the local media snapshot |
| Customers, orders, reviews | Not public on the old site (need an export from its admin) |

## Also changed in the product

- Hero and Promo banner sections gained a **Banner (2:1, never cropped)** shape; image-only slides and tiles render as plain clickable images without dark overlays. This is for banners with the text designed into the image.
- Store home page title no longer gets the platform suffix ("… · The Paliya").

## Security note about the old site

thepaliya.com runs Laravel with debug mode on: error pages publicly show full stack traces and
server paths (e.g. `/home/u483410752/domains/thepaliya.com/...`). Set `APP_DEBUG=false` there,
or take it down after the switch.
