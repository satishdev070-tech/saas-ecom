import "server-only";
import { testRazorpay } from "@/features/payments/razorpay";
import { testCashfree } from "@/features/payments/cashfree";
import { testPayu } from "@/features/payments/payu";
import { testShiprocket } from "@/features/shipping/shiprocket";
import { testDelhivery } from "@/features/shipping/delhivery";
import { PROVIDERS, type ProviderId } from "../registry";
import type { LoadedIntegration } from "./store";

export type TestResult = { ok: boolean; message: string };

/**
 * Live credential check against the provider's own API (read-only calls; never moves money).
 * Messages are written here and never echo provider responses or secrets.
 */
export async function testProvider(it: LoadedIntegration): Promise<TestResult> {
  const p = it.public;
  const s = it.secrets;
  const missing = PROVIDERS[it.provider].fields.filter((f) => f.required && !(f.secret ? s[f.key] : p[f.key]));
  if (missing.length) return { ok: false, message: `Missing: ${missing.map((f) => f.label).join(", ")}.` };
  switch (it.provider as ProviderId) {
    case "razorpay":
      return testRazorpay({ keyId: p.key_id!, keySecret: s.key_secret!, webhookSecret: s.webhook_secret ?? null, mode: p.key_id!.startsWith("rzp_live_") ? "live" : "test" });
    case "cashfree":
      return testCashfree({ appId: p.app_id!, secretKey: s.secret_key!, environment: it.environment });
    case "payu":
      return testPayu({ merchantKey: p.merchant_key!, salt: s.merchant_salt!, environment: it.environment });
    case "shiprocket":
      return testShiprocket({ email: p.email!, password: s.password! });
    case "delhivery":
      return testDelhivery({ apiToken: s.api_token!, environment: it.environment });
    case "ga4":
    case "google_ads":
    case "meta_pixel":
      // Browser tags have no server-side credential to verify; a valid ID format is all we can check.
      return { ok: true, message: "ID saved. Verify events in the provider's real-time / test events view." };
    default:
      return { ok: false, message: "Connect this account with the Connect button." };
  }
}
