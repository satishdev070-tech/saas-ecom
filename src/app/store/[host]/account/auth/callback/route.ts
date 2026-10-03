import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { findStoreTenant } from "@/features/cart/context";
import { ensureStoreCustomer } from "@/features/customer-account/session";

const OTP_TYPES: EmailOtpType[] = ["signup", "magiclink", "recovery", "email_change", "email"];

/**
 * Shopper email confirmation / magic-link landing on the store host.
 * Accepts both PKCE (`?code=`) and token-hash (`?token_hash=&type=`) links.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(url.searchParams.get("next"), type === "recovery" ? "/account/reset-password" : "/account");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");

  const supabase = await createSupabaseServerClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  if (ok) {
    const tenant = await findStoreTenant();
    if (tenant) await ensureStoreCustomer(tenant.tenantId);
    return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/account/login?error=link", origin));
}
