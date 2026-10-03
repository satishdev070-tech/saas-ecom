import { NextResponse, type NextRequest } from "next/server";
import { resolveStorefrontTenant } from "@/lib/tenant/resolve";
import { confirmCashfreeReturn } from "@/features/payments/gateways";

/** Cashfree return_url. The browser's arrival proves nothing: the order is re-read from Cashfree. */
export async function GET(request: NextRequest, { params }: RouteContext<"/store/[host]/checkout/pay/return">) {
  const tenant = await resolveStorefrontTenant((await params).host);
  const origin = `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!tenant || request.nextUrl.searchParams.get("provider") !== "cashfree" || !token) return NextResponse.redirect(new URL("/", origin));
  const next = await confirmCashfreeReturn(tenant.tenantId, token).catch(() => "/");
  return NextResponse.redirect(new URL(next, origin), 303);
}
