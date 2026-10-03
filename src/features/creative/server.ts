import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assetUrl, STORE_ASSETS_BUCKET } from "@/lib/storage/assets";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { getPublishedThemeConfig } from "@/features/theme/server/queries";
import { renderCreativeSvg, type Brand, type CreativeTemplate, type CreativeValues, type TemplateSpec } from "./engine";
import { BUILTIN_TEMPLATES } from "./templates";

const SERIF_FONTS = new Set(["editorial-serif", "classic-serif", "didone", "playfair", "marcellus"]);

/** Latest active version of each template (RLS: readable by signed-in users). Falls back to the built-ins before the seed migration runs. */
export async function listCreativeTemplates(): Promise<CreativeTemplate[]> {
  const { data, error } = await (await createSupabaseServerClient()).from("creative_templates").select("key, version, name, category, width, height, elements").eq("active", true).order("key").order("version", { ascending: false });
  if (error || !data?.length) {
    if (error) logger.warn("creative.templates_unavailable", { error: error.message });
    return BUILTIN_TEMPLATES;
  }
  const latest = new Map<string, CreativeTemplate>();
  for (const r of data) if (!latest.has(r.key)) latest.set(r.key, { key: r.key, version: r.version, name: r.name, category: r.category, width: r.width, height: r.height, spec: r.elements as unknown as TemplateSpec });
  return [...latest.values()];
}

/** Brand kit from the store profile + published theme (colours, font style, logo). */
export async function getBrand(tenantId: string): Promise<Brand & { logoPath: string | null }> {
  const [{ data: store }, theme] = await Promise.all([(await createSupabaseServerClient()).from("stores").select("name, logo_path").eq("tenant_id", tenantId).single(), getPublishedThemeConfig(tenantId)]);
  const c = theme.tokens.colors;
  return {
    name: store?.name ?? "Store",
    colors: { primary: c.primary, secondary: c.secondary, accent: c.accent, background: c.background, text: c.text, sale: c.sale },
    headingSerif: SERIF_FONTS.has(theme.tokens.headingFont),
    bodySerif: SERIF_FONTS.has(theme.tokens.bodyFont),
    logoHref: assetUrl(store?.logo_path ?? null),
    logoPath: store?.logo_path ?? null,
  };
}

async function dataUri(tenantId: string, path: string | null): Promise<string | null> {
  if (!path || !path.startsWith(`tenant/${tenantId}/`)) return null;
  const url = assetUrl(path);
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  // Normalise to PNG so every image format renders identically inside the SVG.
  const png = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Renders to PNG and saves it into the media library (folder "creative"). Returns the storage path. */
export async function renderAndStore(tenantId: string, t: CreativeTemplate, values: CreativeValues, imagePath: string | null, name: string): Promise<{ path: string; bytes: number }> {
  const brand = await getBrand(tenantId);
  const [image, logo] = await Promise.all([dataUri(tenantId, imagePath), dataUri(tenantId, brand.logoPath)]);
  const svg = renderCreativeSvg(t, { ...brand, logoHref: logo }, values, image);
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toBuffer();
  } catch (err) {
    logger.error("creative.render_failed", { tenantId, template: t.key, error: err });
    throw new AppError("INTERNAL", { message: "The design couldn't be rendered. Try a different image." });
  }
  const path = `tenant/${tenantId}/creative/${randomUUID()}.png`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(STORE_ASSETS_BUCKET).upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  if (error) throw new AppError("FORBIDDEN", { message: "Saving the image wasn't permitted.", context: { storage: error.message } });
  const { error: dbError } = await supabase.from("media_assets").insert({ tenant_id: tenantId, storage_path: path, mime_type: "image/png", bytes: png.length, filename: `${name.slice(0, 80)}.png`, folder: "creative", width: t.width, height: t.height });
  if (dbError) throw new AppError("INTERNAL", { context: { db: dbError.message } });
  return { path, bytes: png.length };
}
