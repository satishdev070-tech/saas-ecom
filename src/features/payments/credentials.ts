import "server-only";
import { serverEnv } from "@/lib/env/server";
import { activeIntegration, loadIntegration } from "@/features/integrations/server/store";
import type { CashfreeCredentials } from "./cashfree";
import type { PayuCredentials } from "./payu";

export type RazorpayCredentials = { keyId: string; keySecret: string; webhookSecret: string | null; mode: "test" | "live" };

/**
 * Per-store gateway credentials from tenant_integrations (server only; see integrations/server/store).
 * Secrets are decrypted in memory per request and never returned to the browser.
 */
export async function loadRazorpayCredentials(tenantId: string, opts: { requireEnabled?: boolean } = {}): Promise<RazorpayCredentials | null> {
  const it = (opts.requireEnabled ?? true) ? await activeIntegration(tenantId, "razorpay") : await loadIntegration(tenantId, "razorpay");
  if (!it?.public.key_id || !it.secrets.key_secret) return null;
  return { keyId: it.public.key_id, keySecret: it.secrets.key_secret, webhookSecret: it.secrets.webhook_secret ?? null, mode: it.public.key_id.startsWith("rzp_live_") ? "live" : "test" };
}

export async function loadCashfreeCredentials(tenantId: string, opts: { requireEnabled?: boolean } = {}): Promise<CashfreeCredentials | null> {
  const it = (opts.requireEnabled ?? true) ? await activeIntegration(tenantId, "cashfree") : await loadIntegration(tenantId, "cashfree");
  if (!it?.public.app_id || !it.secrets.secret_key) return null;
  return { appId: it.public.app_id, secretKey: it.secrets.secret_key, environment: it.environment };
}

export async function loadPayuCredentials(tenantId: string, opts: { requireEnabled?: boolean } = {}): Promise<PayuCredentials | null> {
  const it = (opts.requireEnabled ?? true) ? await activeIntegration(tenantId, "payu") : await loadIntegration(tenantId, "payu");
  if (!it?.public.merchant_key || !it.secrets.merchant_salt) return null;
  return { merchantKey: it.public.merchant_key, salt: it.secrets.merchant_salt, environment: it.environment };
}

export type OnlineProviderId = "razorpay" | "cashfree" | "payu" | "manual";

/** Online gateways the shopper can choose from (enabled + connected + allowed by plan). */
export async function onlinePaymentProviders(tenantId: string): Promise<OnlineProviderId[]> {
  const [rz, cf, pu] = await Promise.all([loadRazorpayCredentials(tenantId), loadCashfreeCredentials(tenantId), loadPayuCredentials(tenantId)]);
  const list: OnlineProviderId[] = [...(rz ? ["razorpay" as const] : []), ...(cf ? ["cashfree" as const] : []), ...(pu ? ["payu" as const] : [])];
  if (!list.length && isManualProviderEnabled()) list.push("manual");
  return list;
}

/** Which provider handles "Pay online" for this tenant, if any. The manual test provider never runs in production. */
export async function onlinePaymentProvider(tenantId: string): Promise<OnlineProviderId | null> {
  return (await onlinePaymentProviders(tenantId))[0] ?? null;
}

export function isManualProviderEnabled(): boolean {
  return serverEnv().NODE_ENV !== "production" && process.env.NODE_ENV !== "production";
}
