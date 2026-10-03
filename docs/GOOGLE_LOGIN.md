# Google sign-in (sellers and shoppers)

"Continue with Google" appears automatically on the seller login/register pages and on every
store's shopper login/register pages **as soon as the Google provider is enabled in Supabase**.
The app reads Supabase's public auth settings (cached for 5 minutes), so there is never a broken
button. Platform admins can hide it for sellers or for store customers in **Admin → Sign-in &
checkout** (`/admin/sign-in`), which also shows the provider status and the URLs to register.
Signed-out shoppers also see "Check out faster with Google" at checkout.

## One-time setup

1. **Google Cloud Console** → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → type **Web application**.
   - *Authorised redirect URI*: `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in step 2).
   - OAuth consent screen: app name, support email, logo, privacy policy URL. Publish it to "In production" when you go live.
2. **Supabase** → Authentication → Sign In / Providers → **Google** → enable, paste the Client ID and Client secret, save.
3. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add every place users return to:
   - `http://localhost:3000/**` and `http://*.localhost:3000/**` (development)
   - `https://<platform domain>/**` (seller dashboard)
   - `https://*.<platform domain>/**` (store subdomains)
   - each custom store domain, e.g. `https://thepaliya.com/**`

## How it works

| Who | Button on | Returns to | Then |
|---|---|---|---|
| Seller | `/seller/login`, `/seller/register` | `{platform}/auth/callback` (PKCE code exchange) | Dashboard; new accounts go to onboarding to create their store |
| Shopper | `/account/login`, `/account/register` on the store domain | `{store}/account/auth/callback` | Signed in on that store; the customer record is linked to the store |

Server actions `googleSignInAction` (features/auth) and `storeGoogleSignInAction`
(features/customer-account) start Supabase's OAuth flow with `prompt=select_account`, are
rate-limited, and only accept safe relative `next` paths. Failures return to the login page with
a friendly message.

## Status in this environment

The Google provider is **not enabled** in the connected Supabase project yet
(`/auth/v1/authorize?provider=google` returns "provider is not enabled"). The buttons are hidden
until you complete steps 1–3, then appear without a deploy.
