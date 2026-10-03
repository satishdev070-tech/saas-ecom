import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { cachedStorefront, storefrontTag } from "@/lib/cache/storefront";
import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_THEME_CONFIG } from "../default-theme";
import { resolveThemeConfig, type ThemeConfig, type ThemeIssue } from "../schema/config";
import { PREVIEW_COOKIE } from "../preview";
import { verifyPreviewToken } from "./preview";
import { THEME_PREVIEW_HEADER } from "@/lib/tenant/routing";
import { findMarketplaceTheme } from "../marketplace/catalog";
import { applyThemePreset } from "../marketplace/apply";
import { canPreviewThemes } from "../marketplace/showcase";

/** Raw published row, cached across requests per tenant (public data; invalidated on publish/rollback). */
const loadPublishedThemeRow = cachedStorefront(
  "published-theme",
  async (tenantId: string): Promise<{ id: string; config: Json } | null> => {
    const { data, error } = await createSupabasePublicClient()
      .from("theme_versions")
      .select("id, config")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .maybeSingle();
    // Errors throw out of the cache (never cached as "no theme"); the caller falls back.
    if (error) throw new Error(error.message);
    return data;
  },
  (tenantId) => [storefrontTag(tenantId)],
);

/**
 * The tenant's PUBLISHED theme, validated through the render-time parser (never throws;
 * invalid sections are skipped). Falls back to the default "Aangan" theme when nothing is
 * published. Anonymous client: theme_public RLS only exposes published rows of open tenants.
 */
export const getPublishedThemeConfig = cache(async (tenantId: string): Promise<ThemeConfig> => {
  let data: { id: string; config: Json } | null;
  try {
    data = await loadPublishedThemeRow(tenantId);
  } catch (e) {
    logger.error("theme.published_load_failed", { tenantId, error: e instanceof Error ? e.message : String(e) });
    return DEFAULT_THEME_CONFIG;
  }
  if (!data) return DEFAULT_THEME_CONFIG;
  const { config, issues } = resolveThemeConfig(data.config);
  if (issues.length) logger.warn("theme.render_issues", { tenantId, versionId: data.id, issues: issues.slice(0, 10) });
  return config;
});

/**
 * The DRAFT config, read with the secret-key client because drafts are staff-only under RLS
 * and the preview iframe carries no seller session. Only called after verifyPreviewToken()
 * proved a theme.edit member of THIS tenant asked for the preview (ADR-006: signed token).
 */
async function getDraftThemeConfig(tenantId: string): Promise<ThemeConfig | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("theme_versions")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .maybeSingle();
  if (error) {
    logger.error("theme.draft_load_failed", { tenantId, error: error.message });
    return null;
  }
  return data ? resolveThemeConfig(data.config).config : null;
}

export type StorefrontTheme = {
  config: ThemeConfig;
  preview: boolean;
  /** Marketplace theme rendered in memory on a demo store (Live Preview); never persisted. */
  themePreview: { key: string; name: string } | null;
};

/**
 * Theme for a storefront request: the draft when a valid preview cookie for this tenant is
 * present, otherwise the published theme. On a showcase (demo) tenant a Live Preview key swaps
 * in a marketplace theme, built in memory from the published content: no database writes, and
 * ignored for every other tenant. Memoised per request (layout + page share it).
 */
export const getStorefrontTheme = cache(async (tenantId: string, slug = ""): Promise<StorefrontTheme> => {
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (token && verifyPreviewToken(token, tenantId)) {
    const draft = await getDraftThemeConfig(tenantId);
    return { config: draft ?? (await getPublishedThemeConfig(tenantId)), preview: true, themePreview: null };
  }
  const published = await getPublishedThemeConfig(tenantId);
  const key = (await headers()).get(THEME_PREVIEW_HEADER);
  const theme = key && canPreviewThemes({ tenantId, slug }) ? findMarketplaceTheme(key) : undefined;
  if (theme) {
    const { config, issues } = resolveThemeConfig(applyThemePreset(published, theme.preset));
    if (issues.length) logger.warn("theme.live_preview_issues", { tenantId, key, issues: issues.slice(0, 5) });
    return { config, preview: false, themePreview: { key: theme.key, name: theme.name } };
  }
  return { config: published, preview: false, themePreview: null };
});

// -----------------------------------------------------------------------------
// Editor (seller session; RLS theme_staff_read requires theme.edit)
// -----------------------------------------------------------------------------

export type ThemeVersionSummary = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  label: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ThemeEditorData = {
  /** What the editor starts from: the draft, else the published config, else the default theme. */
  config: ThemeConfig;
  source: "draft" | "published" | "default";
  /** Draft updated_at for optimistic concurrency (null when no draft row exists yet). */
  draftUpdatedAt: string | null;
  /** Problems found in the stored draft (sections that will be dropped on the next save). */
  issues: ThemeIssue[];
  published: ThemeVersionSummary | null;
  history: ThemeVersionSummary[];
};

type VersionRow = {
  id: string;
  version: number;
  status: string;
  label: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const toSummary = (r: VersionRow): ThemeVersionSummary => ({
  id: r.id,
  version: r.version,
  status: r.status as ThemeVersionSummary["status"],
  label: r.label,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  publishedAt: r.published_at,
});

export async function getThemeEditorData(tenantId: string): Promise<ThemeEditorData> {
  const supabase = await createSupabaseServerClient();
  const [{ data: rows, error }, { data: current, error: currentError }] = await Promise.all([
    supabase
      .from("theme_versions")
      .select("id, version, status, label, created_at, updated_at, published_at")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(40),
    supabase.from("theme_versions").select("status, config, updated_at").eq("tenant_id", tenantId).in("status", ["draft", "published"]),
  ]);
  if (error || currentError) throw new AppError("INTERNAL", { context: { db: error?.message ?? currentError?.message } });

  const versions = (rows ?? []).map(toSummary);
  const draftRow = current?.find((r) => r.status === "draft");
  const publishedRow = current?.find((r) => r.status === "published");
  const published = versions.find((v) => v.status === "published") ?? null;
  const history = versions.filter((v) => v.status !== "draft");

  if (draftRow) {
    const { config, issues } = resolveThemeConfig(draftRow.config);
    return { config, source: "draft", draftUpdatedAt: draftRow.updated_at, issues, published, history };
  }
  if (publishedRow) {
    return { config: resolveThemeConfig(publishedRow.config).config, source: "published", draftUpdatedAt: null, issues: [], published, history };
  }
  return { config: DEFAULT_THEME_CONFIG, source: "default", draftUpdatedAt: null, issues: [], published, history };
}

export type PickerOption = { value: string; label: string };
export type EditorPickers = {
  collection: PickerOption[];
  category: PickerOption[];
  product: PickerOption[];
  page: PickerOption[];
  blogPost: PickerOption[];
  menu: PickerOption[];
};

/** Options for the editor's collection/category/product/page/blog/menu pickers (seller session, RLS). */
export async function getEditorPickers(tenantId: string): Promise<EditorPickers> {
  const supabase = await createSupabaseServerClient();
  const [collections, categories, products, pages, posts, menus] = await Promise.all([
    supabase.from("collections").select("id, title").eq("tenant_id", tenantId).order("position").limit(300),
    supabase.from("categories").select("id, name, parent_id").eq("tenant_id", tenantId).order("position").limit(300),
    supabase.from("products").select("id, title, status").eq("tenant_id", tenantId).neq("status", "archived").order("updated_at", { ascending: false }).limit(500),
    supabase.from("pages").select("id, title").eq("tenant_id", tenantId).order("title").limit(200),
    supabase.from("blog_posts").select("id, title").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    supabase.from("menus").select("handle, title").eq("tenant_id", tenantId).order("title").limit(50),
  ]);
  for (const r of [collections, categories, products, pages, posts, menus]) {
    if (r.error) logger.warn("theme.pickers_failed", { tenantId, error: r.error.message });
  }
  return {
    collection: (collections.data ?? []).map((c) => ({ value: c.id, label: c.title })),
    category: (categories.data ?? []).map((c) => ({ value: c.id, label: c.parent_id ? `— ${c.name}` : c.name })),
    product: (products.data ?? []).map((p) => ({ value: p.id, label: p.status === "draft" ? `${p.title} (draft)` : p.title })),
    page: (pages.data ?? []).map((p) => ({ value: p.id, label: p.title })),
    blogPost: (posts.data ?? []).map((p) => ({ value: p.id, label: p.title })),
    menu: (menus.data ?? []).map((m) => ({ value: m.handle, label: `${m.title} (${m.handle})` })),
  };
}

/** theme_key of the store's draft and published versions (marketplace "current theme" badges). */
export async function getThemeKeys(tenantId: string): Promise<{ published: string | null; draft: string | null }> {
  const { data } = await (await createSupabaseServerClient()).from("theme_versions").select("status, theme_key").eq("tenant_id", tenantId).in("status", ["draft", "published"]);
  return { published: data?.find((r) => r.status === "published")?.theme_key ?? null, draft: data?.find((r) => r.status === "draft")?.theme_key ?? null };
}
