import { getStorefront } from "@/features/storefront/server/context";
import { sitemapXml } from "@/features/storefront/seo";
import { getSitemapEntries } from "@/features/storefront/server/sitemap";
import { getLaunchStatus } from "@/features/stores/launch";

export async function GET(_req: Request, { params }: RouteContext<"/store/[host]/sitemap.xml">) {
  const { host } = await params;
  const sf = await getStorefront(host);
  if (!sf || (await getLaunchStatus(sf.tenant.tenantId)) === "draft") return new Response("Not found", { status: 404 });
  const xml = sitemapXml(sf.tenant.primaryHost, await getSitemapEntries(sf.tenant.tenantId));
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
