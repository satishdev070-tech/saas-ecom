"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { WhatsAppOptInField } from "@/features/notifications/whatsapp/components/opt-in-field";
import Link from "next/link";
import { placeOrderAction, quoteCheckoutAction } from "@/features/checkout/actions";
import { track } from "@/features/tracking/client";
import type { AnalyticsItem } from "@/features/tracking/items";
import type { CheckoutSummary } from "@/features/checkout/summary";
import { INDIAN_STATES } from "@/features/customer-account/address";
import { formatMoney } from "@/lib/money";
import { OrderSummary } from "./order-summary";

type Prefill = { email: string; phone: string; name: string; line1: string; line2: string; landmark: string; city: string; state: string; postalCode: string; acceptsMarketing: boolean };

function Field({ label, name, errors, className = "", ...rest }: { label: string; name: string; errors?: Record<string, string[]>; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const err = errors?.[name]?.[0];
  return (
    <div className={className}>
      <label htmlFor={`co-${name}`} className="mb-1 block text-sm">
        {label}
      </label>
      <input id={`co-${name}`} name={name} aria-invalid={err ? true : undefined} aria-describedby={err ? `co-${name}-err` : undefined} className="sf-input w-full" {...rest} />
      {err ? (
        <p id={`co-${name}-err`} className="mt-1 text-xs text-[var(--sf-sale)]">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function CheckoutForm({ initial, prefill, codOffered, onlineOffered, signedIn, items = [], whatsappOptInStoreName = null }: { initial: CheckoutSummary; prefill: Prefill; codOffered: boolean; onlineOffered: boolean; signedIn: boolean; items?: AnalyticsItem[]; whatsappOptInStoreName?: string | null }) {
  const [summary, setSummary] = useState(initial);
  const [pin, setPin] = useState(prefill.postalCode);
  const [rateId, setRateId] = useState<string | undefined>(initial.shipping.selectedId ?? undefined);
  const [method, setMethod] = useState<"cod" | "online">(onlineOffered ? "online" : "cod");
  const [quoting, startQuote] = useTransition();
  const [state, action, placing] = useActionState(placeOrderAction, null);
  const idempotencyKey = useMemo(() => crypto.randomUUID().replaceAll("-", ""), []);
  const errors = state && !state.ok ? (state.error.fieldErrors ?? {}) : {};

  function requote(next: { postalCode?: string; shippingRateId?: string; paymentMethod?: "cod" | "online" }) {
    const input = { postalCode: pin, shippingRateId: rateId, paymentMethod: method, ...next };
    if (input.postalCode && !/^[1-9][0-9]{5}$/.test(input.postalCode)) return;
    startQuote(async () => {
      const r = await quoteCheckoutAction(input);
      if (r.ok) {
        setSummary(r.data);
        if (r.data.shipping.selectedId) setRateId(r.data.shipping.selectedId);
        if (!r.data.cod.available && input.paymentMethod === "cod" && onlineOffered) setMethod("online");
      }
    });
  }

  const blocked = summary.issues.length > 0 || (summary.shipping.pincodeChecked && !summary.shipping.serviceable);

  return (
    <form
      action={action}
      onSubmit={() => {
        const value = summary.grandTotal / 100;
        const tier = summary.shipping.rates.find((r) => r.id === rateId)?.name;
        track("add_shipping_info", { value, items, ...(tier ? { shipping_tier: tier } : {}) });
        track("add_payment_info", { value, items, payment_type: method === "cod" ? "Cash on delivery" : "Online" });
      }}
      className="grid gap-10 @[64rem]:grid-cols-[1fr_380px]"
      noValidate
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="expectedTotal" value={summary.grandTotal} />
      <div className="space-y-8">
        {state && !state.ok ? (
          <p role="alert" className="rounded border border-[var(--sf-sale)] p-3 text-sm text-[var(--sf-sale)]">
            {errors._form?.[0] ?? state.error.message}{" "}
            {state.error.code === "CONFLICT" ? (
              <Link href="/cart" className="underline">
                Review your bag
              </Link>
            ) : null}
          </p>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="sf-heading mb-2 text-2xl">Contact</legend>
          {!signedIn ? (
            <p className="sf-muted text-sm">
              Have an account?{" "}
              <Link href="/account/login?next=/checkout" className="sf-link">
                Sign in
              </Link>{" "}
              for faster checkout.
            </p>
          ) : null}
          <div className="grid gap-4 @[40rem]:grid-cols-2">
            <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={prefill.email} errors={errors} />
            <Field label="Mobile number" name="contactPhone" type="tel" autoComplete="tel" inputMode="tel" required defaultValue={prefill.phone} errors={errors} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="acceptsMarketing" value="true" defaultChecked={prefill.acceptsMarketing} /> Email me about new arrivals and offers
          </label>
          {whatsappOptInStoreName ? <WhatsAppOptInField storeName={whatsappOptInStoreName} /> : null}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="sf-heading mb-2 text-2xl">Delivery address</legend>
          <div className="grid gap-4 @[40rem]:grid-cols-2">
            <Field label="Full name" name="name" autoComplete="name" required defaultValue={prefill.name} errors={errors} className="@[40rem]:col-span-2" />
            <Field label="Phone for delivery" name="phone" type="tel" autoComplete="tel" required defaultValue={prefill.phone} errors={errors} />
            <Field
              label="PIN code"
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(v);
                if (v.length === 6) requote({ postalCode: v });
              }}
              errors={errors}
            />
            <Field label="Flat, house no., building" name="line1" autoComplete="address-line1" required defaultValue={prefill.line1} errors={errors} className="@[40rem]:col-span-2" />
            <Field label="Area, street, village" name="line2" autoComplete="address-line2" defaultValue={prefill.line2} errors={errors} className="@[40rem]:col-span-2" />
            <Field label="Landmark" name="landmark" defaultValue={prefill.landmark} errors={errors} />
            <Field label="City" name="city" autoComplete="address-level2" required defaultValue={prefill.city} errors={errors} />
            <div>
              <label htmlFor="co-state" className="mb-1 block text-sm">
                State
              </label>
              <select id="co-state" name="state" required defaultValue={prefill.state} className="sf-input w-full" autoComplete="address-level1">
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {errors.state ? <p className="mt-1 text-xs text-[var(--sf-sale)]">{errors.state[0]}</p> : null}
            </div>
          </div>
          {signedIn ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveAddress" value="true" /> Save this address to my account
            </label>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3" aria-busy={quoting}>
          <legend className="sf-heading mb-2 text-2xl">Shipping</legend>
          {!summary.shipping.pincodeChecked ? (
            <p className="sf-muted text-sm">Enter your PIN code to see delivery options.</p>
          ) : !summary.shipping.serviceable ? (
            <p role="alert" className="text-sm text-[var(--sf-sale)]">
              Sorry, we don&apos;t deliver to this PIN code yet.
            </p>
          ) : (
            summary.shipping.rates.map((r) => (
              <label key={r.id} className="sf-border flex cursor-pointer items-center justify-between gap-3 rounded border p-3 text-sm has-[:checked]:border-[var(--sf-primary)]">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shippingRateId"
                    value={r.id}
                    checked={rateId === r.id}
                    onChange={() => {
                      setRateId(r.id);
                      requote({ shippingRateId: r.id });
                    }}
                  />
                  {r.name} <span className="sf-muted">· {r.daysMin}–{r.daysMax} days</span>
                </span>
                <span className="tabular-nums">{r.price === 0 ? "Free" : formatMoney(r.price)}</span>
              </label>
            ))
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="sf-heading mb-2 text-2xl">Payment</legend>
          {onlineOffered ? (
            <label className="sf-border flex cursor-pointer items-center gap-2 rounded border p-3 text-sm has-[:checked]:border-[var(--sf-primary)]">
              <input type="radio" name="paymentMethod" value="online" checked={method === "online"} onChange={() => { setMethod("online"); requote({ paymentMethod: "online" }); }} />
              Pay online <span className="sf-muted">· UPI, cards, net banking, wallets</span>
            </label>
          ) : null}
          {codOffered ? (
            <label className={`sf-border flex items-center gap-2 rounded border p-3 text-sm has-[:checked]:border-[var(--sf-primary)] ${summary.cod.available ? "cursor-pointer" : "opacity-50"}`}>
              <input type="radio" name="paymentMethod" value="cod" disabled={!summary.cod.available} checked={method === "cod"} onChange={() => { setMethod("cod"); requote({ paymentMethod: "cod" }); }} />
              Cash on delivery
              {summary.cod.fee > 0 ? <span className="sf-muted">· {formatMoney(summary.cod.fee)} fee</span> : null}
              {!summary.cod.available && summary.cod.reason ? <span className="sf-muted">· {summary.cod.reason}</span> : null}
            </label>
          ) : null}
          {!onlineOffered && !codOffered ? <p role="alert" className="text-sm">This store isn&apos;t accepting orders right now.</p> : null}
          {errors.paymentMethod ? <p className="text-xs text-[var(--sf-sale)]">{errors.paymentMethod[0]}</p> : null}
        </fieldset>

        <div>
          <label htmlFor="co-note" className="mb-1 block text-sm">
            Order note <span className="sf-muted">(optional)</span>
          </label>
          <textarea id="co-note" name="note" maxLength={500} rows={2} className="sf-input w-full" />
        </div>
      </div>

      <aside className="sf-surface sf-border h-fit space-y-5 rounded-[var(--sf-radius-card)] border p-5 @[64rem]:sticky @[64rem]:top-24">
        <h2 className="sf-heading text-xl">Order summary</h2>
        <OrderSummary summary={summary} />
        {summary.issues.length ? (
          <p role="alert" className="text-sm text-[var(--sf-sale)]">
            Some items are unavailable. <Link href="/cart" className="underline">Update your bag</Link>
          </p>
        ) : null}
        <button type="submit" disabled={placing || quoting || blocked || (!onlineOffered && !codOffered)} className="sf-btn w-full">
          {placing ? "Placing order…" : method === "online" ? `Pay ${formatMoney(summary.grandTotal)}` : `Place order · ${formatMoney(summary.grandTotal)}`}
        </button>
        <p className="sf-muted text-xs">By placing your order you agree to the store&apos;s policies. Prices include GST where applicable.</p>
      </aside>
    </form>
  );
}
