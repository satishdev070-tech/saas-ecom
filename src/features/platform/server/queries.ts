import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";
import { TENANT_STATUSES, type TenantStatus } from "@/lib/tenant/context";
import type { Json } from "@/lib/supabase/database.types";
import { bucketWindows, recentMonthStarts, usageByMonth, type MonthlyUsage, type SeriesPoint } from "../stats";
import { isMissingSchemaError, parseStoreType, type StoreType } from "../schemas";
import type { auditFilterSchema, domainFilterSchema, StoreListFilter, tenantListFilterSchema } from "../schemas";

/**
 * Super-admin reads. Every query runs as the signed-in platform user (RLS enforced:
 * platform_* permissions are checked by the policies and by the SQL helper functions),
 * so a page that forgot requirePlatform() still could not read anything. Callers must
 * have called requirePlatform(permission) first.
 */

type PgError = Parameters<typeof mapDbError>[0];
function check(error: PgError, context?: Record<string, unknown>) {
  if (error) throw mapDbError(error, context);
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ---- Shared -------------------------------------------------------------------------

/** auth.users emails for staff screens (platform members only; enforced in SQL). */
export async function userEmails(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 500);
  if (unique.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_user_emails", { p_user_ids: unique });
  check(error);
  return new Map((data ?? []).map((r) => [r.user_id, r.email]));
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_find_user_by_email", { p_email: email });
  check(error);
  return (data as string | null) ?? null;
}

// ---- Dashboard ----------------------------------------------------------------------

const count = z.coerce.number().catch(0);
const overviewSchema = z.object({
  status_counts: z.record(z.string(), z.coerce.number()).catch({}),
  new_7d: count,
  new_30d: count,
  month_gmv: z.union([z.number(), z.string()]).catch(0),
  month_orders: count,
  trials_ending_7d: count,
  custom_domains_pending: count,
});

export type PlatformOverview = {
  statusCounts: Record<TenantStatus, number>;
  totalTenants: number;
  new7d: number;
  new30d: number;
  monthGmvMinor: number;
  monthOrders: number;
  trialsEnding7d: number;
  customDomainsPending: number;
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_overview");
  check(error);
  const o = overviewSchema.parse(data ?? {});
  const statusCounts = Object.fromEntries(TENANT_STATUSES.map((s) => [s, o.status_counts[s] ?? 0])) as Record<TenantStatus, number>;
  let monthGmvMinor = 0;
  try {
    monthGmvMinor = toMinor(o.month_gmv);
  } catch {
    monthGmvMinor = 0;
  }
  return {
    statusCounts,
    totalTenants: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    new7d: o.new_7d,
    new30d: o.new_30d,
    monthGmvMinor,
    monthOrders: Math.round(o.month_orders),
    trialsEnding7d: o.trials_ending_7d,
    customDomainsPending: o.custom_domains_pending,
  };
}

const money = z.union([z.number(), z.string()]).transform((v) => {
  try {
    return toMinor(v);
  } catch {
    return 0;
  }
});
const dashboardSchema = z.object({
  users_total: count,
  sellers: count,
  customers: count,
  staff: count,
  storage_bytes: z.coerce.number().catch(0),
  storage_files: count,
  orders_all_time: count,
  monthly: z.array(z.object({ month: z.string(), gmv: money, orders: z.coerce.number(), new_stores: z.coerce.number() })).catch([]),
  plans: z.array(z.object({ name: z.string(), count: z.coerce.number() })).catch([]),
});
export type PlatformDashboard = z.infer<typeof dashboardSchema>;

/** People, storage, 6-month GMV/orders/new stores and plan mix in one call (platform_dashboard RPC). */
export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_dashboard");
  check(error);
  return dashboardSchema.parse(data ?? {});
}

/** New tenants per week (exact counts per window, so it stays correct at any volume). */
export async function getSignupSeries(weeks = 12): Promise<SeriesPoint[]> {
  const supabase = await createSupabaseServerClient();
  const windows = bucketWindows({ buckets: weeks, bucketDays: 7 });
  const counts = await Promise.all(
    windows.map(async (w) => {
      const { count: n, error } = await supabase.from("tenants").select("id", { count: "exact", head: true }).gte("created_at", w.start).lt("created_at", w.end);
      check(error);
      return n ?? 0;
    }),
  );
  return windows.map((w, i) => ({ key: w.key, label: w.label, value: counts[i] ?? 0 }));
}

// ---- Tenants ------------------------------------------------------------------------

export type TenantListFilter = z.infer<typeof tenantListFilterSchema>;
export type TenantListRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planName: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  /** Null when the viewer lacks platform.usage.read. */
  stats: { ownerEmail: string | null; products: number; orders: number; gmvMinor: number } | null;
};

export type StoreListRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planName: string | null;
  createdAt: string;
  ownerEmail: string | null;
  primaryDomain: string | null;
  products: number;
  orders: number;
  customers: number;
  revenueMinor: number;
  lastActivity: string | null;
  /** Null before migration 1800 (column missing). */
  storeType: StoreType | null;
  categoryName: string | null;
};

export type StoreCategoryOption = { id: string; name: string };

/** Active store categories for filters, or null when migration 1800 isn't applied yet. */
export async function listStoreCategories(): Promise<StoreCategoryOption[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("store_categories").select("id, name").order("position").order("name");
  if (error) {
    if (isMissingSchemaError(error)) return null;
    check(error);
  }
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Super-admin store directory: search/filter/sort/paginate in SQL (platform_list_stores checks
 * platform.tenants.read). Store type and category (migration 1800) are used only when the
 * project has them: `categories` is null otherwise, and the type/category filters are ignored.
 */
export async function listStores(f: StoreListFilter): Promise<{ rows: StoreListRow[]; total: number; categories: StoreCategoryOption[] | null }> {
  const supabase = await createSupabaseServerClient();
  let categories = await listStoreCategories();
  const base = {
    p_q: f.q || undefined,
    p_status: f.status,
    p_plan: f.plan,
    p_from: f.from ? `${f.from}T00:00:00+05:30` : undefined,
    p_to: f.to ? `${f.to}T23:59:59.999+05:30` : undefined,
    p_sort: f.sort,
    p_limit: f.pageSize,
    p_offset: (f.page - 1) * f.pageSize,
  };
  let res = categories ? await supabase.rpc("platform_list_stores", { ...base, p_type: f.type, p_category: f.category }) : await supabase.rpc("platform_list_stores", base);
  if (categories && res.error && isMissingSchemaError(res.error)) {
    // Table exists but the 10-arg RPC doesn't (partially applied): use the old signature.
    categories = null;
    res = await supabase.rpc("platform_list_stores", base);
  }
  const { data, error } = res;
  check(error);
  // The old RPC has no store_type column: treat the new fields as unavailable.
  if (categories && data?.length && !("store_type" in data[0]!)) categories = null;
  const rows = (data ?? []).map((r) => ({
    id: r.tenant_id,
    name: r.name,
    slug: r.slug,
    status: (TENANT_STATUSES as readonly string[]).includes(r.status) ? (r.status as TenantStatus) : "active",
    planName: r.plan_name ?? null,
    createdAt: r.created_at,
    ownerEmail: r.owner_email ?? null,
    primaryDomain: r.primary_domain ?? null,
    products: Number(r.products ?? 0),
    orders: Number(r.orders ?? 0),
    customers: Number(r.customers ?? 0),
    revenueMinor: toMinor(r.revenue ?? 0),
    lastActivity: r.last_activity ?? null,
    storeType: categories ? parseStoreType(r.store_type) : null,
    categoryName: categories ? (r.category_name ?? null) : null,
  }));
  return { rows, total: Number(data?.[0]?.total_count ?? 0), categories };
}

export async function listTenants(f: TenantListFilter): Promise<{ rows: TenantListRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const from = (f.page - 1) * f.pageSize;
  let q = supabase.from("tenants").select("id, name, slug, status, trial_ends_at, created_at, plans(name)", { count: "exact" });
  if (f.q) q = q.or(`name.ilike.%${f.q}%,slug.ilike.%${f.q}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.plan) q = q.eq("plan_id", f.plan);
  const { data, error, count: total } = await q.order("created_at", { ascending: false }).range(from, from + f.pageSize - 1);
  check(error);
  const ids = (data ?? []).map((t) => t.id);
  const statsRes = ids.length ? await supabase.rpc("platform_tenant_list_stats", { p_tenants: ids }) : null;
  // Staff without usage.read get "not allowed" here; the table then hides the columns.
  const stats = new Map((statsRes && !statsRes.error ? statsRes.data : []).map((r) => [r.tenant_id, r]));
  return {
    total: total ?? 0,
    rows: (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status as TenantStatus,
      planName: one(t.plans)?.name ?? null,
      trialEndsAt: t.trial_ends_at,
      createdAt: t.created_at,
      stats: statsRes && !statsRes.error
        ? (() => {
            const r = stats.get(t.id);
            return { ownerEmail: r?.owner_email ?? null, products: Number(r?.products ?? 0), orders: Number(r?.orders ?? 0), gmvMinor: r ? toMinor(r.gmv) : 0 };
          })()
        : null,
    })),
  };
}

export type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  statusReason: string | null;
  planId: string | null;
  plan: { id: string; name: string; code: string; limits: Json } | null;
  trialEndsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  store: {
    name: string;
    tagline: string | null;
    email: string | null;
    phone: string | null;
    legalName: string | null;
    gstin: string | null;
    address: Json;
    updatedAt: string;
  } | null;
};

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [tenantRes, storeRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, slug, status, status_reason, plan_id, trial_ends_at, created_by, created_at, plans(id, name, code, limits)")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase.from("stores").select("name, tagline, email, phone, legal_name, gstin, address, updated_at").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  check(tenantRes.error, { tenantId });
  check(storeRes.error, { tenantId });
  const t = tenantRes.data;
  if (!t) return null;
  const s = storeRes.data;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status as TenantStatus,
    statusReason: t.status_reason,
    planId: t.plan_id,
    plan: one(t.plans),
    trialEndsAt: t.trial_ends_at,
    createdBy: t.created_by,
    createdAt: t.created_at,
    store: s
      ? { name: s.name, tagline: s.tagline, email: s.email, phone: s.phone, legalName: s.legal_name, gstin: s.gstin, address: s.address, updatedAt: s.updated_at }
      : null,
  };
}

export type TenantMemberRow = { userId: string; role: string; status: string; email: string | null; displayName: string | null; createdAt: string };

export async function listTenantMembers(tenantId: string): Promise<TenantMemberRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tenant_memberships").select("user_id, role, status, created_at").eq("tenant_id", tenantId).order("created_at").limit(200);
  check(error, { tenantId });
  const rows = data ?? [];
  const ids = rows.map((r) => r.user_id);
  const [emails, profiles] = await Promise.all([
    userEmails(ids),
    ids.length ? supabase.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
  ]);
  check(profiles.error);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));
  const order = ["owner", "admin", "manager", "staff", "viewer"];
  return rows
    .map((r) => ({ userId: r.user_id, role: r.role, status: r.status, email: emails.get(r.user_id) ?? null, displayName: names.get(r.user_id) ?? null, createdAt: r.created_at }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

const countsSchema = z.object({ products: count, orders: count, customers: count, gmv: z.union([z.number(), z.string()]).catch(0) });
export type TenantCounts = { products: number; orders: number; customers: number; gmvMinor: number };

/** Catalog/order totals (tenant data is hidden from staff by RLS; this SQL helper returns counts only). */
export async function getTenantCounts(tenantId: string): Promise<TenantCounts> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_tenant_counts", { p_tenant: tenantId });
  check(error, { tenantId });
  const c = countsSchema.parse(data ?? {});
  let gmvMinor = 0;
  try {
    gmvMinor = toMinor(c.gmv);
  } catch {
    gmvMinor = 0;
  }
  return { products: c.products, orders: c.orders, customers: c.customers, gmvMinor };
}

export async function getTenantMonthlyUsage(tenantId: string, months = 6): Promise<MonthlyUsage[]> {
  const starts = recentMonthStarts(months);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_usage")
    .select("metric, period_start, value")
    .eq("tenant_id", tenantId)
    .in("metric", ["gmv", "orders"])
    .gte("period_start", starts[0]!)
    .limit(100);
  check(error, { tenantId });
  return usageByMonth(data ?? [], starts);
}

export type StorageRow = { tenantId: string; bytes: number; files: number };

export async function getStorageUsage(tenantId: string | null, limit = 50): Promise<StorageRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_storage_usage", { ...(tenantId ? { p_tenant: tenantId } : {}), p_limit: limit });
  check(error, { tenantId });
  return (data ?? []).map((r) => ({ tenantId: r.tenant_id, bytes: Number(r.bytes) || 0, files: Number(r.files) || 0 }));
}

export type PlatformDomainRow = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  hostname: string;
  type: string;
  status: string;
  sslStatus: string;
  isPrimary: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

type DomainSelect = {
  id: string;
  tenant_id: string;
  hostname: string;
  type: string;
  status: string;
  ssl_status: string;
  is_primary: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  verified_at: string | null;
  created_at: string;
  tenants?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function toDomainRow(d: DomainSelect): PlatformDomainRow {
  const t = one(d.tenants);
  return {
    id: d.id,
    tenantId: d.tenant_id,
    tenantName: t?.name ?? null,
    tenantSlug: t?.slug ?? null,
    hostname: d.hostname,
    type: d.type,
    status: d.status,
    sslStatus: d.ssl_status,
    isPrimary: d.is_primary,
    lastCheckedAt: d.last_checked_at,
    lastError: d.last_error,
    verifiedAt: d.verified_at,
    createdAt: d.created_at,
  };
}

const DOMAIN_FIELDS = "id, tenant_id, hostname, type, status, ssl_status, is_primary, last_checked_at, last_error, verified_at, created_at";

export async function listTenantDomainsForPlatform(tenantId: string): Promise<PlatformDomainRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("domains").select(DOMAIN_FIELDS).eq("tenant_id", tenantId).order("type", { ascending: false }).order("created_at").limit(50);
  check(error, { tenantId });
  return (data ?? []).map(toDomainRow);
}

export type DomainFilter = z.infer<typeof domainFilterSchema>;

/** All custom domains across tenants (removed ones only when filtered for). */
export async function listAllCustomDomains(f: DomainFilter): Promise<{ rows: PlatformDomainRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const from = (f.page - 1) * f.pageSize;
  let q = supabase.from("domains").select(`${DOMAIN_FIELDS}, tenants(name, slug)`, { count: "exact" }).eq("type", "custom");
  q = f.status ? q.eq("status", f.status) : q.neq("status", "removed");
  if (f.q) q = q.ilike("hostname", `%${f.q}%`);
  const { data, error, count: total } = await q.order("created_at", { ascending: false }).range(from, from + f.pageSize - 1);
  check(error);
  return { rows: (data ?? []).map(toDomainRow), total: total ?? 0 };
}

export async function customDomainStatusCounts(): Promise<Record<"pending" | "verified" | "failed", number>> {
  const supabase = await createSupabaseServerClient();
  const statuses = ["pending", "verified", "failed"] as const;
  const counts = await Promise.all(
    statuses.map(async (s) => {
      const { count: n, error } = await supabase.from("domains").select("id", { count: "exact", head: true }).eq("type", "custom").eq("status", s);
      check(error);
      return n ?? 0;
    }),
  );
  return { pending: counts[0] ?? 0, verified: counts[1] ?? 0, failed: counts[2] ?? 0 };
}

// ---- Feature flags ------------------------------------------------------------------

export type FeatureFlagRow = { key: string; description: string | null; defaultEnabled: boolean; createdAt: string; overridesOn: number; overridesOff: number };

export async function listFeatureFlags(opts: { withOverrideCounts?: boolean } = {}): Promise<FeatureFlagRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feature_flags").select("key, description, default_enabled, created_at").order("key").limit(200);
  check(error);
  const flags = data ?? [];
  const counts = opts.withOverrideCounts
    ? await Promise.all(
        flags.map(async (f) => {
          const [on, off] = await Promise.all(
            [true, false].map(async (enabled) => {
              const { count: n, error: e } = await supabase.from("tenant_feature_flags").select("tenant_id", { count: "exact", head: true }).eq("feature_key", f.key).eq("enabled", enabled);
              check(e);
              return n ?? 0;
            }),
          );
          return { on: on ?? 0, off: off ?? 0 };
        }),
      )
    : [];
  return flags.map((f, i) => ({
    key: f.key,
    description: f.description,
    defaultEnabled: f.default_enabled,
    createdAt: f.created_at,
    overridesOn: counts[i]?.on ?? 0,
    overridesOff: counts[i]?.off ?? 0,
  }));
}

export async function listTenantFlagOverrides(tenantId: string): Promise<Map<string, boolean>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tenant_feature_flags").select("feature_key, enabled").eq("tenant_id", tenantId);
  check(error, { tenantId });
  return new Map((data ?? []).map((r) => [r.feature_key, r.enabled]));
}

// ---- Plans --------------------------------------------------------------------------

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  limits: Json;
  features: Json;
  trialDays: number;
  active: boolean;
  sortOrder: number;
};

type PlanSelect = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  limits: Json;
  features: Json;
  trial_days: number;
  active: boolean;
  sort_order: number;
};

const PLAN_FIELDS = "id, code, name, description, price_monthly, price_yearly, limits, features, trial_days, active, sort_order";

function toPlanRow(p: PlanSelect): PlanRow {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: p.price_monthly,
    priceYearly: p.price_yearly,
    limits: p.limits,
    features: p.features,
    trialDays: p.trial_days,
    active: p.active,
    sortOrder: p.sort_order,
  };
}

/** Plans visible to the caller (all plans for platform.plans.manage; active ones otherwise). */
export async function listPlans(): Promise<PlanRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("plans").select(PLAN_FIELDS).order("sort_order").order("price_monthly").limit(100);
  check(error);
  return (data ?? []).map(toPlanRow);
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("plans").select(PLAN_FIELDS).eq("id", id).maybeSingle();
  check(error, { planId: id });
  return data ? toPlanRow(data) : null;
}

export async function tenantsPerPlan(planIds: readonly string[]): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const counts = await Promise.all(
    planIds.map(async (id) => {
      const { count: n, error } = await supabase.from("tenants").select("id", { count: "exact", head: true }).eq("plan_id", id);
      check(error);
      return [id, n ?? 0] as const;
    }),
  );
  return new Map(counts);
}

// ---- Platform users -----------------------------------------------------------------

export type PlatformUserRow = { userId: string; email: string | null; displayName: string | null; role: string; status: string; createdAt: string; createdByEmail: string | null };

export async function listPlatformUsers(): Promise<PlatformUserRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("platform_memberships").select("user_id, role, status, created_at, created_by").order("created_at").limit(500);
  check(error);
  const rows = data ?? [];
  const ids = rows.map((r) => r.user_id);
  const [emails, profiles] = await Promise.all([
    userEmails([...ids, ...rows.map((r) => r.created_by)]),
    ids.length ? supabase.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
  ]);
  check(profiles.error);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));
  return rows.map((r) => ({
    userId: r.user_id,
    email: emails.get(r.user_id) ?? null,
    displayName: names.get(r.user_id) ?? null,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    createdByEmail: r.created_by ? (emails.get(r.created_by) ?? null) : null,
  }));
}

// ---- Audit --------------------------------------------------------------------------

export type AuditFilter = z.infer<typeof auditFilterSchema>;
export type AuditRow = {
  id: number;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Json;
};

/** Converts a YYYY-MM-DD (India time) filter bound into an ISO timestamp. */
export function istDayBound(date: string, edge: "start" | "end"): string {
  const start = Date.parse(`${date}T00:00:00+05:30`);
  return new Date(edge === "start" ? start : start + 86_400_000).toISOString();
}

/** Newest first, keyset-free paging with a look-ahead row (no expensive COUNT on a big table). */
export async function listAuditLogs(f: Partial<AuditFilter> & { page?: number; pageSize?: number }): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 50;
  const supabase = await createSupabaseServerClient();

  let actorId: string | null = null;
  if (f.actor) {
    actorId = f.actor.includes("@") ? await findUserIdByEmail(f.actor) : f.actor;
    if (!actorId) return { rows: [], hasMore: false };
  }

  let q = supabase.from("audit_logs").select("id, created_at, tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, tenants(name)");
  if (f.tenant) q = q.eq("tenant_id", f.tenant);
  if (actorId) q = q.eq("actor_user_id", actorId);
  if (f.actorType) q = q.eq("actor_type", f.actorType);
  if (f.action) q = q.like("action", `${f.action}%`);
  if (f.from) q = q.gte("created_at", istDayBound(f.from, "start"));
  if (f.to) q = q.lt("created_at", istDayBound(f.to, "end"));
  const from = (page - 1) * pageSize;
  const { data, error } = await q.order("id", { ascending: false }).range(from, from + pageSize);
  check(error);
  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  const visible = rows.slice(0, pageSize);
  const emails = await userEmails(visible.map((r) => r.actor_user_id));
  return {
    hasMore,
    rows: visible.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      tenantId: r.tenant_id,
      tenantName: one(r.tenants)?.name ?? null,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_user_id ? (emails.get(r.actor_user_id) ?? null) : null,
      actorType: r.actor_type,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
    })),
  };
}

// ---- Settings -----------------------------------------------------------------------

export async function listPlatformSettings(): Promise<Map<string, { value: Json; updatedAt: string; updatedBy: string | null }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("platform_settings").select("key, value, updated_at, updated_by").order("key").limit(200);
  check(error);
  return new Map((data ?? []).map((r) => [r.key, { value: r.value, updatedAt: r.updated_at, updatedBy: r.updated_by }]));
}

// ---- Usage & storage ----------------------------------------------------------------

export type TenantLite = { id: string; name: string; slug: string; status: string; planName: string | null; limits: Json | null };

export async function getTenantsLite(ids: readonly string[]): Promise<Map<string, TenantLite>> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (unique.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tenants").select("id, name, slug, status, plans(name, limits)").in("id", unique);
  check(error);
  return new Map(
    (data ?? []).map((t) => {
      const plan = one(t.plans);
      return [t.id, { id: t.id, name: t.name, slug: t.slug, status: t.status, planName: plan?.name ?? null, limits: plan?.limits ?? null }];
    }),
  );
}

export type TopUsageRow = { tenantId: string; tenantName: string | null; value: number };

/** Top tenants by a usage metric for the current month (from tenant_usage). */
export async function topTenantsThisMonth(metric: "gmv" | "orders", limit = 10): Promise<TopUsageRow[]> {
  const [month] = recentMonthStarts(1);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_usage")
    .select("tenant_id, value, tenants(name)")
    .eq("metric", metric)
    .eq("period_start", month!)
    .order("value", { ascending: false })
    .limit(limit);
  check(error);
  return (data ?? []).map((r) => ({ tenantId: r.tenant_id, tenantName: one(r.tenants)?.name ?? null, value: Number(r.value) || 0 }));
}

// ---- Support ------------------------------------------------------------------------

export type SupportSessionRow = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  platformUserId: string;
  platformUserEmail: string | null;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
};

type SessionSelect = {
  id: string;
  tenant_id: string;
  platform_user_id: string;
  reason: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  tenants?: { name: string } | { name: string }[] | null;
};

function toSessionRow(s: SessionSelect, emails?: Map<string, string>): SupportSessionRow {
  return {
    id: s.id,
    tenantId: s.tenant_id,
    tenantName: one(s.tenants)?.name ?? null,
    platformUserId: s.platform_user_id,
    platformUserEmail: emails?.get(s.platform_user_id) ?? null,
    reason: s.reason,
    startedAt: s.started_at,
    expiresAt: s.expires_at,
    endedAt: s.ended_at,
  };
}

const SESSION_FIELDS = "id, tenant_id, platform_user_id, reason, started_at, expires_at, ended_at, tenants(name)";

/** The caller's own unexpired, not-ended support sessions (drives the admin banner). */
export async function getMyActiveSupportSessions(userId: string): Promise<SupportSessionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("support_sessions")
    .select(SESSION_FIELDS)
    .eq("platform_user_id", userId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(20);
  check(error);
  return (data ?? []).map((s) => toSessionRow(s));
}

export async function getMyActiveSupportSession(userId: string, tenantId: string): Promise<SupportSessionRow | null> {
  const sessions = await getMyActiveSupportSessions(userId);
  return sessions.find((s) => s.tenantId === tenantId) ?? null;
}

/** Recent sessions (all staff for platform.audit.read, otherwise only the caller's own — RLS). */
export async function listSupportSessions(opts: { tenantId?: string; limit?: number } = {}): Promise<SupportSessionRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("support_sessions").select(SESSION_FIELDS);
  if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
  const { data, error } = await q.order("started_at", { ascending: false }).limit(Math.min(opts.limit ?? 50, 200));
  check(error);
  const rows = data ?? [];
  const emails = await userEmails(rows.map((r) => r.platform_user_id));
  return rows.map((s) => toSessionRow(s, emails));
}
