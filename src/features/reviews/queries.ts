import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";

export const REVIEWS_PAGE_SIZE = 25;

type ReviewListRow = { id: string; rating: number; title: string | null; body: string | null; author_name: string; status: string; verified_purchase: boolean; created_at: string; source?: string; products: { id: string; title: string } };

export async function listReviews(tenantId: string, f: { status?: string; rating?: number; page: number }) {
  const supabase = await createSupabaseServerClient();
  const run = (cols: string) => {
    let q = supabase.from("reviews").select(cols, { count: "exact" }).eq("tenant_id", tenantId);
    if (f.status) q = q.eq("status", f.status);
    if (f.rating) q = q.eq("rating", f.rating);
    const from = (f.page - 1) * REVIEWS_PAGE_SIZE;
    return q.order("created_at", { ascending: false }).range(from, from + REVIEWS_PAGE_SIZE - 1).returns<ReviewListRow[]>();
  };
  const base = "id, rating, title, body, author_name, status, verified_purchase, created_at, products!inner(id, title)";
  // `source` exists after migration 1700; fall back so the page works before it is applied.
  let { data, count, error } = await run(`${base}, source`);
  if (error && /source/.test(error.message)) ({ data, count, error } = await run(base));
  if (error) throw mapDbError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function countSampleReviews(tenantId: string): Promise<number> {
  const { count, error } = await (await createSupabaseServerClient()).from("reviews").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("source", "sample");
  return error ? 0 : (count ?? 0);
}
