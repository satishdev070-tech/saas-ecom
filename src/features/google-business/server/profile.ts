import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { storePrimaryHost } from "@/features/integrations/server/store";
import type { GbpLocation, StoreProfile } from "../gbp";
import { getLocation, listLocations, type LocationChoice, type Result } from "./api";
import { gbpAccess, recordGbpStatus } from "./connection";

/** The store's own profile (RLS reads as the signed-in member), shaped for the completeness check. */
export async function loadStoreProfile(tenantId: string, tenantSlug: string): Promise<StoreProfile> {
  const supabase = await createSupabaseServerClient();
  const [{ data: store }, { data: loc }, { count }, host] = await Promise.all([
    supabase.from("stores").select("name, description, tagline, phone, address, logo_path, store_categories(name)").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("store_locations").select("hours, phone").eq("tenant_id", tenantId).eq("active", true).order("position").limit(1).maybeSingle(),
    supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).like("mime_type", "image/%"),
    storePrimaryHost(tenantId),
  ]);
  const cat = store?.store_categories as { name: string } | { name: string }[] | null | undefined;
  const address = store?.address && typeof store.address === "object" && !Array.isArray(store.address) ? (store.address as StoreProfile["address"]) : null;
  return {
    name: store?.name ?? "",
    address,
    phone: store?.phone ?? loc?.phone ?? null,
    hours: loc?.hours ?? null,
    description: store?.description ?? store?.tagline ?? null,
    category: (Array.isArray(cat) ? cat[0]?.name : cat?.name) ?? null,
    website: storeOrigin(host ?? storeSubdomain(tenantSlug)),
    photos: (count ?? 0) + (store?.logo_path ? 1 : 0),
  };
}

/** Live listing for the chosen location; marks the connection expired when Google says so. */
export async function loadConnectedLocation(tenantId: string): Promise<Result<GbpLocation> | null> {
  const access = await gbpAccess(tenantId);
  if (!access.ok) return null;
  if (!access.data.location) return null;
  const r = await getLocation(access.data.token, access.data.location);
  if (!r.ok && r.expired) await recordGbpStatus(tenantId, "expired", r.message);
  return r;
}

export async function loadLocationChoices(tenantId: string): Promise<Result<LocationChoice[]>> {
  const access = await gbpAccess(tenantId);
  if (!access.ok) return access;
  return listLocations(access.data.token);
}
