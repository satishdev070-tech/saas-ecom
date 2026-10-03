import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { resolveStorefrontTenant } from "@/lib/tenant/resolve";
import { storefrontAvailability, type ResolvedTenant } from "@/lib/tenant/context";
import { logger } from "@/lib/observability/logger";
import { cachedStorefront, storefrontTag } from "@/lib/cache/storefront";
import { getStorefrontTheme } from "@/features/theme/server/queries";
import type { ThemeConfig } from "@/features/theme/schema/config";
import { readCodSettings, type CodSettings } from "../delivery";
import { readSeo, type SeoFields } from "../seo";
import { readAddress, readSocialLinks, type SocialLink, type StoreAddress } from "../store-profile";

/**
 * Per-request storefront context: tenant (from the verified host), public store profile,
 * active theme (published, or draft under a verified preview) and feature flags.
 * Everything is memoised with React cache() so the layout and page share one lookup; the public
 * reads (profile, features, published theme, directory) are also cached across requests per tenant
 * (lib/cache/storefront). Draft preview and Live Preview are resolved per request, never cached.
 */

export type StoreProfile = {
  name: string;
  tagline: string | null;
  description: string | null;
  logoPath: string | null;
  faviconPath: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: StoreAddress;
  social: SocialLink[];
  seo: SeoFields;
  cod: CodSettings;
};

export type StoreFeatures = { blog: boolean; storeLocator: boolean; reviews: boolean; cod: boolean };

export type Storefront = {
  tenant: ResolvedTenant;
  store: StoreProfile;
  theme: ThemeConfig;
  preview: boolean;
  /** Marketplace Live Preview on a demo store (in memory only). */
  themePreview: { key: string; name: string } | null;
  features: StoreFeatures;
};

const STORE_PROFILE_COLUMNS = "name, tagline, description, logo_path, favicon_path, email, phone, whatsapp, address, social, seo, cod_settings";

/** Raw public store row, cached per tenant. Errors throw (never cached) and fall back below. */
const loadStoreRow = cachedStorefront(
  "store-profile",
  async (tenantId: string) => {
    const { data, error } = await createSupabasePublicClient().from("stores").select(STORE_PROFILE_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  (tenantId) => [storefrontTag(tenantId)],
);

export const getStoreProfile = cache(async (tenantId: string, fallbackName: string): Promise<StoreProfile> => {
  let data: Awaited<ReturnType<typeof loadStoreRow>> = null;
  try {
    data = await loadStoreRow(tenantId);
  } catch (e) {
    logger.error("storefront.store_profile_failed", { tenantId, error: e instanceof Error ? e.message : String(e) });
  }
  return {
    name: data?.name ?? fallbackName,
    tagline: data?.tagline ?? null,
    description: data?.description ?? null,
    logoPath: data?.logo_path ?? null,
    faviconPath: data?.favicon_path ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    whatsapp: data?.whatsapp ?? null,
    address: readAddress(data?.address),
    social: readSocialLinks(data?.social),
    seo: readSeo(data?.seo),
    cod: readCodSettings(data?.cod_settings),
  };
});

/** Raw storefront_features() result, cached per tenant (plan/flag changes invalidate it). */
const loadFeatures = cachedStorefront(
  "store-features",
  async (tenantId: string) => {
    const { data, error } = await createSupabasePublicClient().rpc("storefront_features", { p_tenant: tenantId });
    if (error) throw new Error(error.message);
    return data;
  },
  (tenantId) => [storefrontTag(tenantId)],
);

export const getStoreFeatures = cache(async (tenantId: string): Promise<StoreFeatures> => {
  let data: Awaited<ReturnType<typeof loadFeatures>> | null = null;
  try {
    data = await loadFeatures(tenantId);
  } catch (e) {
    logger.warn("storefront.features_failed", { tenantId, error: e instanceof Error ? e.message : String(e) });
  }
  const f = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { blog: f.blog !== false, storeLocator: f.store_locator === true, reviews: f.reviews !== false, cod: f.cod !== false };
});

/** Storefront for an OPEN tenant, or null (unknown host, suspended, cancelled). */
export const getStorefront = cache(async (host: string): Promise<Storefront | null> => {
  const tenant = await resolveStorefrontTenant(host);
  if (!tenant || storefrontAvailability(tenant.status) !== "open") return null;
  const [store, theme, features] = await Promise.all([
    getStoreProfile(tenant.tenantId, tenant.name),
    getStorefrontTheme(tenant.tenantId, tenant.slug),
    getStoreFeatures(tenant.tenantId),
  ]);
  return { tenant, store, theme: theme.config, preview: theme.preview, themePreview: theme.themePreview, features };
});

/** For pages: the open storefront or the (generic) 404. */
export async function requireStorefront(host: string): Promise<Storefront> {
  const sf = await getStorefront(host);
  if (!sf) notFound();
  return sf;
}
