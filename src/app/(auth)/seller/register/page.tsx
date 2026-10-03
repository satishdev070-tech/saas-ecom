import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/features/auth/forms";
import { googleSignInAction } from "@/features/auth/actions";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleSignInAvailable } from "@/features/auth/google";
import { getSessionUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/landing";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { MerchantAside } from "@/components/auth/auth-asides";
import { findTheme, isThemeKey } from "@/features/marketing-site/themes";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { findPlan, maxTrialDays } from "@/features/marketing-site/plans";
import { cleanPlanCode } from "@/features/onboarding/steps";

export const metadata: Metadata = { title: "Create your store", robots: { index: false, follow: false } };

export default async function SellerRegisterPage({ searchParams }: PageProps<"/seller/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeRedirectPath(sp.next, "") : "";
  const theme = typeof sp.theme === "string" && isThemeKey(sp.theme) ? sp.theme : null;
  const plans = await getMarketingPlans();
  const plan = findPlan(plans, cleanPlanCode(sp.plan))?.code ?? null;
  const qs = new URLSearchParams();
  if (plan) qs.set("plan", plan);
  if (theme) qs.set("theme", theme);
  const onboarding = qs.size ? `/onboarding?${qs}` : "/onboarding";

  // Already signed in: continue setup (or the dashboard) instead of creating a second account.
  const user = await getSessionUser();
  if (user) {
    const landing = await landingPathFor(user.id);
    redirect(next || (landing === "/onboarding" ? onboarding : landing));
  }

  const google = await googleSignInAvailable("sellers");
  const trial = maxTrialDays(plans);
  const themeName = theme ? findTheme(theme)?.name : null;
  const planName = plan ? findPlan(plans, plan)?.name : null;
  return (
    <AuthSplit variant="merchant" aside={<MerchantAside mode="register" />}>
      <AuthHeading
        eyebrow="Step 1 of 5 · Account"
        title="Create your store"
        description={trial > 0 ? `Start with a ${trial}-day free trial. No card details needed.` : "No card details needed."}
      />
      {themeName || planName ? (
        <p className="-mt-4 mb-6 flex flex-wrap gap-2 text-caption" aria-label="Your selections">
          {themeName ? <span className="rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-accent">Theme: {themeName}</span> : null}
          {planName ? <span className="rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-accent">Plan: {planName}</span> : null}
        </p>
      ) : null}
      {google ? (
        <>
          <GoogleButton action={googleSignInAction} next={next || onboarding} label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}
      <SignUpForm next={next || undefined} plan={plan} theme={theme} />
    </AuthSplit>
  );
}
