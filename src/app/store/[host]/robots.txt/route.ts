import { getStorefront } from "@/features/storefront/server/context";
import { robotsTxt } from "@/features/storefront/seo";
import { getLaunchStatus } from "@/features/stores/launch";

export async function GET(_req: Request, { params }: RouteContext<"/store/[host]/robots.txt">) {
  const { host } = await params;
  const sf = await getStorefront(host);
  const draft = sf ? (await getLaunchStatus(sf.tenant.tenantId)) === "draft" : false;
  const body = sf && !draft ? robotsTxt({ primaryHost: sf.tenant.primaryHost, allowIndexing: !sf.store.seo.noindex && sf.tenant.host === sf.tenant.primaryHost }) : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
