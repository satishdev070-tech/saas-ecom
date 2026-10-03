import type { Metadata } from "next";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { Badge, PageHeader } from "@/components/ui/layout";
import { SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar } from "@/features/settings/ui/filter-bar";
import { REVIEWS_PAGE_SIZE, countSampleReviews, listReviews } from "@/features/reviews/queries";
import { RemoveSampleReviews } from "@/features/reviews/components/remove-samples";
import { ReviewModeration } from "@/features/dashboard-ui/forms";
import { formatDate } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: PageProps<"/dashboard/reviews">) {
  const ctx = await requireTenantPermission("reviews.moderate");
  const sp = await searchParams;
  const status = typeof sp.status === "string" && ["pending", "approved", "rejected"].includes(sp.status) ? sp.status : sp.status === "all" ? undefined : "pending";
  const rating = Number(sp.rating) >= 1 && Number(sp.rating) <= 5 ? Number(sp.rating) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, samples] = await Promise.all([listReviews(ctx.tenantId, { status, rating, page }), countSampleReviews(ctx.tenantId)]);
  return (
    <div>
      <PageHeader title="Reviews" description="New reviews wait here for approval before they appear on your store." actions={samples ? <RemoveSampleReviews count={samples} /> : null} />
      {samples ? (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">
          {samples} sample review{samples === 1 ? " is" : "s are"} showing on your store, labelled “Sample review”. Remove them before launch or once real reviews arrive.
        </p>
      ) : null}
      <FilterBar action="/dashboard/reviews" resetHref="/dashboard/reviews" label="Filter reviews">
        <SelectField label="Status" name="status" defaultValue={status ?? "all"} options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }]} />
        <SelectField label="Rating" name="rating" defaultValue={rating ? String(rating) : ""} options={[{ value: "", label: "Any" }, ...[5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} stars` }))]} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title={status === "pending" ? "Nothing to moderate" : "No reviews"} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm">
                    <span aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}</span> <span className="font-medium">{r.title}</span>
                  </p>
                  {r.body ? <p className="text-sm text-muted">{r.body}</p> : null}
                  <p className="text-xs text-muted">
                    {r.author_name} on {r.products.title} · {formatDate(r.created_at)} {r.source === "sample" ? <Badge tone="warning">Sample</Badge> : r.verified_purchase ? <Badge tone="success">Verified</Badge> : null} <Badge>{r.status}</Badge>
                  </p>
                </div>
                <ReviewModeration id={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={REVIEWS_PAGE_SIZE} total={total} basePath="/dashboard/reviews" params={{ status: status ?? "all", rating: rating ? String(rating) : undefined }} />
    </div>
  );
}
