import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { getStoreLocations } from "@/features/storefront/server/content";
import { formatAddress, telHref } from "@/features/storefront/store-profile";

export const metadata: Metadata = { title: "Store locator" };

export default async function StoresPage({ params }: PageProps<"/store/[host]/stores">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  if (!sf.features.storeLocator) notFound();
  const locations = await getStoreLocations(sf.tenant.tenantId);
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-heading mb-8 text-4xl">Visit us</h1>
      {locations.length ? (
        <ul className="grid gap-6 @[48rem]:grid-cols-2 @[64rem]:grid-cols-3">
          {locations.map((l) => (
            <li key={l.id} className="sf-border space-y-2 rounded-[var(--sf-radius-card)] border p-5">
              <h2 className="sf-heading text-xl">{l.name}</h2>
              <address className="sf-muted not-italic text-sm">{formatAddress(l.address).join(", ")}</address>
              {l.hours ? <p className="text-sm">{l.hours}</p> : null}
              {l.phone && telHref(l.phone) ? <a href={telHref(l.phone)!} className="sf-link text-sm">{l.phone}</a> : null}
              {l.latitude !== null && l.longitude !== null ? (
                <p>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`} rel="noopener noreferrer" target="_blank" className="sf-link text-sm">
                    Get directions
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted">No stores listed yet.</p>
      )}
    </div>
  );
}
