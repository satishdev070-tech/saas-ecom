import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { getStoreCustomer } from "@/features/customer-account/session";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { StoreSignUp } from "@/features/customer-account/components/forms";
import { storeGoogleSignInAction } from "@/features/customer-account/actions";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleAuthEnabled } from "@/features/auth/google";

import { StoreAuthSplit, heroImageOf } from "@/features/customer-account/components/store-auth-split";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function StoreRegister({ params, searchParams }: PageProps<"/store/[host]/account/register">) {
  const { host } = await params;
  const sp = await searchParams;
  const next = safeRedirectPath(typeof sp.next === "string" ? sp.next : null, "/account");
  const { sf } = await getRenderContext(host);
  if (await getStoreCustomer(sf.tenant.tenantId)) redirect(next);
  const google = await googleAuthEnabled();
  return (
    <StoreAuthSplit image={heroImageOf(sf.theme)} storeName={sf.store.name} heading={`Join ${sf.store.name}`} text="An account makes every order easier." showBenefits>
      <div className="mb-6 space-y-1.5">
        <h1 className="sf-heading text-3xl">Create account</h1>
        <p className="sf-muted text-sm">It takes less than a minute.</p>
      </div>
      {google ? (
        <>
          <GoogleButton action={storeGoogleSignInAction} next={next} label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}
      <StoreSignUp next={next} />
    </StoreAuthSplit>
  );
}
