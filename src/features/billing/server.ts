import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/membership";
import { assertPlatformPermission, type PlatformContext } from "@/lib/platform/access";
import type { Json } from "@/lib/supabase/database.types";
import type { BillingCycle, PlanRequestStatus } from "./schemas";

/**
 * Plans and plan requests. Seller reads go through the member's session (RLS: plan_requests
 * readable with store.read; plans are public); writes through SQL functions that check
 * billing.manage (owner) or platform.tenants.manage and audit in the same transaction.
 */

export type PlanCard = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  limits: Record<string, number | null>;
  features: string[];
};

export type PlanRequestRow = {
  id: string;
  tenantId: string;
  planId: string;
  planName: string;
  fromPlanName: string | null;
  cycle: BillingCycle;
  note: string | null;
  status: PlanRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
};

const LIMIT_KEYS = ["products", "staff", "storage_mb", "custom_domains"] as const;

function limitsOf(v: Json): Record<string, number | null> {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(LIMIT_KEYS.map((k) => [k, typeof o[k] === "number" ? (o[k] as number) : null]));
}
function featuresOf(v: Json): string[] {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return Object.entries(o)
    .filter(([, on]) => on === true)
    .map(([k]) => k);
}

type PlanSelect = { id: string; code: string; name: string; description: string | null; price_monthly: number; price_yearly: number; trial_days: number; limits: Json; features: Json };
const toCard = (p: PlanSelect): PlanCard => ({ id: p.id, code: p.code, name: p.name, description: p.description, priceMonthly: Number(p.price_monthly), priceYearly: Number(p.price_yearly), trialDays: p.trial_days, limits: limitsOf(p.limits), features: featuresOf(p.features) });

export async function listActivePlans(): Promise<PlanCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("plans").select("id, code, name, description, price_monthly, price_yearly, trial_days, limits, features").eq("active", true).order("sort_order").order("price_monthly").limit(20);
  if (error) throw mapDbError(error);
  return (data ?? []).map(toCard);
}

/** Feature flag key → description, for plan comparison labels. */
export async function featureLabels(): Promise<Record<string, string>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("feature_flags").select("key, description").limit(200);
  return Object.fromEntries((data ?? []).map((f) => [f.key, f.description ?? f.key]));
}

type RequestSelect = { id: string; tenant_id: string; plan_id: string; billing_cycle: string; note: string | null; status: string; created_at: string; decided_at: string | null; decision_note: string | null; plan: { name: string } | { name: string }[] | null; from: { name: string } | { name: string }[] | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const REQUEST_FIELDS = "id, tenant_id, plan_id, billing_cycle, note, status, created_at, decided_at, decision_note, plan:plans!plan_requests_plan_id_fkey(name), from:plans!plan_requests_from_plan_id_fkey(name)";
const toRequest = (r: RequestSelect): PlanRequestRow => ({
  id: r.id,
  tenantId: r.tenant_id,
  planId: r.plan_id,
  planName: one(r.plan)?.name ?? "Plan",
  fromPlanName: one(r.from)?.name ?? null,
  cycle: r.billing_cycle === "yearly" ? "yearly" : "monthly",
  note: r.note,
  status: r.status as PlanRequestStatus,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
});

/** Missing table (migration 2900 not applied) → empty list instead of a crash. */
function tableMissing(error: { code?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

export type StorePlanOverview = {
  status: string;
  trialEndsAt: string | null;
  current: PlanCard | null;
  plans: PlanCard[];
  usage: { products: number; staff: number };
  requests: PlanRequestRow[];
  requestsAvailable: boolean;
};

export async function getStorePlanOverview(ctx: TenantContext): Promise<StorePlanOverview> {
  const supabase = await createSupabaseServerClient();
  const [tenant, plans, products, staff, requests] = await Promise.all([
    supabase.from("tenants").select("status, trial_ends_at, plan_id").eq("id", ctx.tenantId).single(),
    listActivePlans(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).neq("status", "archived"),
    supabase.from("tenant_memberships").select("user_id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "active"),
    supabase.from("plan_requests").select(REQUEST_FIELDS).eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (tenant.error) throw mapDbError(tenant.error);
  let current = plans.find((p) => p.id === tenant.data.plan_id) ?? null;
  if (!current && tenant.data.plan_id) {
    // The store's plan may be inactive (hidden from the list) but is still its plan.
    const { data } = await supabase.from("plans").select("id, code, name, description, price_monthly, price_yearly, trial_days, limits, features").eq("id", tenant.data.plan_id).maybeSingle();
    current = data ? toCard(data) : null;
  }
  if (requests.error && !tableMissing(requests.error)) throw mapDbError(requests.error);
  return {
    status: tenant.data.status,
    trialEndsAt: tenant.data.trial_ends_at,
    current,
    plans,
    usage: { products: products.count ?? 0, staff: staff.count ?? 0 },
    requests: requests.error ? [] : ((requests.data ?? []) as unknown as RequestSelect[]).map(toRequest),
    requestsAvailable: !requests.error,
  };
}

export async function requestPlan(ctx: TenantContext, input: { planId: string; cycle: BillingCycle; note?: string }): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_plan", { p_tenant: ctx.tenantId, p_plan: input.planId, p_cycle: input.cycle, p_note: input.note ?? "" });
  if (error) {
    if (error.hint === "PLAN_NOT_FOUND") throw new AppError("VALIDATION", { fieldErrors: { planId: ["That plan isn't available."] } });
    if (tableMissing(error) || error.code === "PGRST202") throw new AppError("CONFLICT", { message: "Plan requests aren't set up yet. Please contact support." });
    throw mapDbError(error, { tenantId: ctx.tenantId });
  }
  return data;
}

export async function cancelPlanRequest(ctx: TenantContext, requestId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase.from("plan_requests").select("tenant_id").eq("id", requestId).maybeSingle();
  if (!r || r.tenant_id !== ctx.tenantId) throw new AppError("NOT_FOUND");
  const { error } = await supabase.rpc("cancel_plan_request", { p_request: requestId });
  if (error) {
    if (error.hint === "NOT_PENDING") throw new AppError("CONFLICT", { message: "This request was already handled." });
    throw mapDbError(error);
  }
}

// ---- Platform ---------------------------------------------------------------------------

export type PlatformPlanRequest = PlanRequestRow & { storeName: string; storeSlug: string; storeStatus: string; currentPlanName: string | null; trialEndsAt: string | null };

export async function listPlanRequests(ctx: PlatformContext, filter: { status?: PlanRequestStatus; tenantId?: string; limit?: number }): Promise<{ rows: PlatformPlanRequest[]; available: boolean }> {
  assertPlatformPermission(ctx, "platform.tenants.read");
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("plan_requests")
    .select(`${REQUEST_FIELDS}, tenants!inner(name, slug, status, trial_ends_at, current:plans(name))`)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.tenantId) q = q.eq("tenant_id", filter.tenantId);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error)) return { rows: [], available: false };
    throw mapDbError(error);
  }
  type Row = RequestSelect & { tenants: { name: string; slug: string; status: string; trial_ends_at: string | null; current: { name: string } | { name: string }[] | null } | null };
  return {
    available: true,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      ...toRequest(r),
      storeName: r.tenants?.name ?? "",
      storeSlug: r.tenants?.slug ?? "",
      storeStatus: r.tenants?.status ?? "",
      currentPlanName: one(r.tenants?.current ?? null)?.name ?? null,
      trialEndsAt: r.tenants?.trial_ends_at ?? null,
    })),
  };
}

export async function pendingPlanRequestCount(ctx: PlatformContext): Promise<number> {
  if (!ctx.permissions.has("platform.tenants.read")) return 0;
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase.from("plan_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? 0 : (count ?? 0);
}

export async function decidePlanRequest(ctx: PlatformContext, input: { requestId: string; decision: "approve" | "decline"; note?: string; months?: number }): Promise<{ tenantId: string }> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase.from("plan_requests").select("tenant_id").eq("id", input.requestId).maybeSingle();
  if (!r) throw new AppError("NOT_FOUND");
  const { error } = await supabase.rpc("platform_decide_plan_request", { p_request: input.requestId, p_approve: input.decision === "approve", p_note: input.note ?? "", ...(input.months ? { p_months: input.months } : {}) });
  if (error) {
    if (error.hint === "NOT_PENDING") throw new AppError("CONFLICT", { message: "This request was already handled." });
    throw mapDbError(error);
  }
  return { tenantId: r.tenant_id };
}
