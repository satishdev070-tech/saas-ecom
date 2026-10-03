import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { loadPayPage } from "@/features/payments/checkout";
import { formatMoney } from "@/lib/money";
import { GatewayPicker, TestPay } from "@/features/checkout/components/pay-client";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

export default async function PayPage({ params, searchParams }: PageProps<"/store/[host]/checkout/pay">) {
  const { host } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const { sf } = await getRenderContext(host);
  const page = token ? await loadPayPage(sf.tenant.tenantId, sf.store.name, token) : null;
  if (!page) notFound();
  if (page.state === "paid") redirect(page.redirectTo);
  return (
    <div className="sf-container sf-section mx-auto max-w-md space-y-6 text-center">
      <h1 className="sf-heading text-3xl">Complete your payment</h1>
      <p className="sf-muted text-sm">
        Order {page.order.number} · {formatMoney(page.order.grandTotal)}
      </p>
      {sp.error ? (
        <p role="alert" className="text-sm text-[var(--sf-sale)]">
          {sp.error === "payment_failed" ? "The payment didn't go through. No money was taken, or it will be refunded automatically. Please try again." : "We couldn't verify that payment. If money was debited, it will be confirmed automatically or refunded."}
        </p>
      ) : null}
      {page.state === "choose" ? (
        <GatewayPicker
          token={token}
          gateways={page.gateways}
          amountMinor={page.order.grandTotal}
          storeName={page.storeName}
          orderNumber={page.order.number}
          prefill={{ name: page.order.name, email: page.order.email, contact: page.order.phone }}
          lastError={page.lastError}
        />
      ) : page.state === "manual" ? (
        <TestPay token={token} />
      ) : page.state === "expired" ? (
        <div className="space-y-3">
          <p>This payment link has expired and the order was released.</p>
          <Link href="/cart" className="sf-btn">
            Return to bag
          </Link>
        </div>
      ) : (
        <p role="alert">{page.message}</p>
      )}
      {"expiresAt" in page && page.expiresAt ? (
        <p className="sf-muted text-xs">Items are held until {new Date(page.expiresAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}.</p>
      ) : null}
    </div>
  );
}
