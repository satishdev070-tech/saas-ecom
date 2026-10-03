"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { completeTestPaymentAction, confirmRazorpayPaymentAction, startGatewayPaymentAction } from "@/features/checkout/actions";
import { formatMoney } from "@/lib/money";

type RazorpayOptions = Record<string, unknown> & { handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void };
declare global {
  interface Window {
    Razorpay?: new (o: RazorpayOptions) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type CashfreeSdk = { checkout: (o: { paymentSessionId: string; redirectTarget: "_self" }) => Promise<unknown> };
declare global {
  interface Window {
    Cashfree?: (o: { mode: "sandbox" | "production" }) => CashfreeSdk;
  }
}

function loadExternal(src: string, ready: () => boolean): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(ready());
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Gateway choice + hand-off. The server starts the session (startGatewayPaymentAction); the browser
 * only opens the provider's checkout. Success is always confirmed server-side (signature, provider API
 * or webhook), never by this component.
 */
export function GatewayPicker({
  token,
  gateways,
  amountMinor,
  storeName,
  orderNumber,
  prefill,
  lastError,
}: {
  token: string;
  gateways: { id: "razorpay" | "cashfree" | "payu"; label: string; description: string }[];
  amountMinor: number;
  storeName: string;
  orderNumber: string;
  prefill: { name?: string | null; email?: string | null; contact?: string | null };
  lastError: string | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(gateways[0]!.id);
  const [status, setStatus] = useState<"idle" | "loading" | "verifying" | "redirecting">("idle");
  const [message, setMessage] = useState<string | null>(lastError);

  async function pay() {
    setStatus("loading");
    setMessage(null);
    const start = await startGatewayPaymentAction({ t: token, provider: choice });
    if (!start.ok) {
      setStatus("idle");
      setMessage(start.error.message);
      return;
    }
    const g = start.data;
    if (g.kind === "payu") {
      // PayU hosted checkout: POST the server-signed form to PayU.
      setStatus("redirecting");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = g.action;
      for (const [k, v] of Object.entries(g.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      return;
    }
    if (g.kind === "cashfree") {
      if (!(await loadExternal("https://sdk.cashfree.com/js/v3/cashfree.js", () => Boolean(window.Cashfree))) || !window.Cashfree) {
        setStatus("idle");
        setMessage("Couldn't load Cashfree. Check your connection and try again.");
        return;
      }
      setStatus("redirecting");
      await window.Cashfree({ mode: g.mode }).checkout({ paymentSessionId: g.paymentSessionId, redirectTarget: "_self" });
      return;
    }
    if (!(await loadExternal(SCRIPT, () => Boolean(window.Razorpay))) || !window.Razorpay) {
      setStatus("idle");
      setMessage("Couldn't load the payment window. Check your connection and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: g.keyId,
      order_id: g.providerOrderId,
      amount: amountMinor,
      currency: "INR",
      name: storeName,
      description: `Order ${orderNumber}`,
      prefill: { name: prefill.name ?? undefined, email: prefill.email ?? undefined, contact: prefill.contact ?? undefined },
      modal: { ondismiss: () => setStatus("idle") },
      handler: async (r) => {
        setStatus("verifying");
        const res = await confirmRazorpayPaymentAction({ t: token, ...r });
        if (res.ok) router.replace(res.data.redirectTo);
        else {
          setStatus("idle");
          setMessage(res.error.message);
        }
      },
    });
    rzp.on("payment.failed", (r) => {
      setStatus("idle");
      setMessage(r.error?.description ?? "Payment failed. You can try again.");
    });
    rzp.open();
    setStatus("idle");
  }

  const busy = status !== "idle";
  return (
    <div className="space-y-4 text-left">
      {gateways.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Choose how to pay</legend>
          {gateways.map((g) => (
            <label key={g.id} className={`flex cursor-pointer items-center gap-3 rounded-[var(--sf-radius-card)] border p-4 ${choice === g.id ? "border-[var(--sf-text)]" : "sf-border"}`}>
              <input type="radio" name="gateway" value={g.id} checked={choice === g.id} onChange={() => setChoice(g.id)} className="accent-[var(--sf-primary)]" />
              <span>
                <span className="block text-sm font-medium">{g.label}</span>
                <span className="sf-muted block text-xs">{g.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="sf-muted text-center text-sm">
          Secure payment with {gateways[0]!.label}: {gateways[0]!.description}.
        </p>
      )}
      <button type="button" onClick={() => void pay()} disabled={busy} className="sf-btn w-full">
        {status === "verifying" ? "Confirming payment…" : status === "redirecting" ? "Redirecting to payment…" : status === "loading" ? "Starting payment…" : `Pay ${formatMoney(amountMinor)}`}
      </button>
      {message ? (
        <p role="alert" className="text-center text-sm text-[var(--sf-sale)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Test-mode payment (manual provider) for stores without Razorpay configured. */
export function TestPay({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeTestPaymentAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="t" value={token} />
      <button type="submit" disabled={pending} className="sf-btn w-full">
        {pending ? "Processing…" : "Complete test payment"}
      </button>
      <p className="sf-muted text-xs">Test mode: no real money is charged.</p>
      {state && !state.ok ? <p role="alert" className="text-sm text-[var(--sf-sale)]">{state.error.message}</p> : null}
    </form>
  );
}
