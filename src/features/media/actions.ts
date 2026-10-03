"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { can, requireTenant, type TenantContext } from "@/lib/tenant/membership";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { FOLDER_PATTERN } from "./rules";
import { deleteMedia, getMedia, listMedia, mediaUsage, planUploadPaths, registerReplacement, registerUpload, updateMedia, type MediaItem, type MediaQuery, type MediaUsage } from "./server/media";

/** Anyone who can add images somewhere (catalogue, content or theme) may use the library. */
async function mediaWriter(): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!(can(ctx, "catalog.write") || can(ctx, "content.write") || can(ctx, "theme.edit"))) throw new AppError("FORBIDDEN");
  return ctx;
}

const folder = z.string().trim().toLowerCase().regex(FOLDER_PATTERN, "Use lowercase letters, numbers and hyphens");
const dim = z.number().int().min(1).max(20000).nullable();

export async function listMediaAction(query: MediaQuery): Promise<ActionResult<{ items: MediaItem[]; total: number; folders: string[] }>> {
  return runAction("media.list", async () => {
    const ctx = await requireTenant();
    const q = parseInput(
      z.object({
        q: z.string().max(80).optional(),
        folder: folder.optional().or(z.literal("")),
        type: z.string().max(20).optional(),
        sort: z.enum(["newest", "oldest", "name", "largest"]).optional(),
        page: z.number().int().min(1).max(1000).optional(),
        pageSize: z.number().int().min(1).max(96).optional(),
      }),
      query,
    );
    return listMedia(ctx.tenantId, { ...q, folder: q.folder || undefined });
  });
}

export async function prepareMediaUploadAction(files: { name: string; size: number; type: string; width?: number; height?: number }[]): Promise<ActionResult<{ paths: string[] }>> {
  return runAction("media.prepare", async () => {
    const ctx = await mediaWriter();
    const list = parseInput(
      z.array(z.object({ name: z.string().min(1).max(300), size: z.number().int().min(0), type: z.string().max(40), width: z.number().int().optional(), height: z.number().int().optional() })).min(1).max(20),
      files,
    );
    await rateLimit("media:upload", ctx.tenantId, 300, 3600);
    return { paths: planUploadPaths(ctx.tenantId, list).map((p) => p.path) };
  });
}

export async function registerMediaAction(input: { path: string; filename: string; folder: string; alt?: string; width: number | null; height: number | null }): Promise<ActionResult<{ item: MediaItem }>> {
  const result = await runAction("media.register", async () => {
    const ctx = await mediaWriter();
    const v = parseInput(z.object({ path: z.string().max(300), filename: z.string().min(1).max(300), folder, alt: z.string().trim().max(300).optional(), width: dim, height: dim }), input);
    const item = await registerUpload(ctx.tenantId, ctx.user.id, { ...v, alt: v.alt || null });
    return { item };
  });
  if (result.ok) refresh();
  return result;
}

/** Replace keeps the same address (every place using the image updates); returns the path to overwrite. */
export async function prepareReplaceAction(id: string): Promise<ActionResult<{ path: string }>> {
  return runAction("media.prepareReplace", async () => {
    const ctx = await mediaWriter();
    const item = await getMedia(ctx.tenantId, parseInput(z.uuid(), id));
    if (!item) throw new AppError("NOT_FOUND");
    return { path: item.path };
  });
}

export async function registerReplaceAction(input: { id: string; filename: string; width: number | null; height: number | null }): Promise<ActionResult<{ item: MediaItem }>> {
  const result = await runAction("media.replace", async () => {
    const ctx = await mediaWriter();
    const v = parseInput(z.object({ id: z.uuid(), filename: z.string().min(1).max(300), width: dim, height: dim }), input);
    const item = await registerReplacement(ctx.tenantId, v.id, v);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "media.replaced", entityType: "media", entityId: v.id });
    return { item };
  });
  if (result.ok) refresh();
  return result;
}

export async function updateMediaAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("media.update", async () => {
    const ctx = await mediaWriter();
    const v = parseInput(
      z.object({ id: z.uuid(), alt: z.string().trim().max(300), folder, filename: z.string().trim().min(1, "Enter a file name").max(200) }),
      { id: fd.get("id"), alt: fd.get("alt") ?? "", folder: fd.get("folder"), filename: fd.get("filename") },
    );
    await updateMedia(ctx.tenantId, v.id, { alt: v.alt || null, folder: v.folder, filename: v.filename });
  });
  if (result.ok) refresh();
  return result;
}

export async function mediaUsageAction(id: string): Promise<ActionResult<{ usage: MediaUsage[] }>> {
  return runAction("media.usage", async () => {
    const ctx = await requireTenant();
    const item = await getMedia(ctx.tenantId, parseInput(z.uuid(), id));
    if (!item) throw new AppError("NOT_FOUND");
    return { usage: await mediaUsage(ctx.tenantId, item.path) };
  });
}

export async function deleteMediaAction(input: { id: string; force?: boolean }): Promise<ActionResult<{ deleted: boolean; usage: MediaUsage[] }>> {
  const result = await runAction("media.delete", async () => {
    const ctx = await mediaWriter();
    const v = parseInput(z.object({ id: z.uuid(), force: z.boolean().optional() }), input);
    const { usage } = await deleteMedia(ctx.tenantId, v.id, Boolean(v.force));
    if (usage.length) return { deleted: false, usage };
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "media.deleted", entityType: "media", entityId: v.id, metadata: { forced: Boolean(v.force) } });
    return { deleted: true, usage: [] };
  });
  if (result.ok && result.data.deleted) refresh();
  return result;
}
