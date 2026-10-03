# Analytics & tracking

Stores add their own IDs at **Settings → Analytics & tracking**: GA4 measurement ID, Google Ads tag
ID + purchase conversion label, Meta Pixel ID. Tags load only when saved **and** enabled, never in
theme preview, and not at all when the browser sends Global Privacy Control or Do Not Track.

## Events (`features/tracking`)

| Event | Fired from | Meta event |
|---|---|---|
| page_view | gtag config / Pixel base code (+ PageView on client navigation) | PageView |
| view_item | Product page | ViewContent |
| view_item_list | Collection, category and search listings (first 20 items) | — |
| search | Search page | Search |
| select_item | Any product card click (delegated `data-track-item`) | — |
| add_to_wishlist | Wishlist button | AddToWishlist |
| add_to_cart / remove_from_cart | Add to bag, quick add, cart quantity and remove | AddToCart / — |
| view_cart | Cart page | — |
| begin_checkout | Checkout page | InitiateCheckout |
| add_shipping_info / add_payment_info | Checkout submit | — / AddPaymentInfo |
| purchase | Order confirmation, once per order per session (`transaction_id` = order number); also a Google Ads `conversion` | Purchase (`eventID` for dedupe) |
| login / sign_up | Store sign-in (password, OTP) and sign-up, via a 60-second flag cookie set before the redirect | — / CompleteRegistration |

Items carry public catalogue data only (SKU or ID, name, variant, category, price in rupees, quantity).

**Refund** events are not sent: GA4 needs the Measurement Protocol with an API secret, which is out of scope.

## Attribution

On first landing with `utm_source|medium|campaign|term|content`, `gclid` or `fbclid`, a first-party
cookie `pl_attr` (30 days, first touch, campaign params + landing path + time, no personal data)
is set. At order placement the server re-validates it (`parseAttribution`) and stores it on
`orders.attribution`, and on `customers.attribution` if the customer has none yet. Sellers see it
on the order page ("Marketing source").

## Security

IDs are regex-validated on save and again before being written into inline scripts. Tag config
reaches the page only as `window.__pl` with validated values. Tracking IDs are not secrets.
