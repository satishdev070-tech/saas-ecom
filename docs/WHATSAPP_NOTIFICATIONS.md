# WhatsApp order notifications

Automatic WhatsApp Business messages to shoppers for **order placed, shipped (with tracking), out for delivery, delivered** and an **abandoned-cart reminder**. They are sent from the store's own WhatsApp Cloud API number, the one connected in Marketing → Inbox (`src/features/inbox/server/whatsapp.ts`).

## Meta rules we follow

- **Templates only.** Business-initiated messages outside the 24-hour customer-service window must use pre-approved templates (`POST /{phone-number-id}/messages`, `type: "template"`). Free-form text is never used for notifications.
- **Opt-in.** We message only shoppers who ticked the WhatsApp box at checkout. The box is unticked by default and names the store. Consent is stored in `customer_whatsapp_optins` with the wording shown.
- **Opt-out.** A shopper who replies `STOP` (or `unsubscribe`) is opted out. `START` re-subscribes someone who opted in earlier. Each template has a "Reply STOP" footer.
- **Utility vs marketing.** Order updates are UTILITY templates. The cart reminder is MARKETING. Meta may decline to deliver a marketing message (code 131049); we record that and do not retry.

## Flow

1. Order or shipping code calls `emit(event)` from `src/features/notifications/events.ts` (role C's dispatcher). The WhatsApp channel (`whatsapp/channel.ts`) is one of the default channels.
2. The channel acts only when all of these hold (`policy.ts → gate`):
   - WhatsApp is connected and enabled.
   - The event is enabled in Settings → Notifications and mapped to an approved template.
   - The shopper has a valid E.164 number (Indian numbers are normalised to +91).
   - The shopper has opted in.
3. The channel adds a `notification_jobs` row (unique per event, so one message per event), then claims the job and sends it straight away.
4. **Failures.** Network errors, 5xx responses and throttling are retried with backoff (1m, 5m, 30m, 2h, 6h; 5 attempts). The cron `GET /api/cron/notifications` (Bearer `CRON_SECRET`) picks these retries up. Permanent errors fail immediately: missing template, undeliverable number, revoked token.
5. **Stuck jobs.** A job left in `sending` for more than 10 minutes is marked failed, not resent. WhatsApp has no idempotency key, so resending could deliver a duplicate.
6. **Delivery status.** Sent, delivered, read and failed statuses arrive on the WhatsApp webhook. `handleWhatsAppNotificationWebhook` applies them to the job and only ever moves the status forward.
7. **Inbox.** If the store already has an inbox conversation with that shopper, the sent message, with its variables filled in, is added to it.

## Templates to submit (WhatsApp Manager → Message templates)

Create each template in **English (`en`)** and **Hindi (`hi`)**. Keep the variables in the order shown, and use no header (or a fixed text header). Don't use buttons with a dynamic URL. Footer: "Reply STOP to stop these messages" / "ये संदेश बंद करने के लिए STOP लिखें".

| Name | Category | Event | Variables |
|------|----------|-------|-----------|
| `order_confirmation` | UTILITY | Order placed | {{1}} name, {{2}} store, {{3}} order no., {{4}} total |
| `order_shipped` | UTILITY | Shipped | {{1}} name, {{2}} order no., {{3}} courier, {{4}} tracking no., {{5}} tracking link |
| `order_out_for_delivery` | UTILITY | Out for delivery | {{1}} name, {{2}} order no., {{3}} store |
| `order_delivered` | UTILITY | Delivered | {{1}} name, {{2}} order no., {{3}} store |
| `cart_reminder` | MARKETING | Abandoned cart | {{1}} name, {{2}} store, {{3}} cart link |

The full body text for both languages is in `src/features/notifications/whatsapp/templates.ts` (`RECOMMENDED_TEMPLATES`) and on the settings page. Templates with named variables (`{{customer_name}}` and so on) also work, as long as they use the variable names listed for the event.

## Seller steps

1. Connect the WhatsApp number in **Marketing → Inbox** (phone number id, WABA id, permanent token with `whatsapp_business_messaging` + `whatsapp_business_management`).
2. Submit the five templates above (en + hi) in WhatsApp Manager and wait for approval.
3. Open **Settings → Notifications**. For each event, pick the approved template, tick "Send automatically" and save. The template list is read live from the WABA, and the server checks it again when you save.
4. Send a test to your own number. The page shows what WhatsApp actually returned, and the delivery status appears under Recent messages.

## Platform steps

- Apply `supabase/migrations/20261003002300_whatsapp_notifications.sql` (or `supabase/dev/apply-2300.sql`).
- Schedule `GET /api/cron/notifications` every 5–15 minutes with `Authorization: Bearer $CRON_SECRET`. On Vercel, add a `crons` entry in `vercel.json`.
- The Meta app's WhatsApp webhook must be subscribed to the `messages` field. It is already used by the inbox.

## Limits and known gaps

- **Abandoned carts.** Only signed-in shoppers' carts qualify. Guest carts store no customer or phone. The customer's stored phone must be opted in.
- **Out for delivery.** Nothing emits this event until carrier tracking is polled (role C's note). The template and settings are ready for it.
- **Order cancelled and refunded.** These events are not sent on WhatsApp (not in scope).
- **Opt-in location.** Opt-in is collected at checkout only. An account-page toggle is not built yet.
