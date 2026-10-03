# Social media hub

Route: **Marketing → Social** (`/dashboard/marketing/social`). `marketing.read` to view,
`marketing.write` to connect and post. Feature flag `social_media`.

## Connections (OAuth, no fake states)

| Network | Platform env (OAuth app) | Seller connects | Publishing |
|---|---|---|---|
| Facebook Page + Instagram professional account | `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default v25.0) | Facebook Login, chooses the Page(s) to share; the Page's linked Instagram account is connected too | FB: `POST /{page-id}/photos`. IG: `POST /{ig-id}/media` then `/media_publish` (JPEG, public URL, 100 posts/24 h) |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | Pinterest OAuth (`boards:read, pins:read, pins:write, user_accounts:read`), then picks a board | `POST /v5/pins` with `media_source.source_type = image_url` |
| YouTube | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth (`youtube.readonly`) | **Not supported.** Channel shown as connected; the UI says video publishing isn't available |

Redirect URIs to register: `{platform origin}/api/oauth/{meta|pinterest|youtube}/callback`.
If a network's env vars are missing, the card says "Not configured by the platform yet". There is
no Connect button and nothing pretends to be connected.

**OAuth security:** state is an HMAC-signed `{tenant, user, network, nonce, exp (10 min)}` and the
nonce is also in an httpOnly cookie scoped to `/api/oauth`, so a callback completes only in the
browser, for the user and for the store that started it. Tokens are encrypted in
`tenant_integrations` (server-only), never sent to the browser. Pinterest tokens are refreshed
before expiry. Provider 401 / code 190 responses mark the connection `expired`. Disconnect deletes
the stored token (the UI also explains revoking the app on the network). Connect, disconnect and
publish are audited.

## Posts

Composer: image from the media library, caption (2,200), hashtags (normalised, max 30, Unicode-safe),
link (Facebook text and Pin link; Instagram captions can't hold links), networks. Actions:

- **Publish now**: claims the post (`draft|failed → publishing`), publishes to each network and records per-network results.
- **Schedule** (IST, 1 min to 90 days ahead): `/api/cron/social-publish` (every 5 min, `CRON_SECRET`) claims due posts with a conditional update, so overlapping runs never double-post. Posts stuck in `publishing` for 30 min become `failed`.
- **Retry** a failed post: networks that already succeeded are skipped.
- **Cancel** (scheduled) and **Delete** (draft, cancelled, failed).

Statuses: Draft, Planned (calendar only, never auto-published), Scheduled, Publishing, Published (at least one network succeeded; per-network
errors shown), Failed, Cancelled. Non-JPEG images are converted to JPEG for Instagram and stored
under `tenant/{id}/social/`.

## Planner

Everything lives in `social_posts` plus three tenant tables (`social_campaigns`,
`social_hashtag_sets`, `marketing_dates`), all with `marketing.read`/`marketing.write` RLS.
Queries: `src/features/social/server/planner.ts` (RLS server client, tenant from membership).
Mutations: `src/features/social/planner-actions.ts` and `savePostAction` (`marketing.write` +
`social_media` entitlement, audited). Pure helpers: `src/features/social/planner.ts`.

Post planning fields: `title`, `notes`, `pillar` (product, offer, behind the scenes, how-to,
customer story, festive, announcement), `campaign_id`, `manual_done`.

### Calendar

`getCalendar(tenant, from, to)` returns dated posts (`scheduled_at`, else `published_at` for
publish-now posts), undated drafts, campaigns, and key dates. Days are grouped in IST
(`istDayKey`). Key dates are the store's own dates plus built-in fixed occasions: New Year,
Republic Day, Valentine's, Women's Day, Mother's Day (2nd Sunday of May), Father's Day (3rd Sunday
of June), Independence Day, Teachers' Day, Gandhi Jayanti, Children's Day, Black Friday (day after
the 4th Thursday of November) and Christmas. Lunar festivals (Diwali, Holi, Eid, ...) are **not**
built in because their dates change every year: sellers add them as their own key dates.

Drag-and-drop (`reschedulePostAction`) moves only draft, planned and scheduled posts. A dated
draft becomes **planned**. A scheduled post stays between 1 minute and 90 days ahead. Planned
times can be from yesterday up to a year ahead. The update is conditional on the status that was
read, so a post the cron has just claimed is never moved.

Overview (`getPlannerOverview`): connected networks, scheduled/planned this week (Monday to
Sunday, IST), published in the last 30 days, failed, overdue planned channels (past posts in the
last 30 days with a manual channel not yet marked posted), and the pillar mix of posts created in
the last 30 days.

### Planned channels (manual)

WhatsApp, X, LinkedIn, Threads and YouTube are **planned channels**. We have no approved
publishing access for them, so they are **never posted automatically**. They appear on the
calendar. When one is due, the seller copies the caption, downloads the image, posts it
themselves, and marks the channel posted (`markChannelPostedAction`, toggles `manual_done`; undo
supported).

- Composer intent **Plan** sets status `planned` with a required time. Planned posts are never
  claimed by `/api/cron/social-publish`, which selects and claims only `scheduled`.
- **Schedule** and **Publish now** need at least one auto network (Facebook, Instagram,
  Pinterest). If only planned channels are picked, the composer says to use Plan instead.
- A mixed post (for example Instagram + WhatsApp) auto-publishes only the auto networks.
  `publishPost` skips manual channels and `overallStatus` counts only auto networks. The manual
  channels stay on the calendar to be marked posted.
- Images are required for Schedule/Publish, not for Draft/Plan.

### Campaigns and hashtag sets

Campaigns have a name, colour, optional goal and date range. Posts link to them by
`campaign_id`; the composite FK `(tenant_id, campaign_id)` makes cross-store links impossible.
Deleting a campaign keeps its posts (`campaign_id` is set to null). Hashtag sets are named,
normalised tag lists (max 30) that the composer can insert.

### Product to post

`createPostFromProductAction(productId)` reads the product with the RLS client (archived products
are refused) and creates a **draft** with pillar `product`:

- the first product image;
- a caption of the title, the short description and the price (`min_price` converted to paise,
  shown as `formatMoney`, for example ₹1,299);
- a link to the store's primary verified domain (else its platform subdomain):
  `/products/{slug}?utm_source=social&utm_medium=organic&utm_campaign=planner`.

The link is kept only when it is `https://`, so local `*.localhost` stores get no link. The post
keeps `product_id`. The seller then picks channels and plans, schedules or publishes it.

## Not verified here

No Meta, Pinterest or Google apps are configured in this environment, so OAuth and publishing are
untested against live APIs. Endpoints follow the official docs (Instagram content publishing,
v25.0; Pinterest API v5 OpenAPI spec). App review is required for these permissions: Meta
`pages_manage_posts` and `instagram_content_publish`, and Pinterest standard access.

## A, platform-apps: Platform apps setup

Sellers connect their **own** accounts through the **platform's** apps. The super admin enters those apps in **Admin → Social apps** (`/admin/social-apps`, permission `platform.settings.manage`). Until an app is set up, sellers see "Your platform admin needs to add the {network} app in Admin → Social apps" instead of a Connect button. Platform admins also get a direct link there.

**Storage:** `platform_app_credentials`, one row per provider (`meta`, `pinterest`, `google`, `gemini`, `groq`, `anthropic`).
- Secrets are AES-256-GCM encrypted with a dedicated purpose key (`platform-app-credentials`).
- The table has RLS on and no policies, so only the server's secret-key client reads it. Writes happen only after the platform permission check, and every save, clear and token rotation is audited without values.
- `getAppCredential(provider)` (`src/features/platform-apps/server.ts`) reads the DB first and falls back to env, with a per-request cache. A DB row is used only when it's complete (secret, plus client id for OAuth apps).
- **Env fallbacks:** `META_APP_ID`/`META_APP_SECRET`, `PINTEREST_APP_ID`/`PINTEREST_APP_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `META_WEBHOOK_VERIFY_TOKEN`.
- **The console never shows a secret again.** It shows only "Configured", the source (console or env) and "ending ••1234".

`{origin}` below is `NEXT_PUBLIC_PLATFORM_URL` (or `https://{NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN}`). The admin page prints the exact values.

### Meta (Facebook, Instagram, Messenger, WhatsApp)
1. Go to developers.facebook.com/apps → **Create app**. Choose the Business type (or the Facebook Login for Business, Instagram, Messenger and WhatsApp use cases) and link your Business portfolio.
2. In **App settings → Basic**, add the privacy policy URL, terms URL, data deletion URL and app domain. Copy the **App ID** and **App secret** into Admin → Social apps.
3. In **Facebook Login for Business → Settings**, add the Valid OAuth Redirect URI `{origin}/api/oauth/meta/callback`.
4. Click **Generate token** in Admin → Social apps to create the webhook verify token (stored in `extra.webhookVerifyToken`).
5. In **Webhooks**, set the callback to `{origin}/api/webhooks/meta` with that verify token. Subscribe to Page `messages` and `messaging_postbacks`, and Instagram `messages`.
6. Add **WhatsApp**. In **WhatsApp → Configuration**, set the callback to `{origin}/api/webhooks/whatsapp` with the same token and subscribe to `messages`. Payloads are signed with the App secret (`X-Hub-Signature-256`).
7. Complete **Business Verification**, then request **Advanced Access** in App Review for `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`, `pages_messaging`, `instagram_manage_messages`, `whatsapp_business_messaging` and `whatsapp_business_management`. Each one needs a screencast.
8. Switch the app to **Live**. Until review passes, only people with a role on the app can connect.

### Pinterest
1. Go to developers.pinterest.com with a business account → **My apps → Connect app**, then submit the request form. Pinterest reviews it for Trial access, usually within one business day.
2. Go to **My apps → Manage → Configure → Redirect URIs** and add `{origin}/api/oauth/pinterest/callback` (exact match).
3. Copy the **App ID** and **App secret key** into Admin → Social apps. The scopes requested are `boards:read`, `pins:read`, `pins:write` and `user_accounts:read`.
4. Apply for **Standard access** before going live. Trial access is limited.

### Google (YouTube and Business Profile)
1. In the Google Cloud console, create a project and enable **YouTube Data API v3**, **My Business Account Management API**, **My Business Business Information API** and **Google My Business API**.
2. Configure the **OAuth consent screen**. Add the scopes `youtube.readonly` and `business.manage`.
3. Go to **Credentials → OAuth client ID → Web application** and add both redirect URIs: `{origin}/api/oauth/youtube/callback` and `{origin}/api/oauth/google-business/callback`.
4. Copy the client ID and secret into Admin → Social apps.
5. Request Business Profile API access through the GBP API contact form ("Application for Basic API Access"). The quota is 0 QPM until it's approved.
6. Publish the consent screen and submit it for verification. The scopes are sensitive.

### AI keys (Neural Pulse)
Gemini (aistudio.google.com/apikey), Groq (console.groq.com/keys) and Anthropic (console.anthropic.com/settings/keys) each take only an API key. `getAiProviderOrder()` returns the configured ones in the order gemini, groq, anthropic.

## D, google-business: Google Business Profile

Page: **Marketing → Google** (`/dashboard/marketing/google`). Reads need `marketing.read`; every mutation needs `marketing.write` plus the `social_media` entitlement (`marketingCtx`). Code: `src/features/google-business/**`.

**API access approval.** Google opens the Business Profile APIs only after it approves the platform's Cloud project (request form linked from developers.google.com/my-business/content/prereqs). Until then sellers can sign in, but Google answers 403/429 to listing, reply and post calls. The page says this in an info banner, and errors read "Google refused the request… may still be awaiting Google's approval". Replies and posts work only on **verified** listings.

**Connect (OAuth).** `/api/oauth/google-business/start` → Google → `/api/oauth/google-business/callback`.
- Client id and secret come from `getAppCredential("google")` (Admin → Social apps, else env). Without them the page shows "isn't configured by the platform yet" instead of a Connect button.
- Scope `https://www.googleapis.com/auth/business.manage`, with `access_type=offline&prompt=consent` so Google returns a refresh token. No refresh token means `?error=no_refresh`.
- State is the same pattern as social OAuth: an HMAC-signed `{tenant, user, nonce, exp}` plus an httpOnly nonce cookie scoped to `/api/oauth/google-business`. The callback also re-checks the user, store and `marketing.write`.
- The refresh and access tokens are stored encrypted in `tenant_integrations` (provider `google_business`, kind `social`) through the secret-key client, and refreshed on use when they expire within 5 minutes. A refresh rejected by Google (`invalid_grant`/401) marks the row **Expired**.
- After sign-in we list accounts (Account Management API v1 `GET /v1/accounts`) and their locations (Business Information API v1 `GET /v1/{account}/locations?readMask=…`). One location is chosen automatically. With several, the seller picks one, and the action re-lists the locations to verify the choice. `public_config` holds `account_name`, `location_name` (`accounts/{a}/locations/{l}`), `location_title`, `place_id` and review totals.
- If sign-in works but the APIs refuse, the row is saved with status **Error** and Google's (sanitised) reason, never "Connected".
- Disconnect revokes the grant at `oauth2.googleapis.com/revoke` (best effort), deletes the row and clears the cached reviews.

**Reviews** (`gbp_reviews`, RLS read with `marketing.read`, no member writes).
- "Sync reviews" (10 per hour per store) calls v4 `GET accounts/{a}/locations/{l}/reviews` (50 per page, `updateTime desc`, up to 500) and upserts on `(tenant_id, review_id)` with the secret-key client after the permission check. Rows from a previously chosen location are removed. `starRating` ONE..FIVE becomes 1..5, and anonymous reviewers get no name.
- The UI shows the average rating (Google's `averageRating` when known), the total, the unreplied count and the 5-star count, with filters for All, Unreplied and 5★ to 1★.
- Reply and edit reply use v4 `PUT …/reviews/{id}/reply` `{comment}`, limited to 4,096 bytes and 60 per hour. The review must belong to the caller's store (RLS read) and to the currently chosen location.
- **Suggest reply** calls Neural Pulse `suggestReviewReply` (store AI limits apply), and the seller edits the draft before posting.
- **Cron (optional):** `syncAllReviews()` through `src/features/google-business/server/cron-route.ts` (Bearer `CRON_SECRET`, 25 stores per run, least recently synced first). Mount it at `/api/cron/gbp-reviews`; every 6 hours is suggested.

**Posting.** `google` is an auto-publish planner channel. `publishPost` calls `publishGoogleLocalPost`, which runs v4 `POST …/localPosts` with:
- `topicType: STANDARD` and `languageCode: en-IN`;
- `summary` = the caption, cut to Google's 1,500 characters;
- `media: [{mediaFormat: PHOTO, sourceUrl}]` from the public asset URL (https only);
- `callToAction: {actionType: LEARN_MORE, url}` when the post has a link.

The result stores the post name and `searchUrl`. Scheduled posts that include Google publish through the existing `/api/cron/social-publish`.

**Profile builder.**
- **Completeness checklist:** name, address, phone, hours, description, category, website and photos from the store profile (`stores`, first active `store_locations`, the primary verified domain or platform subdomain, and image count in `media_assets` plus the logo), compared with the live location. The location fields come from the Business Information `GET /v1/locations/{id}`, and the photo count from v4 `media` `totalMediaItemCount`.
  - States: Complete, Missing on Google (highlighted), Doesn't match your store (highlighted: phone by last 10 digits, website by host, address by PIN code, name normalised), and Add to your store first.
  - The score is the share of items that are Complete.
- **Generate description:** Neural Pulse `generateProfileDescription`, capped at 750 characters. The seller can copy it or "Save to Google" (Business Information `PATCH /v1/locations/{id}?updateMask=profile.description`).
- **Create or claim:** guided steps linking to https://business.google.com/create. Creating and verifying a listing happens on Google, because the API can't create a verified listing for a seller.
- **Request reviews:** `https://search.google.com/local/writereview?placeid={placeId}` with a copy button and a `wa.me` share link, plus a reminder that Google forbids incentivised reviews.

**Tests.** `tests/unit/google-business/gbp.test.ts` covers the localPost mapping, review parsing and stats, location parsing and completeness scoring, and the links. `tests/rls/google-business.test.ts` checks that another store can't read `gbp_reviews`, that members can't write it, and that shoppers see nothing.

**Not verified here.** There's no approved Google Business Profile API project in this environment, so OAuth, the review list, replies, localPosts and the description PATCH are untested against live Google. The endpoints follow the official reference (Account Management v1, Business Information v1, My Business v4).

## C, neural-pulse: Neural Pulse

Route: **Marketing → Neural Pulse** (`/dashboard/marketing/neural-pulse`). `marketing.read` to view,
`marketing.write` + the `social_media` entitlement to generate and save. Code: `src/features/neural-pulse/**`.

- **Brand profile** (`brand_profiles`, one per store): voice, audience, keywords, do's, don'ts, up to 5
  languages (English, Hindi, Hinglish, Bengali, Gujarati, Kannada, Malayalam, Marathi, Punjabi, Tamil,
  Telugu). "Auto-fill from my store" drafts it from the store name, tagline, description, store type,
  categories and best sellers; nothing is saved until the seller saves the form.
- **Generators** (all use the brand profile, up to 15 best-selling active products with ₹ prices via
  `formatMoney`, upcoming key dates from the planner (own + built-in) and the content pillars):
  10 content ideas (hook, format reel/carousel/static/story, pillar, channels); caption + hashtags for a
  product or idea with Instagram / Facebook (2,200) / X (280) variants; a 2- or 4-week plan (2-7 posts a
  week) balanced across pillars and key dates.
- **Add to calendar** calls the planner's own `savePostAction` per item (same validation, permissions,
  audit): plans become *Planned* posts (never auto-published), everything else becomes drafts.
- **History**: last 30 rows of `ai_generations`, re-validated before rendering.
- **Exports** (`@/features/neural-pulse/server`, server-only, for a signed-in dashboard request; they re-check
  `tenantId === requireTenant().tenantId` and `marketing.write`): `suggestMessageReply(tenantId, conversationId)`,
  `suggestReviewReply(tenantId, { rating, comment, reviewerName })`, `generateProfileDescription(tenantId, { storeName, about, category })`
  (≤ 750 chars). They return `{ ok: true, text, provider, model } | { ok: false, reason, message }`; nothing is sent.

**Providers.** Keys come from `getAppCredential("gemini" | "groq" | "anthropic")` (Admin → Social apps, env
fallback `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`). The first configured provider in the order
Gemini → Groq → Anthropic is used; on an HTTP error, timeout (30 s Gemini/Groq, 90 s Claude) or refusal the
next one is tried. Every reply must be JSON and is validated with zod; an invalid reply is retried once on
the same provider. Calls use REST (no SDK): Gemini `v1beta/models/{model}:generateContent` (`x-goog-api-key`,
`responseMimeType: application/json`), Groq `openai/v1/chat/completions` (`response_format: json_object`),
Anthropic `v1/messages` (`effort: low`, server-side refusal fallback `fallbacks: "default"`). Keys stay in
request headers on the server and are never logged or sent to the browser. If nothing is configured the page
says so and links to Admin → Social apps.

**Limits and logging.** 30 generations per store per 24 h (`rateLimit("neural-pulse", tenantId, 30, 86400)`,
fails open like every limiter). Each successful generation is logged to `ai_generations` (kind, input
summary, output, provider, model, total tokens, user) with the admin client after the permission check
(sellers have no insert grant). Prompts carry only store/brand/product facts, wrap them as data in
`<store_context>`, strip angle brackets, and pass only a reviewer's first name.

| | Google Gemini (free tier) | Groq (free tier) | Anthropic Claude (paid) |
|---|---|---|---|
| Model used | `gemini-3.8-flash` | `llama-3.3-70b-versatile` | `claude-opus-5-5` |
| Cost | Free tier with rate limits; paid tier per token | Free plan with rate limits; paid Developer plan | Paid only ($4 / $20 per 1M input / output tokens) |
| Limits | Per-project RPM / RPD / TPM, shown in AI Studio; tight on free | Per-org RPM / TPD, shown in the Groq console | Account rate limits by usage tier |
| Data use | **Free tier: Google may use prompts and outputs to improve its products** (paid tier: not used) | Not retained by default for inference (temporary logs up to 30 days for abuse/troubleshooting) | Not used for training by default under commercial terms |
| Quality notes | Good multilingual (Hindi/Hinglish) and fast | Very fast; weaker in Indian languages than Gemini/Claude | Best writing quality and instruction following; slowest and costs money |

Honest guidance: Gemini's free tier is the easiest start, but store data in prompts (product names, prices,
brand text, review/message text for reply drafts) may be used by Google on that tier; stores that mind should use
a paid Gemini key, Groq, or Claude. Free-tier quotas are shared by every store on the platform, so expect
"try again later" when busy; the per-store limit keeps one store from using them all. All output is a draft:
the seller reviews it, and the prompts forbid inventing prices or offers, but models can still be wrong.

## B, inbox: Inbox

A unified inbox at `/dashboard/marketing/inbox` for Facebook Page Messenger, Instagram DMs and WhatsApp Business (Cloud API) messages. Code: `src/features/inbox/**`, `src/app/api/webhooks/{meta,whatsapp}/route.ts`.

**Webhooks.** Configure them in the Meta app: `https://{platform host}/api/webhooks/meta` (Page fields `messages`, `messaging_postbacks`, `message_echoes`; Instagram field `messages`) and `/api/webhooks/whatsapp` (WhatsApp field `messages`).
- GET answers `hub.challenge` only when `hub.verify_token` matches `getAppCredential("meta").extra.webhookVerifyToken` (timing-safe). A missing token returns 403.
- POST reads the raw bytes (512 KB cap) and checks `X-Hub-Signature-256` as an HMAC-SHA256 with the Meta app secret (timing-safe). A missing secret returns 503 and a bad signature returns 401. WhatsApp uses the same Meta app secret.
- Parsing (`webhook.ts`) is pure. Messenger and Instagram: `entry[].messaging[]` text, attachments, postbacks and echoes (echoes are stored as outbound). Delivery, read and unsend events are skipped. WhatsApp: `changes[].value.messages[]` (text, media captions or placeholders, interactive, reaction, location) and `statuses[]` (sent/delivered/read become `sent`; `failed` keeps the error).
- The route replies 200 straight away. Storage runs in `after()`.

**Tenant mapping (verified only).** Page id goes to the `facebook` row's `public_config.account_id`, the IG account id to the `instagram` row's `account_id`, and the WhatsApp `phone_number_id` to the `whatsapp` row's `phone_number_id`. Only rows that are `status='connected' and enabled` count. An unknown id, or one claimed by more than one store, is ignored. The tenant never comes from the payload.

**ADR-006 note.** Webhook ingestion uses the secret-key client (`src/lib/supabase/admin`) under the existing "verified webhooks after signature verification" allowance: the signature is checked first, and every write is scoped to the tenant resolved above. Staff replies also insert `social_messages` rows with the admin client, because `authenticated` has no INSERT grant on that table. This happens only after `marketingCtx()` (membership, `marketing.write` and the `social_media` entitlement) and an RLS read of the conversation. The WhatsApp connection is stored in `tenant_integrations` by `src/features/inbox/server/whatsapp.ts`, following the same rules as `integrations/server/store.ts` (that store's `ProviderId` doesn't include `whatsapp`).

**Idempotency.** Messages are upserted with `on conflict (tenant_id, external_id) do nothing`, so Meta retries and echoes of our own replies are no-ops. Conversations are unique on `(tenant_id, channel, external_thread_id)`, where the thread id is the PSID, IGSID or wa_id. If an echo arrives before the send call returns, the pending row is dropped (unique violation) and the echo row is kept. `unread_count` is a read-then-write increment, so a rare concurrent burst can undercount. There is no RPC because the migration is a fixed contract.

**Replies** (`server/send.ts`, `actions.ts`, `marketing.write`):
- Messenger and Instagram use `POST /{page-id}/messages` (`messaging_type: RESPONSE`) with the stored Page token. Instagram uses the linked Page's id and token.
- WhatsApp uses `POST /{phone-number-id}/messages` (type `text`) with the Bearer token.
- The 24-hour customer-service window (`window.ts`) is enforced before any call. Once it has closed, free-form text is blocked. The UI explains that WhatsApp needs a pre-approved template and Messenger/Instagram need an approved message tag. Neither is built.
- Each reply row is recorded as sending, then sent (with the provider id) or failed (with our own error wording). Replies are rate limited to 300 per store per hour and audited.
- Other actions: mark read (automatic when a thread is opened by someone with write access), close and reopen.
- "Suggest reply" calls Neural Pulse `suggestMessageReply`. It drafts text only and never sends.

**WhatsApp connect.** Under Inbox → Channels, the form takes the phone number ID, WABA ID and a permanent system-user token.
- The token is encrypted, never sent back to the browser, and shown only as a last-4 hint.
- On save, the number is checked with `GET /{phone-number-id}?fields=verified_name,display_phone_number`. The connection is stored as connected only if that call succeeds.
- The app is then subscribed with `POST /{waba-id}/subscribed_apps`. If that call fails, the error is shown but the connection is not blocked.
- A number already connected to another store is refused.
- The form includes step-by-step instructions for Business Manager.

**Messenger and Instagram.** These channels reuse the Social → Accounts Page connection. "Receive messages from this Page" calls `POST /{page-id}/subscribed_apps`.

**App Review (limits).** The messaging permissions `pages_messaging`, `instagram_manage_messages` and `whatsapp_business_messaging` need Meta App Review and Advanced Access. Until then, only people with a role on the app get messages. `META_SCOPES` in `providers.ts` (role A's file) doesn't yet request `pages_messaging` or `instagram_manage_messages`, and sellers who connected earlier must reconnect. Media isn't downloaded: WhatsApp media is shown as a caption or placeholder, and Meta attachment CDN links are opened directly. Templates and message tags aren't supported. None of this has been exercised against live Meta. It's covered by unit tests (signature, handshake, payload parsing, the window) and DB tests (`tests/rls/social-inbox.test.ts`: isolation, no staff inserts, idempotency, the mapping filter).
