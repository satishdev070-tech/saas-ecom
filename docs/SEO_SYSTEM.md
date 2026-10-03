# SEO system

| Layer | Where | What |
|---|---|---|
| Store | **Settings → SEO** | Home title (70) + description (160) with a live search preview, default social image (1200×630), Google Search Console + Bing verification (paste the tag or token), store-wide noindex |
| Product | Product editor → Search engine listing | Title, meta description, **canonical URL override**, **noindex** |
| Collection / category / page / blog | Their editors | Title, meta description |
| Redirects | Content → Redirects | 301/302 from old paths; used before 404 |

Generated automatically:

- Canonical URLs on the primary domain; non-primary hosts disallow crawling in robots.txt.
- `robots.txt` (blocks cart, checkout, account, orders, search, sort params) and `sitemap.xml`.
- Open Graph and Twitter cards on every page, falling back to the store's default social image.
- JSON-LD: Organization + WebSite with SearchAction (home), BreadcrumbList, Product with Offer or AggregateOffer and AggregateRating (only when there are reviews), BlogPosting.
- `<meta name="google-site-verification">` and `msvalidate.01` from the SEO settings.

Validation: verification tokens are restricted to safe character sets; canonical overrides must be
a path or an absolute `https://` URL; JSON-LD is serialised with `<`, `>` and `&` escaped.
