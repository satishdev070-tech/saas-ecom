import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/forms";
import { requireUser } from "@/lib/auth/session";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { MerchantAside } from "@/components/auth/auth-asides";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in via /auth/callback before landing here.
  await requireUser("/reset-password");
  return (
    <AuthSplit variant="merchant" aside={<MerchantAside mode="login" />}>
      <AuthHeading eyebrow="Account recovery" title="Choose a new password" description="You'll use it the next time you sign in." />
      <ResetPasswordForm />
    </AuthSplit>
  );
}
