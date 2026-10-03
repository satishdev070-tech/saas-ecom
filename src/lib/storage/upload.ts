import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { STORE_ASSETS_BUCKET } from "./assets";

export const UPLOAD_AREAS = ["products", "collections", "categories", "theme", "pages", "blog", "brand", "media"] as const;
export type UploadArea = (typeof UPLOAD_AREAS)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: "image/webp", ext: "webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { mime: "image/avif", ext: "avif", test: (b) => String.fromCharCode(...b.slice(4, 12)).startsWith("ftypavi") },
];

/** Detects the real image type from magic bytes. SVG is deliberately not accepted (script risk). */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const sig = SIGNATURES.find((s) => s.test(bytes));
  return sig ? { mime: sig.mime, ext: sig.ext } : null;
}

/**
 * Validates and uploads an image for a tenant. Upload uses the SIGNED-IN USER's client, so the
 * storage RLS policy (tenant prefix + permission) is enforced by Supabase as well.
 * Path: tenant/{tenantId}/{area}/{uuid}.{ext}. Returns the storage path.
 */
export async function uploadTenantImage(tenantId: string, area: UploadArea, file: File): Promise<{ path: string; mime: string; bytes: number }> {
  if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose an image to upload"] } });
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", { fieldErrors: { file: ["Images must be 10 MB or smaller"] } });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new AppError("VALIDATION", { fieldErrors: { file: ["Only JPG, PNG, WebP, AVIF or GIF images are allowed"] } });
  const path = `tenant/${tenantId}/${area}/${randomUUID()}.${kind.ext}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(STORE_ASSETS_BUCKET).upload(path, bytes, {
    contentType: kind.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new AppError("FORBIDDEN", { message: "Upload was not permitted.", context: { storage: error.message } });
  const { error: dbError } = await supabase.from("media_assets").insert({ tenant_id: tenantId, storage_path: path, mime_type: kind.mime, bytes: file.size });
  if (dbError) throw new AppError("INTERNAL", { context: { db: dbError.message } });
  return { path, mime: kind.mime, bytes: file.size };
}

/** MP4/M4V container: an ISO-BMFF "ftyp" box at offset 4 with an mp4-family brand. */
export function isMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(...bytes.subarray(4, 8));
  const brand = String.fromCharCode(...bytes.subarray(8, 12));
  return box === "ftyp" && /^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4A |dash|mmp4)$/.test(brand);
}

/**
 * Uploads a short MP4 (shoppable videos, video banners) with the signed-in user's client, so the
 * storage RLS policy applies. Real bytes are checked; QuickTime (.mov) is rejected because most
 * browsers can't play it.
 */
export async function uploadTenantVideo(tenantId: string, area: UploadArea, file: File): Promise<{ path: string; bytes: number }> {
  if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose a video to upload"] } });
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", { fieldErrors: { file: ["Videos must be 10 MB or smaller. Export a shorter or 720p version."] } });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isMp4(bytes)) throw new AppError("VALIDATION", { fieldErrors: { file: ["Only MP4 videos are allowed (H.264). Convert .mov files to MP4 first."] } });
  const path = `tenant/${tenantId}/${area}/${randomUUID()}.mp4`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(STORE_ASSETS_BUCKET).upload(path, bytes, { contentType: "video/mp4", cacheControl: "31536000", upsert: false });
  if (error) throw new AppError("FORBIDDEN", { message: "Upload was not permitted.", context: { storage: error.message } });
  const { error: dbError } = await supabase.from("media_assets").insert({ tenant_id: tenantId, storage_path: path, mime_type: "video/mp4", bytes: file.size, filename: file.name.slice(0, 200), folder: "theme" });
  if (dbError) throw new AppError("INTERNAL", { context: { db: dbError.message } });
  return { path, bytes: file.size };
}
