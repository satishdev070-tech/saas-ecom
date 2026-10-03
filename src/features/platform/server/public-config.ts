import "server-only";
import type { Metadata } from "next";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import sharp from "sharp";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";
import { sniffImage } from "@/lib/storage/upload";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { assertPlatformPermission, type PlatformContext } from "@/lib/platform/access";
import { audit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import {
  BRANDING_BUCKET,
  DEFAULT_PUBLIC_CONFIG,
  brandImageUrl,
  checkBrandImageSize,
  maxBytesFor,
  brandSlotKey,
  isIco,
  parseBrandImage,
  parsePublicConfig,
  type BrandImage,
  type BrandSlot,
  type PublicPlatformConfig,
} from "../public-config";

function platformAudit(ctx: PlatformContext, entry: { action: `${string}.${string}`; entityType: string; entityId: string; metadata?: Record<string, Json | undefined> }) {
  return audit({ tenantId: null, actorUserId: ctx.user.id, actorType: "platform", ...entry });
}

export const PUBLIC_CONFIG_TAG = "platform-public-config";

class PublicConfigUnavailable extends Error {}

async function load(): Promise<PublicPlatformConfig> {
  // Anon client + RLS (platform_settings_public_select): only `public.*` keys are visible.
  const { data, error } = await createSupabasePublicClient().from("platform_settings").select("key, value").like("key", "public.%").limit(100);
  if (error) {
    logger.warn("platform.public_config_unavailable", { code: error.code });
    throw new PublicConfigUnavailable(); // not cached; defaults are used below
  }
  return parsePublicConfig(data ?? []);
}

const cached = process.env.NODE_ENV === "production" ? unstable_cache(load, ["platform-public-config"], { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 }) : load;

/** Logos, favicon, GA4 id and switches. Never throws: any failure means today's defaults. */
export const getPublicPlatformConfig = cache(async (): Promise<PublicPlatformConfig> => {
  try {
    return await cached();
  } catch {
    return DEFAULT_PUBLIC_CONFIG;
  }
});

export type BrandImageView = { src: string; width: number | null; height: number | null };

export function brandImageView(image: BrandImage | null): BrandImageView | null {
  if (!image) return null;
  try {
    return { src: brandImageUrl(publicEnv().NEXT_PUBLIC_SUPABASE_URL, image), width: image.width, height: image.height };
  } catch {
    return null; // env not available (e.g. a build without env): fall back to the wordmark
  }
}

/** After any public.* change: refresh the cached config and every page that renders it. */
export function revalidatePublicConfig() {
  revalidateTag(PUBLIC_CONFIG_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

/** Turns storage errors into something an admin can act on (the usual cause: migration 2500 not applied). */
function storageError(message: string): AppError {
  const missing = /bucket not found/i.test(message);
  logger.warn("platform.branding_upload_failed", { error: message });
  return new AppError("VALIDATION", {
    fieldErrors: {
      file: [
        missing
          ? "The “platform-branding” storage bucket doesn't exist yet. Run supabase/dev/apply-2500.sql in the Supabase SQL editor, then upload again."
          : `Storage refused the upload (${message.slice(0, 120)}). If this persists, re-run supabase/dev/apply-2500.sql, which sets the bucket's permissions.`,
      ],
    },
  });
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Uploads a logo / favicon to the public branding bucket with the signed-in admin's client (the
 * storage policy checks platform.settings.manage too) and points the setting at it. The previous
 * file is removed afterwards. SVG is not accepted (script risk).
 */
export async function uploadBrandImage(ctx: PlatformContext, slot: BrandSlot, file: File): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const fail = (message: string) => new AppError("VALIDATION", { fieldErrors: { file: [message] } });
  if (!(file instanceof File) || file.size === 0) throw fail("Choose an image to upload");
  if (file.size > maxBytesFor(slot)) throw fail(`Images must be ${maxBytesFor(slot) / 1024 / 1024} MB or smaller`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  let mime: string;
  let ext: string;
  if (sniffed && EXT[sniffed.mime]) {
    mime = sniffed.mime;
    ext = EXT[sniffed.mime]!;
  } else if (slot === "favicon" && isIco(bytes)) {
    mime = "image/x-icon";
    ext = "ico";
  } else {
    throw fail(slot === "favicon" ? "Use a PNG, ICO, JPG or WebP file" : "Use a PNG, JPG or WebP file (SVG isn't accepted)");
  }
  let width: number | null = null;
  let height: number | null = null;
  if (ext !== "ico") {
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      throw fail("That image couldn't be read");
    }
    const sizeError = checkBrandImageSize(slot, width, height);
    if (sizeError) throw fail(sizeError);
  }
  // Logos often ship with wide transparent/white margins, which make them look tiny in a 48px
  // header. Trim borders of the corner colour so the visible mark fills the height.
  let body: Uint8Array = bytes;
  if (slot === "header_logo" || slot === "footer_logo") {
    try {
      const { data, info } = await sharp(bytes).trim({ threshold: 12 }).toFormat(ext === "jpg" ? "jpeg" : (ext as "png" | "webp")).toBuffer({ resolveWithObject: true });
      if (info.width >= 16 && info.height >= 16) {
        body = new Uint8Array(data);
        width = info.width;
        height = info.height;
      }
    } catch {
      // Nothing to trim (or a single-colour image): keep the original.
    }
  }

  const supabase = await createSupabaseServerClient();
  const path = `branding/${slot}/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BRANDING_BUCKET).upload(path, body, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (upErr) throw storageError(upErr.message);

  const key = brandSlotKey(slot);
  const { data: before } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const value: BrandImage = { path, width, height };
  const { error } = await supabase.from("platform_settings").upsert({ key, value: value as unknown as Json, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    await supabase.storage.from(BRANDING_BUCKET).remove([path]);
    throw new AppError("VALIDATION", { fieldErrors: { file: ["The image uploaded but couldn't be saved as a setting. Check that you have the platform settings permission."] }, context: { db: error.message } });
  }
  const old = parseBrandImage(before?.value);
  if (old && old.path !== path) await supabase.storage.from(BRANDING_BUCKET).remove([old.path]);
  await platformAudit(ctx, { action: "platform_branding.updated", entityType: "platform_setting", entityId: key, metadata: { slot, width, height, replaced: Boolean(old) } });
}

/** Removes a logo / favicon; the site falls back to the text wordmark / default icon. */
export async function clearBrandImage(ctx: PlatformContext, slot: BrandSlot): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const supabase = await createSupabaseServerClient();
  const key = brandSlotKey(slot);
  const { data: before } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const { error } = await supabase.from("platform_settings").delete().eq("key", key);
  if (error) throw new AppError("INTERNAL", { cause: error });
  const old = parseBrandImage(before?.value);
  if (old) await supabase.storage.from(BRANDING_BUCKET).remove([old.path]);
  await platformAudit(ctx, { action: "platform_branding.cleared", entityType: "platform_setting", entityId: key, metadata: { slot } });
}

/** Favicon metadata for platform pages (marketing, seller auth, onboarding); undefined keeps the default icon. */
/** Absolute URL of the uploaded social share image, or null (the generated /og image is used). */
export async function shareImageUrl(): Promise<string | null> {
  return brandImageView((await getPublicPlatformConfig()).ogImage)?.src ?? null;
}

export async function platformIconMetadata(): Promise<Metadata> {
  const favicon = brandImageView((await getPublicPlatformConfig()).favicon);
  return favicon ? { icons: { icon: favicon.src, apple: favicon.src } } : {};
}
