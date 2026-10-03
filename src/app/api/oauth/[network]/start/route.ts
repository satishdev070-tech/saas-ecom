import { NextResponse } from "next/server";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";
import { createOAuthState, redirectUriFor } from "@/features/social/server/oauth";
import { metaAuthUrl, networkConfigured, pinterestAuthUrl, youtubeAuthUrl, type SocialNetwork } from "@/features/social/server/providers";

const NETWORKS: SocialNetwork[] = ["meta", "pinterest", "youtube"];
const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/dashboard/marketing/social?${q}`, req.url), 303);

/** Starts a seller's OAuth connection (dashboard session; marketing.write). */
export async function GET(req: Request, { params }: RouteContext<"/api/oauth/[network]/start">) {
  const { network } = await params;
  if (!NETWORKS.includes(network as SocialNetwork)) return new NextResponse("Not found", { status: 404 });
  const n = network as SocialNetwork;
  const ctx = await requireTenant();
  assertPermission(ctx, "marketing.write");
  if (!(await getEntitlements(ctx.tenantId)).isEnabled("social_media")) return back(req, "error=plan");
  if (!(await networkConfigured(n))) return back(req, "error=not_configured");
  const state = await createOAuthState(ctx.tenantId, ctx.user.id, n);
  const redirectUri = redirectUriFor(n);
  const url = n === "meta" ? await metaAuthUrl(redirectUri, state) : n === "pinterest" ? await pinterestAuthUrl(redirectUri, state) : await youtubeAuthUrl(redirectUri, state);
  if (!url) return back(req, "error=not_configured");
  return NextResponse.redirect(url, 303);
}
