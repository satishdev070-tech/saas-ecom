import type { TenantPermission } from "@/lib/permissions/matrix";

/**
 * Integration registry (pure; shared by settings UI, server and tests). Field names follow each
 * provider's official credentials:
 *   Razorpay  — Key ID + Key Secret (+ webhook secret)                 razorpay.com/docs/api/authentication
 *   Cashfree  — App ID (x-client-id) + Secret Key (x-client-secret)    cashfree.com/docs/api-reference/payments
 *   PayU      — Merchant Key + Merchant Salt                           docs.payu.in (hosted checkout hash)
 *   Shiprocket— API user email + password (Settings → API → Create API User)
 *   Delhivery — API token ("Authorization: Token …")                   delhivery-express-api-doc.readme.io
 *   GA4 measurement ID, Google Ads ID + conversion label, Meta Pixel ID.
 */
export type IntegrationKind = "payment" | "shipping" | "tracking" | "social";
export type ProviderId = "razorpay" | "cashfree" | "payu" | "shiprocket" | "delhivery" | "ga4" | "google_ads" | "meta_pixel" | "facebook" | "instagram" | "pinterest" | "youtube";
export type IntegrationStatus = "not_connected" | "connected" | "error" | "expired" | "disabled";

export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  pattern?: RegExp;
  patternHint?: string;
  placeholder?: string;
  help?: string;
};

export type ProviderDef = {
  id: ProviderId;
  kind: IntegrationKind;
  label: string;
  description: string;
  docsUrl: string;
  /** Tenant feature flag that must be on (super admin can switch it off per store). */
  feature: string;
  permission: TenantPermission;
  environments: boolean;
  testable: boolean;
  fields: CredentialField[];
};

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  razorpay: {
    id: "razorpay", kind: "payment", label: "Razorpay", description: "UPI, cards, net banking and wallets through your Razorpay account.",
    docsUrl: "https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/", feature: "online_payments", permission: "payments.manage", environments: false, testable: true,
    fields: [
      { key: "key_id", label: "Key ID", secret: false, required: true, pattern: /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/, patternHint: "Looks like rzp_test_XXXXXXXX or rzp_live_XXXXXXXX", placeholder: "rzp_test_…" },
      { key: "key_secret", label: "Key Secret", secret: true, required: true },
      { key: "webhook_secret", label: "Webhook secret", secret: true, required: false, help: "The secret you set when adding the webhook in Razorpay." },
    ],
  },
  cashfree: {
    id: "cashfree", kind: "payment", label: "Cashfree Payments", description: "UPI, cards, net banking, wallets and pay later via Cashfree Payment Gateway.",
    docsUrl: "https://www.cashfree.com/docs/payments/online/intro", feature: "payments_cashfree", permission: "payments.manage", environments: true, testable: true,
    fields: [
      { key: "app_id", label: "App ID (Client ID)", secret: false, required: true, pattern: /^[A-Za-z0-9_-]{8,80}$/, patternHint: "The App ID from Cashfree Developers → API Keys" },
      { key: "secret_key", label: "Secret Key", secret: true, required: true, help: "Also used to verify Cashfree webhooks." },
    ],
  },
  payu: {
    id: "payu", kind: "payment", label: "PayU", description: "PayU hosted checkout: UPI, cards, net banking, EMI and wallets.",
    docsUrl: "https://docs.payu.in/docs/payu-hosted-checkout", feature: "payments_payu", permission: "payments.manage", environments: true, testable: true,
    fields: [
      { key: "merchant_key", label: "Merchant Key", secret: false, required: true, pattern: /^[A-Za-z0-9]{4,20}$/, patternHint: "The merchant key from PayU Dashboard → Developers" },
      { key: "merchant_salt", label: "Merchant Salt (v1)", secret: true, required: true },
    ],
  },
  shiprocket: {
    id: "shiprocket", kind: "shipping", label: "Shiprocket", description: "Courier aggregator: rates, serviceability, shipments, labels and tracking.",
    docsUrl: "https://apidocs.shiprocket.in/", feature: "shiprocket", permission: "settings.write", environments: false, testable: true,
    fields: [
      { key: "email", label: "API user email", secret: false, required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternHint: "Create one in Shiprocket → Settings → API → Configure" },
      { key: "password", label: "API user password", secret: true, required: true },
      { key: "pickup_location", label: "Pickup location name", secret: false, required: true, help: "Exactly as saved in Shiprocket → Settings → Pickup addresses.", placeholder: "Primary" },
      { key: "pickup_postcode", label: "Pickup PIN code", secret: false, required: true, pattern: /^[1-9][0-9]{5}$/, patternHint: "6-digit PIN code" },
    ],
  },
  delhivery: {
    id: "delhivery", kind: "shipping", label: "Delhivery", description: "Delhivery Express: serviceability, shipment manifestation, labels, tracking and cancellation.",
    docsUrl: "https://delhivery-express-api-doc.readme.io/reference/introduction-1", feature: "delhivery", permission: "settings.write", environments: true, testable: true,
    fields: [
      { key: "api_token", label: "API token", secret: true, required: true, help: "From Delhivery One → Settings → API Setup." },
      { key: "pickup_location", label: "Pickup warehouse name", secret: false, required: true, help: "The client warehouse name registered with Delhivery." },
      { key: "pickup_postcode", label: "Pickup PIN code", secret: false, required: true, pattern: /^[1-9][0-9]{5}$/, patternHint: "6-digit PIN code" },
    ],
  },
  ga4: {
    id: "ga4", kind: "tracking", label: "Google Analytics 4", description: "Page views and e-commerce events in your GA4 property.",
    docsUrl: "https://support.google.com/analytics/answer/9539598", feature: "google_analytics", permission: "settings.write", environments: false, testable: false,
    fields: [{ key: "measurement_id", label: "Measurement ID", secret: false, required: true, pattern: /^G-[A-Z0-9]{4,16}$/, patternHint: "Looks like G-XXXXXXXXXX", placeholder: "G-XXXXXXXXXX" }],
  },
  google_ads: {
    id: "google_ads", kind: "tracking", label: "Google Ads", description: "Purchase conversions for your Google Ads campaigns.",
    docsUrl: "https://support.google.com/google-ads/answer/6095821", feature: "google_ads", permission: "settings.write", environments: false, testable: false,
    fields: [
      { key: "ads_id", label: "Google Ads tag ID", secret: false, required: true, pattern: /^AW-[0-9]{6,15}$/, patternHint: "Looks like AW-123456789", placeholder: "AW-…" },
      { key: "purchase_label", label: "Purchase conversion label", secret: false, required: true, pattern: /^[A-Za-z0-9_-]{6,40}$/, patternHint: "The label after the slash in send_to (AW-123/LABEL)" },
    ],
  },
  meta_pixel: {
    id: "meta_pixel", kind: "tracking", label: "Meta Pixel", description: "Facebook & Instagram ads measurement (browser pixel).",
    docsUrl: "https://developers.facebook.com/docs/meta-pixel/get-started", feature: "meta_pixel", permission: "settings.write", environments: false, testable: false,
    fields: [{ key: "pixel_id", label: "Pixel ID", secret: false, required: true, pattern: /^[0-9]{10,20}$/, patternHint: "15–16 digit number from Events Manager" }],
  },
  facebook: { id: "facebook", kind: "social", label: "Facebook Page", description: "Publish photo posts to a Facebook Page you manage.", docsUrl: "https://developers.facebook.com/docs/pages-api/posts", feature: "social_media", permission: "marketing.write", environments: false, testable: true, fields: [] },
  instagram: { id: "instagram", kind: "social", label: "Instagram (Business)", description: "Publish image posts to an Instagram professional account linked to your Page.", docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing", feature: "social_media", permission: "marketing.write", environments: false, testable: true, fields: [] },
  pinterest: { id: "pinterest", kind: "social", label: "Pinterest", description: "Create Pins on your boards.", docsUrl: "https://developers.pinterest.com/docs/api/v5/pins-create/", feature: "social_media", permission: "marketing.write", environments: false, testable: true, fields: [] },
  youtube: { id: "youtube", kind: "social", label: "YouTube", description: "Connect your channel (video publishing is not supported yet).", docsUrl: "https://developers.google.com/youtube/v3", feature: "social_media", permission: "marketing.write", environments: false, testable: true, fields: [] },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const providersOfKind = (kind: IntegrationKind) => PROVIDER_IDS.filter((id) => PROVIDERS[id].kind === kind).map((id) => PROVIDERS[id]);
export function isProviderId(v: string): v is ProviderId {
  return Object.hasOwn(PROVIDERS, v);
}

/** Validates submitted credential values. Blank secrets mean "keep the stored value" when one exists. */
export function validateCredentials(def: ProviderDef, values: Record<string, string>, stored: { hasSecrets: Record<string, boolean>; public: Record<string, string> }): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    const present = v || (f.secret ? stored.hasSecrets[f.key] : stored.public[f.key]);
    if (f.required && !present) errors[f.key] = [`${f.label} is required`];
    else if (v && f.pattern && !f.pattern.test(v)) errors[f.key] = [f.patternHint ?? `Check the ${f.label}`];
    else if (v.length > 500) errors[f.key] = ["Too long"];
  }
  return errors;
}

/** "rzp_test_ab12…" style display value for non-secret identifiers, "•••• 1a2b" for secrets. */
export function maskSecret(last4: string | null): string {
  return last4 ? `•••• ${last4}` : "Not set";
}
