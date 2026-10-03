import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";
import { listMarketingDates } from "@/features/social/server/planner";
import { builtInDatesBetween, istDayKey } from "@/features/social/planner";
import { BRAND_LANGUAGES, EMPTY_BRAND, type BrandLanguage, type BrandProfile, type GenerationKind, type GenerationRow } from "../schemas";
import type { KeyDateBrief, ProductBrief, PromptContext, StoreBrief } from "../prompts";

/**
 * Reads for Neural Pulse. RLS server client, and every query is also filtered by the tenant id
 * the caller got from membership (never from the request).
 */

const DAY_MS = 86_400_000;

export async function getBrandProfile(tenantId: string): Promise<BrandProfile & { saved: boolean }> {
  const { data, error } = await (await createSupabaseServerClient()).from("brand_profiles").select("voice, audience, keywords, dos, donts, languages").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) return { ...EMPTY_BRAND, saved: false };
  const languages = data.languages.filter((l): l is BrandLanguage => (BRAND_LANGUAGES as readonly string[]).includes(l));
  return { voice: data.voice, audience: data.audience, keywords: data.keywords, dos: data.dos, donts: data.donts, languages: languages.length ? languages : ["en"], saved: true };
}

export async function getStoreBrief(tenantId: string): Promise<StoreBrief> {
  const supabase = await createSupabaseServerClient();
  const [{ data: store, error }, { data: cats, error: catErr }] = await Promise.all([
    supabase.from("stores").select("name, tagline, description, category_id").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("categories").select("name").eq("tenant_id", tenantId).eq("status", "active").order("position").limit(20),
  ]);
  if (error) throw mapDbError(error);
  if (catErr) throw mapDbError(catErr);
  let storeCategory: string | null = null;
  if (store?.category_id) {
    const { data } = await supabase.from("store_categories").select("name").eq("id", store.category_id).maybeSingle();
    storeCategory = data?.name ?? null;
  }
  return { name: store?.name ?? "My store", tagline: store?.tagline ?? null, description: store?.description ?? null, storeCategory, categories: (cats ?? []).map((c) => c.name) };
}

const priceMinor = (v: number | string | null): number | null => {
  if (v == null) return null;
  try {
    return toMinor(v);
  } catch {
    return null;
  }
};

/** Best sellers first (active products only). */
export async function getTopProducts(tenantId: string, limit = 12): Promise<ProductBrief[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("title, min_price, short_description, category_id").eq("tenant_id", tenantId).eq("status", "active").order("sales_count", { ascending: false }).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw mapDbError(error);
  const ids = [...new Set((data ?? []).map((p) => p.category_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: cats } = await supabase.from("categories").select("id, name").eq("tenant_id", tenantId).in("id", ids);
    for (const c of cats ?? []) names.set(c.id, c.name);
  }
  return (data ?? []).map((p) => ({ title: p.title, priceMinor: priceMinor(p.min_price), category: p.category_id ? (names.get(p.category_id) ?? null) : null, summary: p.short_description }));
}

/** One product of this store (for captions), or null. */
export async function getProductBrief(tenantId: string, productId: string): Promise<ProductBrief | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("title, min_price, short_description, category_id, status").eq("tenant_id", tenantId).eq("id", productId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data || data.status === "archived") return null;
  let category: string | null = null;
  if (data.category_id) category = (await supabase.from("categories").select("name").eq("tenant_id", tenantId).eq("id", data.category_id).maybeSingle()).data?.name ?? null;
  return { title: data.title, priceMinor: priceMinor(data.min_price), category, summary: data.short_description };
}

/** Store key dates plus built-in occasions in the next `days` days (IST). */
export async function getUpcomingDates(tenantId: string, days = 45, from: Date = new Date()): Promise<KeyDateBrief[]> {
  const fromDay = istDayKey(from.toISOString());
  const toDay = istDayKey(new Date(from.getTime() + days * DAY_MS).toISOString());
  const own = await listMarketingDates(tenantId, fromDay, toDay);
  return [...own, ...builtInDatesBetween(fromDay, toDay)].sort((a, b) => a.onDate.localeCompare(b.onDate)).map((d) => ({ title: d.title, onDate: d.onDate, kind: d.kind }));
}

/** Everything a generator needs. `datesFrom`/`dateDays` widen the key-date window (content plans). */
export async function loadPromptContext(tenantId: string, opts: { datesFrom?: Date; dateDays?: number; brand?: BrandProfile } = {}): Promise<PromptContext> {
  const [store, brand, products, dates] = await Promise.all([getStoreBrief(tenantId), opts.brand ? Promise.resolve(opts.brand) : getBrandProfile(tenantId), getTopProducts(tenantId), getUpcomingDates(tenantId, opts.dateDays ?? 45, opts.datesFrom)]);
  return { store, brand, products, dates, today: istDayKey(new Date().toISOString()) };
}

export async function listGenerations(tenantId: string, limit = 30): Promise<GenerationRow[]> {
  const { data, error } = await (await createSupabaseServerClient()).from("ai_generations").select("id, kind, provider, model, tokens, created_at, input, output").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw mapDbError(error);
  return (data ?? []).map((g) => ({ id: g.id, kind: g.kind as GenerationKind, provider: g.provider, model: g.model, tokens: g.tokens, createdAt: g.created_at, input: g.input, output: g.output }));
}

/** Generations used today (IST day) for the usage meter. The rate limiter is the enforcement. */
export async function countGenerationsToday(tenantId: string): Promise<number> {
  const startIst = `${istDayKey(new Date().toISOString())}T00:00:00+05:30`;
  const { count, error } = await (await createSupabaseServerClient()).from("ai_generations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", new Date(Date.parse(startIst)).toISOString());
  if (error) throw mapDbError(error);
  return count ?? 0;
}
