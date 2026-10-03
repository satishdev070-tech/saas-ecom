import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatform } from "@/lib/platform/access";

export type StoreConfiguration = {
  theme: { key: string; version: number; publishedAt: string | null } | null;
  codEnabled: boolean;
  defaultCourier: string | null;
  integrations: { provider: string; kind: string; enabled: boolean; environment: string; status: string; lastVerifiedAt: string | null }[];
};

/**
 * Super-admin configuration summary for one store. tenant_integrations has no RLS policies, so
 * this uses the secret-key client (ADR-006 platform read) AFTER re-checking the platform
 * permission, and selects status columns only: public_config and secrets are never read here.
 */
export async function getStoreConfiguration(tenantId: string): Promise<StoreConfiguration> {
  await requirePlatform("platform.tenants.read");
  const admin = createSupabaseAdminClient();
  const [theme, store, integrations] = await Promise.all([
    admin.from("theme_versions").select("theme_key, version, published_at").eq("tenant_id", tenantId).eq("status", "published").maybeSingle(),
    admin.from("stores").select("cod_settings, integrations").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenant_integrations").select("provider, kind, enabled, environment, status, last_verified_at").eq("tenant_id", tenantId).order("provider"),
  ]);
  const cod = (store.data?.cod_settings ?? {}) as { enabled?: boolean };
  const courier = (store.data?.integrations as { default_courier?: string } | null)?.default_courier ?? null;
  const rows = integrations.data ?? [];
  const liveCouriers = rows.filter((r) => r.kind === "shipping" && r.enabled && r.status === "connected").map((r) => r.provider);
  return {
    theme: theme.data ? { key: theme.data.theme_key, version: theme.data.version, publishedAt: theme.data.published_at } : null,
    codEnabled: cod.enabled !== false,
    defaultCourier: liveCouriers.length ? (courier && liveCouriers.includes(courier) ? courier : liveCouriers[0]!) : null,
    integrations: rows.map((r) => ({ provider: r.provider, kind: r.kind, enabled: r.enabled, environment: r.environment, status: r.status, lastVerifiedAt: r.last_verified_at })),
  };
}
