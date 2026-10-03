import { NextResponse } from "next/server";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";
import { createGbpState, gbpRedirectUri } from "@/features/google-business/server/oauth";
import { gbpAuthUrl, googleClient } from "@/features/google-business/server/api";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/dashboard/marketing/google?${q}`, req.url), 303);

/** Starts the Google Business Profile OAuth connection (dashboard session; marketing.write). */
export async function GET(req: Request) {
  const ctx = await requireTenant();
  assertPermission(ctx, "marketing.write");
  if (!(await getEntitlements(ctx.tenantId)).isEnabled("social_media")) return back(req, "error=plan");
  const client = await googleClient();
  if (!client) return back(req, "error=not_configured");
  const state = await createGbpState(ctx.tenantId, ctx.user.id);
  return NextResponse.redirect(gbpAuthUrl(client.id, gbpRedirectUri(), state), 303);
}
