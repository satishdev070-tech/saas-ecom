import { NextResponse, type NextRequest } from "next/server";
import { resolveStorefrontTenant } from "@/lib/tenant/resolve";
import { getSearchSuggestions } from "@/features/storefront/server/suggest";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

/** GET /search/suggest?q= on a store host → JSON autocomplete (products, categories, collections). */
export async function GET(request: NextRequest, { params }: RouteContext<"/store/[host]/search/suggest">) {
  const tenant = await resolveStorefrontTenant((await params).host);
  if (!tenant || (tenant.status !== "active" && tenant.status !== "trial")) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 60) return NextResponse.json({ query: q, total: 0, products: [], categories: [], collections: [] });
  try {
    await rateLimit("search:suggest", await clientIpKey(), 120, 60);
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    throw err;
  }
  const data = await getSearchSuggestions(tenant.tenantId, q);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
}
