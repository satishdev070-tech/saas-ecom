import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { payuCommandHash, payuRequestHash, type PayuHashFields } from "./signature";

/**
 * PayU hosted checkout + merchant postservice APIs (docs.payu.in). The browser POSTs a signed form to
 * PayU; PayU POSTs back to surl/furl; we verify the reverse hash AND re-check with verify_payment.
 */
export type PayuCredentials = { merchantKey: string; salt: string; environment: "test" | "live" };

export const payuPaymentUrl = (env: "test" | "live") => (env === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment");
const postserviceUrl = (env: "test" | "live") => (env === "live" ? "https://info.payu.in/merchant/postservice.php?form=2" : "https://test.payu.in/merchant/postservice.php?form=2");

export function buildPayuForm(creds: PayuCredentials, f: Omit<PayuHashFields, "key"> & { phone: string; surl: string; furl: string }) {
  const fields = { key: creds.merchantKey, txnid: f.txnid, amount: f.amount, productinfo: f.productinfo, firstname: f.firstname, email: f.email, udf1: f.udf1 ?? "", udf2: f.udf2 ?? "", udf3: f.udf3 ?? "", udf4: f.udf4 ?? "", udf5: f.udf5 ?? "" };
  return {
    action: payuPaymentUrl(creds.environment),
    fields: { ...fields, phone: f.phone.replace(/\D/g, "").slice(-10), surl: f.surl, furl: f.furl, hash: payuRequestHash(fields, creds.salt) },
  };
}

async function command<T>(creds: PayuCredentials, commandName: string, var1: string, extra: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams({ key: creds.merchantKey, command: commandName, var1, hash: payuCommandHash(creds.merchantKey, commandName, var1, creds.salt), ...extra });
  const res = await fetch(postserviceUrl(creds.environment), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new AppError("INTERNAL", { message: "PayU is unreachable.", context: { commandName, error: err instanceof Error ? err.message : String(err) } });
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    logger.warn("payu.non_json_response", { commandName, status: res.status, body: text.slice(0, 120) });
    throw new AppError("INTERNAL", { message: "PayU returned an unexpected response.", context: { commandName, status: res.status } });
  }
}

export type PayuTransaction = { mihpayid?: string; status?: string; amt?: string; txnid?: string; mode?: string; error_Message?: string };

/** verify_payment: authoritative status for a txnid ("success" | "failure" | "pending" | "Not Found"). */
export async function verifyPayuTransaction(creds: PayuCredentials, txnid: string): Promise<PayuTransaction | null> {
  const r = await command<{ status?: number; msg?: string; transaction_details?: Record<string, PayuTransaction> }>(creds, "verify_payment", txnid);
  return r.transaction_details?.[txnid] ?? null;
}

export async function refundPayu(creds: PayuCredentials, mihpayid: string, refundToken: string, amountRupees: number) {
  const r = await command<{ status?: number; msg?: string; request_id?: string; error_code?: number }>(creds, "cancel_refund_transaction", mihpayid, { var2: refundToken, var3: amountRupees.toFixed(2) });
  if (r.status !== 1) throw new AppError("CONFLICT", { message: "PayU could not process this refund.", context: { msg: String(r.msg ?? "").slice(0, 120) } });
  return r;
}

/** Credentials check: verify_payment for a random txnid succeeds (with "Not Found") only for a valid key+salt. */
export async function testPayu(creds: PayuCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await command<{ status?: number; msg?: string }>(creds, "verify_payment", `test${Date.now()}`);
    const msg = String(r.msg ?? "").toLowerCase();
    if (msg.includes("invalid") || msg.includes("hash") || msg.includes("key")) return { ok: false, message: "Invalid credentials: check the Merchant Key, Salt and environment." };
    return { ok: true, message: `Connected to PayU ${creds.environment === "live" ? "production" : "test"} environment.` };
  } catch {
    return { ok: false, message: "Network error: PayU could not be reached." };
  }
}
