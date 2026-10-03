import { NextResponse, type NextRequest } from "next/server";
import { getRequestHost } from "@/lib/tenant/resolve";
import { tenantDirectory } from "@/lib/tenant/directory";
import { verifyPreviewToken } from "@/features/theme/server/preview";
import { PREVIEW_COOKIE, PREVIEW_TTL_SECONDS } from "@/features/theme/preview";
import { safeRedirectPath } from "@/lib/http/safe-redirect";

/** Installs (or clears) the draft-theme preview cookie for this store, then redirects. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const host = await getRequestHost();
  const origin = host ? `${url.protocol}//${request.headers.get("host") ?? host}` : url.origin;
  const res = NextResponse.redirect(new URL(safeRedirectPath(url.searchParams.get("path"), "/"), origin));
  res.headers.set("Cache-Control", "no-store");
  if (url.searchParams.get("exit")) {
    res.cookies.delete(PREVIEW_COOKIE);
    return res;
  }
  const token = url.searchParams.get("token");
  const tenant = host ? await tenantDirectory.findByHost(host) : null;
  if (!token || !tenant || !verifyPreviewToken(token, tenant.tenantId)) return res;
  res.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: PREVIEW_TTL_SECONDS });
  return res;
}
