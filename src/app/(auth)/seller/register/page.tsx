import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/forms";
import { googleSignInAction } from "@/features/auth/actions";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleAuthEnabled } from "@/features/auth/google";

import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { MerchantAside } from "@/components/auth/auth-asides";

export const metadata: Metadata = { title: "Create your merchant account", robots: { index: false } };

export default async function SellerRegisterPage({ searchParams }: PageProps<"/seller/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeRedirectPath(sp.next, "") : "";
  const google = await googleAuthEnabled();
  return (
    <AuthSplit variant="merchant" aside={<MerchantAside mode="register" />}>
      <AuthHeading eyebrow="Merchant registration" title="Start selling online" description="Create your account and store in under two minutes. 14-day free trial, no card needed." />
      {google ? (
        <>
          <GoogleButton action={googleSignInAction} next={next || "/onboarding"} label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}
      <SignUpForm next={next || undefined} />
    </AuthSplit>
  );
}
