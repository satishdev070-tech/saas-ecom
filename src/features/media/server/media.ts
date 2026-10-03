import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { STORE_ASSETS_BUCKET, assetUrl } from "@/lib/storage/assets";
import { sniffImage } from "@/lib/storage/upload";
import { MEDIA_TYPES, cleanFilename, isMediaMime, validateMediaFile, type FileMeta } from "../rules";

export type MediaItem = {
  id: string;
  path: string;
  url: string;
  filename: string;
  folder: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  createdAt: string;
  updatedAt: string;
};

export type MediaQuery = { q?: string; folder?: string; type?: string; sort?: "newest" | "oldest" | "name" | "largest"; page?: number; pageSize?: number };

const SELECT = "id, storage_path, filename, folder, mime_type, bytes, width, height, alt_text, created_at, updated_at";
type Row = { id: string; storage_path: string; filename: string | null; folder: string; mime_type: string; bytes: number; width: number | null; height: number | null; alt_text: string | null; created_at: string; updated_at: string };

function toItem(r: Row): MediaItem {
  return {
    id: r.id,
    path: r.storage_path,
    url: assetUrl(r.storage_path) ?? "",
    filename: r.filename ?? r.storage_path.split("/").pop() ?? "image",
    folder: r.folder,
    mime: r.mime_type,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    alt: r.alt_text ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Library listing (RLS: media_assets_staff_read). Search matches filename and alt text. */
export async function listMedia(tenantId: string, q: MediaQuery): Promise<{ items: MediaItem[]; total: number; folders: string[] }> {
  const supabase = await createSupabaseServerClient();
  const pageSize = Math.min(Math.max(q.pageSize ?? 48, 1), 384);
  const page = Math.max(q.page ?? 1, 1);
  let query = supabase.from("media_assets").select(SELECT, { count: "exact" }).eq("tenant_id", tenantId).like("mime_type", "image/%");
  const term = q.q?.trim().replace(/[\\%_,()*]/g, " ").trim();
  if (term) query = query.or(`filename.ilike.%${term}%,alt_text.ilike.%${term}%`);
  if (q.folder) query = query.eq("folder", q.folder);
  if (q.type && isMediaMime(q.type)) query = query.eq("mime_type", q.type);
  const order = q.sort === "oldest" ? { col: "created_at", asc: true } : q.sort === "name" ? { col: "filename", asc: true } : q.sort === "largest" ? { col: "bytes", asc: false } : { col: "created_at", asc: false };
  const [{ data, error, count }, folders] = await Promise.all([
    query.order(order.col, { ascending: order.asc }).order("id").range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("media_assets").select("folder").eq("tenant_id", tenantId),
  ]);
  if (error) throw mapDbError(error);
  return { items: (data ?? []).map(toItem), total: count ?? 0, folders: [...new Set((folders.data ?? []).map((f) => f.folder))].sort() };
}

export async function getMedia(tenantId: string, id: string): Promise<MediaItem | null> {
  const { data } = await (await createSupabaseServerClient()).from("media_assets").select(SELECT).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data ? toItem(data) : null;
}

/** Server-chosen storage paths for files the browser is about to upload (tenant from context, never input). */
export function planUploadPaths(tenantId: string, files: FileMeta[]): { path: string }[] {
  return files.map((f) => {
    const problem = validateMediaFile(f);
    if (problem) throw new AppError("VALIDATION", { message: `${cleanFilename(f.name)}: ${problem}` });
    const ext = MEDIA_TYPES[f.type as keyof typeof MEDIA_TYPES][0];
    return { path: `tenant/${tenantId}/media/${randomUUID()}.${ext}` };
  });
}

/** Downloads the stored object (≤10 MB) and checks its magic bytes. Deletes it when it isn't an allowed image. */
async function verifyStoredImage(path: string): Promise<{ mime: string; bytes: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(STORE_ASSETS_BUCKET).download(path);
  if (error || !data) throw new AppError("VALIDATION", { message: "We couldn't find the uploaded file. Please try again." });
  const buf = new Uint8Array(await data.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind || !isMediaMime(kind.mime)) {
    await supabase.storage.from(STORE_ASSETS_BUCKET).remove([path]);
    throw new AppError("VALIDATION", { message: "That file isn't a valid image, so it was discarded." });
  }
  return { mime: kind.mime, bytes: buf.byteLength };
}

export async function registerUpload(
  tenantId: string,
  userId: string,
  input: { path: string; filename: string; folder: string; alt: string | null; width: number | null; height: number | null },
): Promise<MediaItem> {
  if (!input.path.startsWith(`tenant/${tenantId}/media/`)) throw new AppError("FORBIDDEN");
  const { mime, bytes } = await verifyStoredImage(input.path);
  const { data, error } = await (await createSupabaseServerClient())
    .from("media_assets")
    .insert({ tenant_id: tenantId, storage_path: input.path, filename: cleanFilename(input.filename), folder: input.folder, alt_text: input.alt, mime_type: mime, bytes, width: input.width, height: input.height, uploaded_by: userId })
    .select(SELECT)
    .single();
  if (error) throw mapDbError(error);
  return toItem(data);
}

/** After the browser overwrote the object at the same path: re-verify and refresh metadata. */
export async function registerReplacement(tenantId: string, id: string, meta: { filename: string; width: number | null; height: number | null }): Promise<MediaItem> {
  const current = await getMedia(tenantId, id);
  if (!current) throw new AppError("NOT_FOUND");
  const { mime, bytes } = await verifyStoredImage(current.path);
  const { data, error } = await (await createSupabaseServerClient())
    .from("media_assets")
    .update({ mime_type: mime, bytes, width: meta.width, height: meta.height, filename: cleanFilename(meta.filename) })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw mapDbError(error);
  return toItem(data);
}

export async function updateMedia(tenantId: string, id: string, patch: { alt?: string | null; folder?: string; filename?: string }): Promise<void> {
  const row: { alt_text?: string | null; folder?: string; filename?: string } = {};
  if (patch.alt !== undefined) row.alt_text = patch.alt;
  if (patch.folder) row.folder = patch.folder;
  if (patch.filename) row.filename = cleanFilename(patch.filename);
  const { error } = await (await createSupabaseServerClient()).from("media_assets").update(row).eq("tenant_id", tenantId).eq("id", id);
  if (error) throw mapDbError(error);
}

export type MediaUsage = { kind: string; label: string; refId: string };

export async function mediaUsage(tenantId: string, path: string): Promise<MediaUsage[]> {
  const { data, error } = await (await createSupabaseServerClient()).rpc("media_usage", { p_tenant: tenantId, p_path: path });
  if (error) throw mapDbError(error);
  return (data ?? []).map((u) => ({ kind: u.kind, label: u.label, refId: u.ref_id }));
}

/** Deletes the catalogue row and the stored file. Refuses when the file is still referenced unless forced. */
export async function deleteMedia(tenantId: string, id: string, force: boolean): Promise<{ usage: MediaUsage[] }> {
  const item = await getMedia(tenantId, id);
  if (!item) throw new AppError("NOT_FOUND");
  const usage = await mediaUsage(tenantId, item.path);
  if (usage.length && !force) return { usage };
  const supabase = await createSupabaseServerClient();
  const { error: rmError } = await supabase.storage.from(STORE_ASSETS_BUCKET).remove([item.path]);
  if (rmError) throw new AppError("FORBIDDEN", { message: "You don't have permission to delete this file." });
  const { error } = await supabase.from("media_assets").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw mapDbError(error);
  return { usage: [] };
}
