import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { StoreResetPassword } from "@/features/customer-account/components/forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Reached from the recovery email (the callback has already signed the shopper in on this store). */
export default async function StoreResetPasswordPage() {
  if (!(await getSessionUser())) redirect("/account/forgot-password");
  return (
    <div className="sf-container sf-section mx-auto max-w-md space-y-6">
      <h1 className="sf-heading text-center text-4xl">Choose a new password</h1>
      <StoreResetPassword />
    </div>
  );
}
