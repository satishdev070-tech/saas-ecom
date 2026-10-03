import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { listMedia } from "@/features/media/server/media";
import { MediaLibrary } from "@/features/media/components/media-library";

export const metadata: Metadata = { title: "Media" };

const PAGE_SIZE = 48;

export default async function MediaPage({ searchParams }: PageProps<"/dashboard/media">) {
  const ctx = await requireTenantPermission("store.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const page = Math.min(Math.max(Number(str("page")) || 1, 1), 50);
  const sort = str("sort");
  // "Load more" grows the page size rather than paginating, so earlier images stay on screen.
  const { items, total, folders } = await listMedia(ctx.tenantId, {
    q: str("q")?.slice(0, 80),
    folder: str("folder"),
    type: str("type"),
    sort: sort === "oldest" || sort === "name" || sort === "largest" ? sort : "newest",
    page: 1,
    pageSize: Math.min(PAGE_SIZE * page, 96 * 4),
  });
  const canUpload = can(ctx, "catalog.write") || can(ctx, "content.write") || can(ctx, "theme.edit");
  return (
    <div className="space-y-6">
      <PageHeader title="Media" description="Every image in your store, in one place. Upload once and reuse it for products, collections, banners and pages." />
      <MediaLibrary items={items} total={total} folders={folders} page={page} pageSize={PAGE_SIZE} canUpload={canUpload} />
    </div>
  );
}
