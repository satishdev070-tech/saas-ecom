import { getStorefront } from "@/features/storefront/server/context";
import { robotsTxt } from "@/features/storefront/seo";

export async function GET(_req: Request, { params }: RouteContext<"/store/[host]/robots.txt">) {
  const { host } = await params;
  const sf = await getStorefront(host);
  const body = sf ? robotsTxt({ primaryHost: sf.tenant.primaryHost, allowIndexing: !sf.store.seo.noindex && sf.tenant.host === sf.tenant.primaryHost }) : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
