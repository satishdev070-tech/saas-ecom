import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import type { sizeChartSchema } from "../schemas";
import { parseChart, type SizeChartData } from "../size-chart";

export type SizeChart = { id: string; name: string; unit: "in" | "cm"; chart: SizeChartData; productCount: number; updatedAt: string };

export async function listSizeCharts(tenantId: string, opts: { withCounts?: boolean } = {}): Promise<SizeChart[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("size_charts").select("id, name, unit, chart, updated_at").eq("tenant_id", tenantId).order("name").limit(500);
  if (error) throw mapDbError(error);
  const counts = new Map<string, number>();
  if (opts.withCounts && data?.length) {
    const { data: prods, error: pErr } = await supabase.from("products").select("size_chart_id").eq("tenant_id", tenantId).not("size_chart_id", "is", null).limit(20000);
    if (pErr) throw mapDbError(pErr);
    for (const p of prods ?? []) if (p.size_chart_id) counts.set(p.size_chart_id, (counts.get(p.size_chart_id) ?? 0) + 1);
  }
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, unit: c.unit === "cm" ? "cm" : "in", chart: parseChart(c.chart), productCount: counts.get(c.id) ?? 0, updatedAt: c.updated_at }));
}

export async function getSizeChart(tenantId: string, id: string): Promise<SizeChart | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("size_charts").select("id, name, unit, chart, updated_at").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) return null;
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("size_chart_id", id);
  return { id: data.id, name: data.name, unit: data.unit === "cm" ? "cm" : "in", chart: parseChart(data.chart), productCount: count ?? 0, updatedAt: data.updated_at };
}

export type SizeChartInput = z.infer<typeof sizeChartSchema>;

export async function saveSizeChart(tenantId: string, input: SizeChartInput): Promise<{ id: string; created: boolean }> {
  const supabase = await createSupabaseServerClient();
  const chart = { columns: input.chart.columns, rows: input.chart.rows, ...(input.chart.note ? { note: input.chart.note } : {}) };
  if (input.id) {
    const { data, error } = await supabase.from("size_charts").update({ name: input.name, unit: input.unit, chart }).eq("tenant_id", tenantId).eq("id", input.id).select("id");
    if (error) throw mapDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND");
    return { id: input.id, created: false };
  }
  const { data, error } = await supabase.from("size_charts").insert({ tenant_id: tenantId, name: input.name, unit: input.unit, chart }).select("id").single();
  if (error) throw mapDbError(error);
  return { id: data.id, created: true };
}

/** Deletes a chart; products using it simply lose their size chart (FK set null). */
export async function deleteSizeChart(tenantId: string, id: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("size_charts").delete().eq("tenant_id", tenantId).eq("id", id).select("name");
  if (error) throw mapDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
  return data[0]!.name;
}
