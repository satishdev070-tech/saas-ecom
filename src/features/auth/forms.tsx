"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "./actions";

const forgotLink = (
  <Link href="/seller/forgot-password" className="text-small font-medium text-accent hover:underline">
    Forgot password?
  </Link>
);

/** `variant="admin"` is the platform console: no self-serve sign-up link. */
export function SignInForm({ next, variant = "seller" }: { next?: string; variant?: "seller" | "admin" }) {
  const [state, action] = useActionState(signInAction, null);
  const errors = fieldErrors(state);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <TextField label={variant === "admin" ? "Work email" : "Email"} name="email" type="email" autoComplete="email" placeholder="you@company.com" required errors={errors.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required errors={errors.password} labelAside={forgotLink} />
      <SubmitButton size="lg" variant={variant === "admin" ? "accent" : "primary"} className="w-full">
        Sign in
      </SubmitButton>
      {variant === "seller" ? (
        <p className="text-center text-small text-muted">
          New to the platform?{" "}
          <Link href={next ? `/seller/register?next=${encodeURIComponent(next)}` : "/seller/register"} className="font-medium text-foreground underline-offset-2 hover:underline">
            Create a merchant account
          </Link>
        </p>
      ) : null}
    </form>
  );
}

export function SignUpForm({ next, defaultStoreName, plan, theme }: { next?: string; defaultStoreName?: string; plan?: string | null; theme?: string | null }) {
  const [state, action] = useActionState(signUpAction, null);
  const errors = fieldErrors(state);
  if (state?.ok && state.data.needsConfirmation) {
    return (
      <div role="status" className="space-y-3 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-success/10 text-success">
          <MailCheck aria-hidden className="size-5" />
        </span>
        <h2 className="text-h2">Check your email</h2>
        <p className="text-body text-muted">We sent a confirmation link to your email. Open it on this device to continue setting up your store; your choices are saved.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}
      {theme ? <input type="hidden" name="theme" value={theme} /> : null}
      <FormMessage state={state} />
      <TextField label="Full name" name="displayName" autoComplete="name" placeholder="Asha Mehta" required errors={errors.displayName} />
      <TextField label="Email" name="email" type="email" autoComplete="email" placeholder="you@yourbusiness.in" required errors={errors.email} />
      <PasswordField label="Password" name="password" autoComplete="new-password" required errors={errors.password} hint="At least 10 characters with a letter and a number." />
      <TextField label="Business name" name="storeName" autoComplete="organization" placeholder="e.g. Asha Crafts" defaultValue={defaultStoreName} required errors={errors.storeName} hint="You'll confirm your store details in the next step." />
      <SubmitButton size="lg" className="w-full">
        Create account
      </SubmitButton>
      <p className="text-caption text-muted">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="border-t border-border pt-5 text-center text-small text-muted">
        Already selling with us?{" "}
        <Link href="/seller/login" className="font-medium text-foreground underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  const errors = fieldErrors(state);
  if (state?.ok) {
    return (
      <div role="status" className="space-y-3 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-success/10 text-success">
          <MailCheck aria-hidden className="size-5" />
        </span>
        <h2 className="text-h2">Check your inbox</h2>
        <p className="text-body text-muted">If an account exists for that email, a reset link is on its way. It expires in one hour.</p>
        <Link href="/seller/login" className="inline-block pt-2 text-small font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required errors={errors.email} />
      <SubmitButton size="lg" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, null);
  const errors = fieldErrors(state);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} success={<><CheckCircle2 aria-hidden className="mr-1 inline size-4" /> Password updated.</>} />
      <PasswordField label="New password" name="password" autoComplete="new-password" required errors={errors.password} hint="At least 10 characters with a letter and a number." />
      <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" required errors={errors.confirm} />
      <SubmitButton size="lg" className="w-full">
        Update password
      </SubmitButton>
    </form>
  );
}
