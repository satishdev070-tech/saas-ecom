import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/landing";
import { isThemeKey } from "@/features/marketing-site/themes";

/**
 * "Use This Theme" from the public site. Nothing is applied here:
 *  - signed out: sign up with the theme carried through to onboarding;
 *  - signed in without a store: continue onboarding with the theme preselected;
 *  - sellers: the dashboard's theme page, where existing permissions and the draft/publish flow apply.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/themes/[key]/use">) {
  const { key } = await params;
  if (!isThemeKey(key)) return redirectTo("/themes");
  const user = await getSessionUser();
  let target = `/seller/register?theme=${encodeURIComponent(key)}`;
  if (user) {
    const landing = await landingPathFor(user.id);
    target = landing === "/onboarding" ? `/onboarding?theme=${encodeURIComponent(key)}` : `/dashboard/themes/${encodeURIComponent(key)}`;
  }
  return redirectTo(target);
}

/** Relative Location: stays on whichever platform host the visitor used (no absolute origin guess). */
function redirectTo(path: string): Response {
  return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}
