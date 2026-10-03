import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { getCollections } from "@/features/storefront/server/catalog";
import { paths } from "@/features/storefront/urls";
import { StoreImage } from "@/features/storefront/components/store-image";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsIndex({ params }: PageProps<"/store/[host]/collections">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const collections = await getCollections(sf.tenant.tenantId, { limit: 60 });
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-heading mb-8 text-4xl">Collections</h1>
      {collections.length ? (
        <ul className="grid grid-cols-2 gap-4 @[64rem]:grid-cols-4">
          {collections.map((c) => (
            <li key={c.id}>
              <Link href={paths.collection(c.slug)} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--sf-radius-card)]">
                  <StoreImage path={c.imagePath} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="transition group-hover:scale-105" />
                </div>
                <p className="mt-2 font-medium">{c.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted">No collections yet.</p>
      )}
    </div>
  );
}
