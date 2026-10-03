import { requireStorefront } from "@/features/storefront/server/context";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";

/** Unknown storefront paths: honour the store's URL redirects, else 404. */
export default async function StoreCatchAll({ params }: PageProps<"/store/[host]/[...rest]">) {
  const { host, rest } = await params;
  const sf = await requireStorefront(host);
  return redirectOrNotFound(sf.tenant.tenantId, `/${rest.map(encodeURIComponent).join("/")}`);
}
