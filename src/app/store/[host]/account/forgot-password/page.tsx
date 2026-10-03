import type { Metadata } from "next";
import { getRenderContext } from "@/features/theme/render/load";
import { StoreForgotPassword } from "@/features/customer-account/components/forms";
import { StoreAuthSplit, heroImageOf } from "@/features/customer-account/components/store-auth-split";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default async function StoreForgotPasswordPage({ params }: PageProps<"/store/[host]/account/forgot-password">) {
  const { sf } = await getRenderContext((await params).host);
  return (
    <StoreAuthSplit image={heroImageOf(sf.theme)} storeName={sf.store.name} heading="Locked out?" text="It happens. We'll email you a link to choose a new password.">
      <div className="mb-6 space-y-1.5">
        <h1 className="sf-heading text-3xl">Forgot your password?</h1>
        <p className="sf-muted text-sm">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      <StoreForgotPassword />
    </StoreAuthSplit>
  );
}
