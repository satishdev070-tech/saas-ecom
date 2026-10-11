import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/http/safe-redirect";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Email confirmation, magic links and password recovery on the platform host. Accepts PKCE
 * (`?code=`) and token-hash (`?token_hash=&type=`) links; the latter are what our Send Email hook
 * (Resend) produces, and they work in any browser, not only the one that started the flow.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(url.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/dashboard");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createSupabaseServerClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type && OTP_TYPES.includes(type)) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (ok) return NextResponse.redirect(new URL(next, url.origin));
  return NextResponse.redirect(new URL("/seller/login?error=link", url.origin));
}
