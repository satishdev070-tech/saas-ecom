import { NextResponse } from "next/server";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { logger } from "@/lib/observability/logger";
import { consumeGbpState, gbpRedirectUri } from "@/features/google-business/server/oauth";
import { gbpExchange, listAccounts, listLocations } from "@/features/google-business/server/api";
import { recordGbpStatus, saveGbpConnection } from "@/features/google-business/server/connection";
import { v4LocationName } from "@/features/google-business/gbp";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/dashboard/marketing/google?${q}`, req.url), 303);

/**
 * OAuth callback: verifies state (signed + browser-bound + same user/store), exchanges the code,
 * stores the refresh token encrypted, then lists the seller's locations. One location is selected
 * automatically; with several, the page asks the seller to choose.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = await consumeGbpState(url.searchParams.get("state"));
  if (!state) return back(req, "error=state");
  const ctx = await requireTenant();
  if (ctx.user.id !== state.u || ctx.tenantId !== state.t) return back(req, "error=state");
  assertPermission(ctx, "marketing.write");
  if (url.searchParams.get("error")) return back(req, "error=denied");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return back(req, "error=denied");

  try {
    const t = await gbpExchange(code, gbpRedirectUri());
    if (!t.ok) return back(req, "error=provider");
    if (!t.data.refreshToken) return back(req, "error=no_refresh");
    const accounts = await listAccounts(t.data.accessToken);
    const locations = accounts.ok ? await listLocations(t.data.accessToken) : accounts;
    const only = locations.ok && locations.data.length === 1 ? locations.data[0]! : null;
    const v4 = only ? v4LocationName(only.account, only.location) : null;
    await saveGbpConnection(ctx.tenantId, ctx.user.id, {
      publicConfig: {
        account_name: accounts.ok ? (accounts.data[0]?.accountName ?? "Google account") : "Google account",
        ...(only && v4 ? { location_name: v4, location_title: only.title } : {}),
      },
      secrets: { refresh_token: t.data.refreshToken, access_token: t.data.accessToken },
      expiresAt: t.data.expiresAt,
    });
    if (!locations.ok) {
      // Signed in, but the Business Profile APIs refused (often: API access not yet approved by Google).
      await recordGbpStatus(ctx.tenantId, "error", locations.message);
      return back(req, "error=api");
    }
    if (!locations.data.length) return back(req, "connected=1&locations=0");
    return back(req, only ? "connected=1" : "connected=1&choose=1");
  } catch (err) {
    logger.error("gbp.oauth_callback_failed", { tenantId: ctx.tenantId, error: err });
    return back(req, "error=provider");
  }
}
