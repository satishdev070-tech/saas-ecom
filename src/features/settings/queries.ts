import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import type { Tables } from "@/lib/supabase/database.types";

/** Store profile row for the active tenant (RLS: store.read). Memoised per request. */
export const getStoreProfile = cache(async (tenantId: string): Promise<Tables<"stores">> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("stores").select("*").eq("tenant_id", tenantId).single();
  if (error) throw mapDbError(error, { tenantId });
  return data;
});

export async function listShippingRates(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("shipping_rates").select("*").eq("tenant_id", tenantId).order("position").order("name");
  if (error) throw mapDbError(error);
  return data;
}

export async function listPincodeRules(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("pincode_rules").select("*").eq("tenant_id", tenantId).order("prefix");
  if (error) throw mapDbError(error);
  return data;
}

export async function listNotificationTemplates(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("notification_templates").select("*").eq("tenant_id", tenantId);
  if (error) throw mapDbError(error);
  return data;
}

