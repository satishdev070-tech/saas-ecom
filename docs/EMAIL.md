# Email (Resend)

Every email the app sends goes through `src/lib/email/send.ts` → Resend REST API
(`POST https://api.resend.com/emails`, `Authorization: Bearer RESEND_API_KEY`, `Idempotency-Key` header).
Supabase Auth emails (sign-in link, OTP, password reset, signup confirmation) are sent by Supabase itself, so
route them through Resend SMTP (see below).

## Env vars

| Var | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | prod | `re_…`. Without it, emails are **not sent**: metadata is logged and `email_log.status = 'logged'`. |
| `EMAIL_FROM` | prod | e.g. `The Paliya <orders@mail.yourdomain.in>`. The address must be on a domain verified in Resend. Stores only change the display name (`"Ramya By Ayushi" <orders@mail.yourdomain.in>`). Reply-To is set to the store's email. |
| `NEXT_PUBLIC_APP_URL` / root domain | existing | Used for dashboard links in owner alerts and invites. |

## Architecture

- `src/features/notifications/events.ts`: the shared dispatcher. Call `emit(event)` after a state change. It runs every registered channel (email, WhatsApp) after the response via `after()`. Events carry ids only.
- `src/features/notifications/email/channel.ts`: the email channel. It loads the order, store branding (name, logo, theme primary colour) and toggles with the secret-key client (background job, ADR-006), always filtered by the event's server-resolved tenant.
- `src/features/notifications/email/templates.ts` + `layout.ts` hold pure HTML and text templates. Every value is escaped, links must be https, and money is formatted with `formatMoney`.
- `src/lib/email/send.ts` does the following:
  1. Validates the recipient.
  2. Skips the send if `email_log` already has a `sent` row for the idempotency key.
  3. Sends the email.
  4. Records the result in `email_log`, with the recipient hashed and masked and no body.
- `email_preferences` (migration 22) holds per-store toggles, edited in Settings → Notifications (`EmailPreferencesForm`). If a seller turns a template off (`notification_templates.active = false`), that email is skipped too.

| Email | Trigger (hook) |
| --- | --- |
| Order confirmation (+ COD amount due) and new-order alert to the store email | `order.placed` in `afterOrderConfirmed` (`checkout/post-order.ts`) |
| Payment failed (retry link, once per order) | `order.status_changed/payment_failed` in the Razorpay, Cashfree and PayU webhooks |
| Shipped / delivered | `shipment.updated` in `orders-admin/actions.ts` `updateFulfillmentAction` |
| Out for delivery | `shipment.updated/out_for_delivery`. Template and channel are ready, but no code polls courier status yet. |
| Cancelled | `order.status_changed/cancelled` (admin cancel, customer cancel) |
| Refund processed | `order.status_changed/refunded` in `payments/refunds.ts` |
| Return updates | `return.updated` (customer request, admin status change) |
| Abandoned cart (opt-in, default off) | `emitAbandonedCarts()` from `/api/cron/notifications`. Only signed-in carts qualify, because guest carts have no email. |
| Team invite | `team/actions.ts` → `sendTeamInviteEmail` |
| Contact-form forward | `submitContactFormAction`. Ready, but the storefront contact page has no form yet. |
| Manual re-send | Dashboard order page. Sends the customer email inline and reports whether it actually went out. |

## Setup steps

1. Create a Resend account and go to **Domains → Add domain**. Use a sending subdomain, e.g. `mail.yourdomain.in`.
2. Add the DNS records Resend shows **exactly as listed in the Resend dashboard**:
   - an SPF `TXT` (and an `MX` on the `send` subdomain) for the bounce/return path
   - a DKIM `TXT` (`resend._domainkey`)
   - optionally a DMARC `TXT` (`_dmarc`, e.g. `v=DMARC1; p=none;`)
   Wait until the domain shows **Verified**.
3. Create an API key with **Sending access**, then set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (Production + Preview) and redeploy.
4. Route Supabase Auth email through Resend. In Supabase Dashboard → Authentication → Emails → **SMTP Settings**, enable custom SMTP and enter:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password = a Resend API key
   - Sender email on the verified domain (e.g. `no-reply@mail.yourdomain.in`) and a sender name
   Then raise the Auth email rate limit (Authentication → Rate Limits) to suit your traffic.
5. Apply migration `20261003002200_email_log.sql` (or `supabase/dev/apply-2200.sql` in the SQL editor).
6. Place a test COD order on a store with a store email set. Check Resend → Emails, and `email_log` should show `sent`.

## Not yet covered

- No storefront contact form exists. `submitContactFormAction` is ready for the storefront owner to wire up.
- Nothing produces out-for-delivery events, because courier status isn't polled.
- Guest abandoned carts have no email, so they can't be reminded.
- Delivery/bounce webhooks from Resend aren't consumed. `email_log` records only acceptance by Resend.
