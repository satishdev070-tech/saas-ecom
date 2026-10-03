# Creative studio

Route: **Marketing → Creative studio** (`/dashboard/marketing/creative`). Preview for
`marketing.read`; saving needs `marketing.write` and feature flag `creative_studio`.

## Engine (`features/creative/engine.ts`)

One pure renderer (`renderCreativeSvg`) runs in the browser for live preview and on the server for
the final PNG, so preview and output match.

- **Template** = key + version + name + category + canvas size + `spec { fields, layers }`, stored in `creative_templates` (unique `key, version`; readable by signed-in users; writes need `platform.settings.manage`). The UI uses the latest active version of each key.
- **Layers:** `rect`, `image` (the chosen product image, cover-cropped with optional rounded or oval clip), `text` (static or field-bound; heading/body font; wrap + ellipsis; alignment; tracking; strike-through), `badge`, `logo` (store logo, else store name).
- **Brand kit:** colours from the published theme (primary, secondary, accent, background, text, sale), serif or sans from the theme fonts, and the store logo.
- **Fields:** headline, supporting line, price, original price, offer, button text, date, image, each with a max length and placeholder.

## Built-in templates (v1, migration 1600)

New arrival (split) · Sale (bold) · Festival (framed, 4:5) · Product highlight · Collection launch
(4:5) · Bestseller · Limited edition (4:5) · Discount code · Announcement. All nine required
categories are covered; the layouts are original.

## Saving

`saveCreativeAction` validates fields against the template, checks the image belongs to the store,
embeds images as PNG data URIs (normalised with sharp), rasterises with sharp, uploads to
`tenant/{id}/creative/{uuid}.png`, adds it to the media library (folder "creative", so it can be
used in social posts, the theme or products) and records a `creatives` row with the template
version and values. Rate-limited (60/hour/store) and audited.

Security: all text is XML-escaped, colours must be 6-digit hex, and image hrefs are only store
assets or data URIs. Tests (`tests/unit/creative.test.ts`) cover escaping, wrapping, validation
and rendering every template to a PNG of the right size.

Limitation: the server renders with standard serif and sans system fonts, not the theme's web
fonts. The preview uses the same fonts so it matches the saved image.
