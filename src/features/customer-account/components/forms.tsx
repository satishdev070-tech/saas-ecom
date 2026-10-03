"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import {
  cancelMyOrderAction,
  requestOtpAction,
  requestReturnAction,
  saveAddressAction,
  storeForgotPasswordAction,
  storeResetPasswordAction,
  storeSignInAction,
  storeSignUpAction,
  updateProfileAction,
  verifyOtpAction,
} from "@/features/customer-account/actions";
import { INDIAN_STATES } from "@/features/customer-account/address";
import { RETURN_REASONS } from "@/features/customer-account/schemas";
import type { ActionResult } from "@/lib/actions/result";

function errs(state: ActionResult<unknown> | null) {
  return state && !state.ok ? (state.error.fieldErrors ?? {}) : {};
}

function Input({ label, name, errors, type, ...rest }: { label: string; name: string; errors: Record<string, string[]> } & React.InputHTMLAttributes<HTMLInputElement>) {
  const e = errors[name]?.[0];
  const [shown, setShown] = useState(false);
  const id = `ca-${name}`;
  const isPassword = type === "password";
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={isPassword && shown ? "text" : type}
          aria-invalid={e ? true : undefined}
          aria-describedby={e ? `${id}-error` : undefined}
          className={`sf-input w-full ${isPassword ? "pr-11" : ""}`}
          {...rest}
        />
        {isPassword ? (
          <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} className="sf-muted absolute inset-y-0 right-0 grid w-11 place-items-center hover:text-[var(--sf-text)]">
            {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        ) : null}
      </div>
      {e ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-[var(--sf-sale)]">
          {e}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ state }: { state: ActionResult<unknown> | null }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="text-sm text-[var(--sf-sale)]">
      {state.error.fieldErrors?._form?.[0] ?? state.error.message}
    </p>
  );
}

export function StoreSignIn({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pw, pwAction, pwPending] = useActionState(storeSignInAction, null);
  const [otp, otpAction, otpPending] = useActionState(requestOtpAction, null);
  const [ver, verAction, verPending] = useActionState(verifyOtpAction, null);
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-4 text-sm">
        <button type="button" role="tab" aria-selected={mode === "password"} onClick={() => setMode("password")} className={mode === "password" ? "font-medium underline underline-offset-4" : "sf-muted"}>
          Password
        </button>
        <button type="button" role="tab" aria-selected={mode === "code"} onClick={() => setMode("code")} className={mode === "code" ? "font-medium underline underline-offset-4" : "sf-muted"}>
          Email me a code
        </button>
      </div>
      {mode === "password" ? (
        <form action={pwAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <FormError state={pw} />
          <Input label="Email" name="email" type="email" autoComplete="email" required errors={errs(pw)} />
          <Input label="Password" name="password" type="password" autoComplete="current-password" required errors={errs(pw)} />
          <p className="-mt-2 text-right text-sm">
            <Link href="/account/forgot-password" className="sf-link-quiet">
              Forgot password?
            </Link>
          </p>
          <button type="submit" disabled={pwPending} className="sf-btn w-full">
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : otp?.ok ? (
        <form action={verAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={otp.data.email} />
          <p className="text-sm">We sent a code to {otp.data.email}.</p>
          <FormError state={ver} />
          <Input label="Code" name="token" inputMode="numeric" autoComplete="one-time-code" required errors={errs(ver)} />
          <button type="submit" disabled={verPending} className="sf-btn w-full">
            Verify and sign in
          </button>
        </form>
      ) : (
        <form action={otpAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <FormError state={otp} />
          <Input label="Email" name="email" type="email" autoComplete="email" required errors={errs(otp)} />
          <button type="submit" disabled={otpPending} className="sf-btn w-full">
            Send code
          </button>
        </form>
      )}
      <p className="text-center text-sm">
        New here?{" "}
        <Link href={`/account/register?next=${encodeURIComponent(next)}`} className="sf-link">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function StoreSignUp({ next }: { next: string }) {
  const [state, action, pending] = useActionState(storeSignUpAction, null);
  if (state?.ok && state.data.needsConfirmation) {
    return (
      <div role="status" className="space-y-2 text-center">
        <p className="sf-heading text-2xl">Check your inbox</p>
        <p className="sf-muted text-sm">We sent a confirmation link. Open it on this device to finish creating your account.</p>
      </div>
    );
  }
  const e = errs(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <div className="grid gap-4 @[30rem]:grid-cols-2">
        <Input label="First name" name="firstName" autoComplete="given-name" required errors={e} />
        <Input label="Last name" name="lastName" autoComplete="family-name" errors={e} />
      </div>
      <Input label="Email" name="email" type="email" autoComplete="email" required errors={e} />
      <Input label="Password" name="password" type="password" autoComplete="new-password" required errors={e} />
      <p className="sf-muted -mt-2 text-xs">At least 10 characters, with a letter and a number.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="acceptsMarketing" value="true" className="accent-[var(--sf-primary)]" /> Send me offers and new arrivals
      </label>
      <button type="submit" disabled={pending} className="sf-btn w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="sf-muted text-xs">
        By creating an account you agree to our{" "}
        <Link href="/pages/privacy" className="underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
      <p className="sf-border border-t pt-4 text-center text-sm">
        Already have an account?{" "}
        <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="sf-link">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ProfileForm({ initial }: { initial: { firstName: string; lastName: string; phone: string; acceptsMarketing: boolean } }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const e = errs(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      {state?.ok ? <p role="status" className="text-sm">Saved.</p> : null}
      <div className="grid gap-4 @[30rem]:grid-cols-2">
        <Input label="First name" name="firstName" defaultValue={initial.firstName} required errors={e} />
        <Input label="Last name" name="lastName" defaultValue={initial.lastName} errors={e} />
      </div>
      <Input label="Mobile number" name="phone" type="tel" defaultValue={initial.phone} errors={e} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="acceptsMarketing" value="true" defaultChecked={initial.acceptsMarketing} /> Email me offers and new arrivals
      </label>
      <button type="submit" disabled={pending} className="sf-btn">
        Save
      </button>
    </form>
  );
}

export type AddressValue = { id?: string; label?: string | null; name: string; phone: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; postalCode: string; isDefault?: boolean };

export function AddressForm({ value, onDoneLabel = "Save address" }: { value?: AddressValue; onDoneLabel?: string }) {
  const [state, action, pending] = useActionState(saveAddressAction, null);
  const e = errs(state);
  return (
    <form action={action} className="grid gap-4 @[40rem]:grid-cols-2" noValidate>
      {value?.id ? <input type="hidden" name="id" value={value.id} /> : null}
      <div className="@[40rem]:col-span-2">
        <FormError state={state} />
        {state?.ok ? <p role="status" className="text-sm">Address saved.</p> : null}
      </div>
      <Input label="Label (e.g. Home)" name="label" defaultValue={value?.label ?? ""} errors={e} />
      <Input label="Full name" name="name" defaultValue={value?.name} required errors={e} />
      <Input label="Phone" name="phone" type="tel" defaultValue={value?.phone} required errors={e} />
      <Input label="PIN code" name="postalCode" inputMode="numeric" maxLength={6} defaultValue={value?.postalCode} required errors={e} />
      <div className="@[40rem]:col-span-2">
        <Input label="Flat, house no., building" name="line1" defaultValue={value?.line1} required errors={e} />
      </div>
      <div className="@[40rem]:col-span-2">
        <Input label="Area, street" name="line2" defaultValue={value?.line2 ?? ""} errors={e} />
      </div>
      <Input label="Landmark" name="landmark" defaultValue={value?.landmark ?? ""} errors={e} />
      <Input label="City" name="city" defaultValue={value?.city} required errors={e} />
      <div>
        <label htmlFor={`st-${value?.id ?? "new"}`} className="mb-1 block text-sm">
          State
        </label>
        <select id={`st-${value?.id ?? "new"}`} name="state" defaultValue={value?.state ?? ""} required className="sf-input w-full">
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 self-end text-sm">
        <input type="checkbox" name="isDefault" value="true" defaultChecked={value?.isDefault} /> Default address
      </label>
      <div className="@[40rem]:col-span-2">
        <button type="submit" disabled={pending} className="sf-btn">
          {onDoneLabel}
        </button>
      </div>
    </form>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(cancelMyOrderAction, null);
  if (state?.ok) return <p role="status" className="text-sm">Your order has been cancelled.</p>;
  return (
    <details>
      <summary className="sf-link cursor-pointer text-sm">Cancel order</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <label htmlFor="cancel-reason" className="block text-sm">
          Reason (optional)
        </label>
        <input id="cancel-reason" name="reason" maxLength={300} className="sf-input w-full" />
        <FormError state={state} />
        <button type="submit" disabled={pending} className="sf-btn sf-btn-outline">
          Confirm cancellation
        </button>
      </form>
    </details>
  );
}

export function ReturnRequestForm({ orderId, items }: { orderId: string; items: { id: string; title: string; variantTitle: string | null; returnable: number }[] }) {
  const [state, action, pending] = useActionState(requestReturnAction, null);
  if (state?.ok) return <p role="status" className="text-sm">Return requested. We&apos;ll email you with next steps.</p>;
  if (!items.some((i) => i.returnable > 0)) return null;
  return (
    <details>
      <summary className="sf-link cursor-pointer text-sm">Request a return</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <ul className="space-y-2">
          {items
            .filter((i) => i.returnable > 0)
            .map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor={`rq-${i.id}`}>
                  {i.title}
                  {i.variantTitle ? ` · ${i.variantTitle}` : ""}
                </label>
                <select id={`rq-${i.id}`} name={`qty_${i.id}`} defaultValue="0" className="sf-input w-20 py-1">
                  {Array.from({ length: i.returnable + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </li>
            ))}
        </ul>
        <label htmlFor="rq-reason" className="block text-sm">
          Reason
        </label>
        <select id="rq-reason" name="reason" required className="sf-input w-full" defaultValue="">
          <option value="" disabled>
            Choose a reason
          </option>
          {Object.entries(RETURN_REASONS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <textarea name="note" maxLength={1000} rows={2} className="sf-input w-full" placeholder="Anything else we should know?" aria-label="Note" />
        <FormError state={state} />
        <button type="submit" disabled={pending} className="sf-btn sf-btn-outline">
          Submit return request
        </button>
      </form>
    </details>
  );
}

export function StoreForgotPassword() {
  const [state, action, pending] = useActionState(storeForgotPasswordAction, null);
  if (state?.ok) {
    return (
      <p role="status" className="text-center text-sm">
        If an account exists for that email, we&apos;ve sent a link to reset your password.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <Input label="Email" name="email" type="email" autoComplete="email" required errors={errs(state)} />
      <button type="submit" disabled={pending} className="sf-btn w-full">
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm">
        <Link href="/account/login" className="sf-link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function StoreResetPassword() {
  const [state, action, pending] = useActionState(storeResetPasswordAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <Input label="New password" name="password" type="password" autoComplete="new-password" required errors={errs(state)} />
      <p className="sf-muted -mt-2 text-xs">At least 10 characters, with a letter and a number.</p>
      <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" required errors={errs(state)} />
      <button type="submit" disabled={pending} className="sf-btn w-full">
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
