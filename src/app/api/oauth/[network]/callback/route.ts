import { NextResponse } from "next/server";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { logger } from "@/lib/observability/logger";
import { saveOAuthConnection } from "@/features/integrations/server/store";
import { consumeOAuthState, redirectUriFor } from "@/features/social/server/oauth";
import { metaExchange, pinterestAccount, pinterestBoards, pinterestExchange, youtubeExchange, type SocialNetwork } from "@/features/social/server/providers";

const NETWORKS: SocialNetwork[] = ["meta", "pinterest", "youtube"];
const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/dashboard/marketing/social?${q}`, req.url), 303);

/** OAuth callback: verifies state (signed + browser-bound), exchanges the code and stores tokens encrypted. */
export async function GET(req: Request, { params }: RouteContext<"/api/oauth/[network]/callback">) {
  const { network } = await params;
  if (!NETWORKS.includes(network as SocialNetwork)) return new NextResponse("Not found", { status: 404 });
  const n = network as SocialNetwork;
  const url = new URL(req.url);
  const state = await consumeOAuthState(url.searchParams.get("state"), n);
  if (!state) return back(req, "error=state");
  const ctx = await requireTenant();
  if (ctx.user.id !== state.u || ctx.tenantId !== state.t) return back(req, "error=state");
  assertPermission(ctx, "marketing.write");
  if (url.searchParams.get("error")) return back(req, "error=denied");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return back(req, "error=denied");
  const redirectUri = redirectUriFor(n);

  try {
    if (n === "meta") {
      const r = await metaExchange(code, redirectUri);
      if (!r.ok) return back(req, r.expired ? "error=expired" : "error=provider");
      const page = r.data.pages.find((p) => p.instagram) ?? r.data.pages[0]!;
      await saveOAuthConnection(ctx.tenantId, ctx.user.id, "facebook", { publicConfig: { account_id: page.id, account_name: page.name }, secrets: { page_token: page.accessToken }, expiresAt: null });
      if (page.instagram) {
        await saveOAuthConnection(ctx.tenantId, ctx.user.id, "instagram", { publicConfig: { account_id: page.instagram.id, account_name: page.instagram.username ? `@${page.instagram.username}` : page.name, page_id: page.id }, secrets: { page_token: page.accessToken }, expiresAt: null });
      }
      return back(req, `connected=${page.instagram ? "facebook,instagram" : "facebook"}`);
    }
    if (n === "pinterest") {
      const r = await pinterestExchange(code, redirectUri);
      if (!r.ok) return back(req, r.expired ? "error=expired" : "error=provider");
      const [acct, boards] = await Promise.all([pinterestAccount(r.data.accessToken), pinterestBoards(r.data.accessToken)]);
      const board = boards.ok ? boards.data[0] : undefined;
      await saveOAuthConnection(ctx.tenantId, ctx.user.id, "pinterest", {
        publicConfig: { account_name: acct.ok ? acct.data.username : "Pinterest", ...(board ? { board_id: board.id, board_name: board.name } : {}) },
        secrets: { access_token: r.data.accessToken, ...(r.data.refreshToken ? { refresh_token: r.data.refreshToken } : {}) },
        expiresAt: r.data.expiresAt,
      });
      return back(req, "connected=pinterest");
    }
    const r = await youtubeExchange(code, redirectUri);
    if (!r.ok) return back(req, r.expired ? "error=expired" : "error=provider");
    await saveOAuthConnection(ctx.tenantId, ctx.user.id, "youtube", {
      publicConfig: { account_id: r.data.channel.id, account_name: r.data.channel.title },
      secrets: { access_token: r.data.accessToken, ...(r.data.refreshToken ? { refresh_token: r.data.refreshToken } : {}) },
      expiresAt: r.data.expiresAt,
    });
    return back(req, "connected=youtube");
  } catch (err) {
    logger.error("social.oauth_callback_failed", { tenantId: ctx.tenantId, network: n, error: err });
    return back(req, "error=provider");
  }
}
