# Media Library Audit

## Before

Images were uploaded inside individual forms (product, category, collection, theme) through Server Actions, which are capped at
1 MB by default (normal phone photos failed). There was no library screen, and no way to reuse, search, re-describe or delete a file.
Theme image-upload errors were silently ignored. Replacing a category or collection image deleted the old file, which would break any
other place using it once files became shared.

## After

- **Dashboard → Media** (`/dashboard/media`): search (file name / alt text), folder and type filters, sort (newest, oldest, name,
  largest), load more, grid with "No alt text" flags, and a details dialog: large preview, size and dimensions, alt text, file name,
  folder, **copy URL**, **replace** (same address, with progress), **where it's used** (products, categories, collections, menus, pages,
  blog, brand, theme), and delete with a warning when the file is in use.
- **Upload**: large drag-and-drop zone (drag enter/leave/drop states; keyboard via the Browse button), up to 20 files, three in parallel,
  per-file progress, **cancel**, **retry**, dismiss, clear finished. Validation of type, extension-to-type match, size (10 MB), and
  dimensions (120–8000 px) happens instantly in the browser and again on the server.
- **Media picker** (`MediaPicker`): "Select from media library" with search, load more and in-place upload, single or multiple selection.
  Used by theme editor image fields, product images ("Add from media library"), category images and collection images.

## Architecture & security

1. The server chooses the path: `tenant/{tenantId}/media/{uuid}.{ext}` (tenant from the member's context, never from input).
2. The browser uploads straight to Supabase Storage with the member's own session (XHR for progress). Storage RLS requires the
   tenant prefix and `catalog.write`, `content.write` or `theme.edit`.
3. `registerMediaAction` downloads the stored object, **sniffs magic bytes** (SVG and anything unexpected rejected and deleted),
   and only then catalogues it in `media_assets` (RLS by tenant; DB check that the path prefix equals the tenant id).
4. Catalogue files are never auto-deleted. Replaced category/collection files are removed only when `media_usage()` finds no remaining
   reference.

Migration `20260926001300_media_library.sql`: `filename`, `folder`, `updated_at`; `theme.edit` may catalogue files;
`media_usage(tenant, path)` (staff of the tenant only; returns nothing for paths outside the tenant).

## Tests

- Unit: `tests/unit/media.test.ts` (type, extension, size, dimension rules; filename cleaning).
- DB: `tests/rls/media.test.ts`: tenant A can't read, update or delete tenant B's media; foreign-prefix paths are rejected by constraint;
  `media_usage` is tenant-scoped; theme-only roles can catalogue; shoppers can't.

## Remaining / limits

- Replace keeps the URL, so CDN and `next/image` caches may show the old image for up to an hour (uploads use `max-age=3600`).
- If a browser uploads but never registers (tab closed mid-upload), the orphan object stays in storage. A cleanup cron is recommended.
- Videos are not supported in the library yet (the bucket allows mp4; the UI and rules are image-only).
- Not visually checked against the cloud database yet: it needs `supabase/dev/apply-phase2.sql`.
