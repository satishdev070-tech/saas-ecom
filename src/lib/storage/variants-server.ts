import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { STORE_ASSETS_BUCKET, assetUrl } from "./assets";
import { VARIANT_WIDTHS, isVariantable, variantPath, type VariantWidth } from "./variants";

const CACHE = "31536000"; // variants are immutable: a new upload gets a new path

/** WebP copy of `bytes` at most `width` px wide (never enlarged), EXIF-rotated. */
export async function renderVariant(bytes: Uint8Array | Buffer, width: VariantWidth): Promise<Buffer> {
  return sharp(bytes, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
}

/**
 * Makes every variant of a just-uploaded image with the uploader's client (same storage policy
 * as the original). Best effort: anything missing is made on first request by /api/img.
 */
export async function createVariantsOnUpload(client: SupabaseClient, path: string, bytes: Uint8Array): Promise<void> {
  if (!isVariantable(path)) return;
  await Promise.all(
    VARIANT_WIDTHS.map(async (w) => {
      try {
        const out = await renderVariant(bytes, w);
        // Never overwrite: a fresh upload path has no copies yet (and overwriting needs the update policy).
        const { error } = await client.storage.from(STORE_ASSETS_BUCKET).upload(variantPath(path, w), out, { contentType: "image/webp", cacheControl: CACHE, upsert: false });
        if (error) logger.warn("media.variant_upload_failed", { path, width: w, error: error.message });
      } catch (err) {
        logger.warn("media.variant_failed", { path, width: w, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
}

/**
 * Public URL of the `width` variant of `path`, creating it from the original if it doesn't exist
 * yet (images uploaded before variants existed). Uses the secret-key client: it only ever writes a
 * derived copy next to an existing public original (ADR-006 addendum). Null if the original is
 * missing or can't be decoded.
 */
export async function ensureVariant(path: string, width: VariantWidth): Promise<string | null> {
  const target = variantPath(path, width);
  const targetUrl = assetUrl(target);
  const originalUrl = assetUrl(path);
  if (!targetUrl || !originalUrl) return null;
  const head = await fetch(targetUrl, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (head?.ok) return targetUrl;
  const res = await fetch(originalUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > 25 * 1024 * 1024) return null;
  const out = await renderVariant(Buffer.from(await res.arrayBuffer()), width);
  const { error } = await createSupabaseAdminClient().storage.from(STORE_ASSETS_BUCKET).upload(target, out, { contentType: "image/webp", cacheControl: CACHE, upsert: true });
  if (error) {
    logger.warn("media.variant_store_failed", { path, width, error: error.message });
    return null;
  }
  return targetUrl;
}
