import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/forms";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { MerchantAside } from "@/components/auth/auth-asides";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthSplit variant="merchant" aside={<MerchantAside mode="login" />} back={{ href: "/seller/login", label: "Back to sign in" }}>
      <AuthHeading eyebrow="Account recovery" title="Reset your password" description="Enter the email you use for your store and we'll send you a reset link." />
      <ForgotPasswordForm />
    </AuthSplit>
  );
}
