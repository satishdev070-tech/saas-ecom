import { NextResponse, type NextRequest } from "next/server";
import { resolveStorefrontTenant } from "@/lib/tenant/resolve";
import { handlePayuCallback } from "@/features/payments/gateways";

/**
 * PayU surl/furl: PayU's page POSTs the transaction result here. The reverse hash is verified with
 * the store's salt and the status is re-checked with PayU's verify_payment API before marking paid.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/store/[host]/checkout/pay/payu">) {
  const tenant = await resolveStorefrontTenant((await params).host);
  const origin = `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!tenant || !token) return NextResponse.redirect(new URL("/", origin), 303);
  const form = await request.formData().catch(() => null);
  const fields: Record<string, string> = {};
  for (const [k, v] of form?.entries() ?? []) if (typeof v === "string" && k.length <= 40) fields[k] = v.slice(0, 500);
  const next = await handlePayuCallback(tenant.tenantId, token, fields).catch(() => "/");
  return NextResponse.redirect(new URL(next, origin), 303);
}
