"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { platformOrigin } from "@/lib/platform/urls";
import { ADMIN_LOGIN_PATH, SELLER_LOGIN_PATH, landingPathFor } from "@/lib/auth/landing";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "./schemas";
import { createStoreFromName } from "@/features/tenants/server/create";
import { setActiveTenant } from "@/lib/tenant/active";

export async function signInAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let next = "/dashboard";
  const result = await runAction("auth.signIn", async () => {
    const input = parseInput(signInSchema, formToObject(fd));
    await rateLimit("login:ip", await clientIpKey(), 20, 600);
    await rateLimit("login:email", input.email, 8, 600);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    // Same message for unknown email and wrong password (no account enumeration).
    if (error) throw new AppError("UNAUTHENTICATED", { message: "Email or password is incorrect.", fieldErrors: { _form: ["Email or password is incorrect."] } });
    // Explicit ?next wins; otherwise land sellers on the dashboard and platform staff on /admin.
    next = input.next ? safeRedirectPath(input.next, "/dashboard") : await landingPathFor(data.user.id);
  });
  if (result.ok) redirect(next);
  return result;
}

export async function signUpAction(_prev: ActionResult<{ needsConfirmation: boolean }> | null, fd: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  let next = "/onboarding";
  let confirmed = false;
  const result = await runAction("auth.signUp", async () => {
    const input = parseInput(signUpSchema, formToObject(fd));
    next = safeRedirectPath(input.next, "/onboarding");
    const onboarding = input.storeName ? `/onboarding?name=${encodeURIComponent(input.storeName)}` : "/onboarding";
    await rateLimit("signup:ip", await clientIpKey(), 10, 3600);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName, store_name: input.storeName ?? null },
        emailRedirectTo: `${platformOrigin()}/auth/callback?next=${encodeURIComponent(input.next ? next : onboarding)}`,
      },
    });
    if (error) {
      throw new AppError("VALIDATION", { fieldErrors: { _form: [error.message.includes("registered") ? "An account with this email already exists." : "Couldn't create your account. Please try again."] } });
    }
    confirmed = Boolean(data.session);
    // Signed in straight away (email confirmation off): create the store now when we can.
    if (data.session && !input.next) {
      const tenantId = input.storeName ? await createStoreFromName(input.storeName) : null;
      if (tenantId) {
        await setActiveTenant(tenantId);
        next = "/dashboard?welcome=1";
      } else {
        next = onboarding;
      }
    }
    return { needsConfirmation: !data.session };
  });
  if (result.ok && confirmed) redirect(next);
  return result;
}

export async function forgotPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("auth.forgotPassword", async () => {
    const input = parseInput(forgotSchema, formToObject(fd));
    await rateLimit("reset:ip", await clientIpKey(), 5, 3600);
    await rateLimit("reset:email", input.email, 3, 3600);
    const supabase = await createSupabaseServerClient();
    // Always report success so the form doesn't reveal which emails have accounts.
    await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: `${platformOrigin()}/auth/callback?next=/reset-password` });
  });
}

export async function resetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("auth.resetPassword", async () => {
    const input = parseInput(resetSchema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw new AppError("UNAUTHENTICATED", { fieldErrors: { _form: ["Your reset link has expired. Request a new one."] } });
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

/** Signs out; the platform console passes `to=admin` so staff return to its own sign-in screen. */
export async function signOutAction(fd?: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(fd?.get("to") === "admin" ? ADMIN_LOGIN_PATH : SELLER_LOGIN_PATH);
}

/**
 * "Continue with Google" for merchants: starts Supabase's OAuth (PKCE) flow and sends the browser
 * to Google. The platform /auth/callback exchanges the code; new accounts continue to onboarding.
 */
export async function googleSignInAction(fd: FormData): Promise<void> {
  const next = safeRedirectPath(typeof fd.get("next") === "string" ? (fd.get("next") as string) : "", "/dashboard");
  await rateLimit("login:ip", await clientIpKey(), 20, 600);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${platformOrigin()}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect(`${SELLER_LOGIN_PATH}?error=google`);
  redirect(data.url);
}
