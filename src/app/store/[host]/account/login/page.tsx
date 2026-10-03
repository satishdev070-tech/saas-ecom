import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { getStoreCustomer } from "@/features/customer-account/session";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { StoreSignIn } from "@/features/customer-account/components/forms";
import { storeGoogleSignInAction } from "@/features/customer-account/actions";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleSignInAvailable } from "@/features/auth/google";

import { StoreAuthSplit, heroImageOf } from "@/features/customer-account/components/store-auth-split";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function StoreLogin({ params, searchParams }: PageProps<"/store/[host]/account/login">) {
  const { host } = await params;
  const sp = await searchParams;
  const next = safeRedirectPath(typeof sp.next === "string" ? sp.next : null, "/account");
  const { sf } = await getRenderContext(host);
  if (await getStoreCustomer(sf.tenant.tenantId)) redirect(next);
  const google = await googleSignInAvailable("shoppers");
  return (
    <StoreAuthSplit image={heroImageOf(sf.theme)} storeName={sf.store.name} heading="Welcome back" text="Sign in to track orders, see your wishlist and check out faster.">
      <div className="mb-6 space-y-1.5">
        <h1 className="sf-heading text-3xl">Sign in</h1>
        <p className="sf-muted text-sm">to your {sf.store.name} account</p>
      </div>
      {sp.verify ? <p className="mb-4 text-sm">Please confirm your email address to continue.</p> : null}
      {sp.checkout ? <p className="mb-4 text-sm">Sign in or create an account to check out. It only takes a moment, and you can track your order afterwards.</p> : null}
      {sp.error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--sf-sale)]">
          {sp.error === "google" ? "Google sign-in didn't complete. Please try again or use your email." : "That link is invalid or has expired."}
        </p>
      ) : null}
      {google ? (
        <>
          <GoogleButton action={storeGoogleSignInAction} next={next} label="Continue with Google" />
          <OrDivider />
        </>
      ) : null}
      <StoreSignIn next={next} />
    </StoreAuthSplit>
  );
}
