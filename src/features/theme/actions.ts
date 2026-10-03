"use server";

import type { Json } from "@/lib/supabase/database.types";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput, uuid } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { uploadTenantImage, uploadTenantVideo } from "@/lib/storage/upload";
import { audit } from "@/lib/audit";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { assetsBelongToTenant, parseThemeConfigStrict, MAX_CONFIG_BYTES, type ThemeIssue } from "./schema/config";
import { DEFAULT_THEME_KEY } from "./default-theme";
import { previewEntryUrl } from "./preview";
import { createPreviewToken } from "./server/preview";
import { applyMarketplaceThemeToDraft } from "./server/apply-marketplace";

/**
 * Theme editor mutations. Every action: validate -> authenticate (seller session) ->
 * authorize (theme.edit / theme.publish; RLS and the SQL functions re-check) -> execute ->
 * audit (publish/rollback are also audited inside SQL) -> safe result.
 */

const saveSchema = z.object({
  config: z.string().min(2).max(MAX_CONFIG_BYTES * 2),
  /** updated_at of the draft the editor loaded; a mismatch means someone else saved meanwhile. */
  baseUpdatedAt: z.string().max(64).optional(),
  force: z.enum(["1"]).optional(),
});

export type SaveDraftResult = { updatedAt: string };

function issuesToFieldErrors(issues: ThemeIssue[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues.slice(0, 50)) (out[i.path || "_form"] ??= []).push(i.message);
  out._form ??= [`${issues.length} setting${issues.length === 1 ? "" : "s"} need attention: ${issues[0]?.message ?? ""}`];
  return out;
}

export async function saveThemeDraftAction(_prev: ActionResult<SaveDraftResult> | null, fd: FormData): Promise<ActionResult<SaveDraftResult>> {
  return runAction("theme.saveDraft", async () => {
    const input = parseInput(saveSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");

    let raw: unknown;
    try {
      raw = JSON.parse(input.config);
    } catch {
      throw new AppError("VALIDATION", { fieldErrors: { _form: ["The theme could not be read. Reload the editor and try again."] } });
    }
    const parsed = parseThemeConfigStrict(raw);
    if (!parsed.ok) throw new AppError("VALIDATION", { fieldErrors: issuesToFieldErrors(parsed.issues) });
    if (!assetsBelongToTenant(parsed.config, ctx.tenantId)) {
      throw new AppError("VALIDATION", { fieldErrors: { _form: ["Some images don't belong to this store. Upload them again."] } });
    }

    const supabase = await createSupabaseServerClient();
    const { data: draft, error: readError } = await supabase
      .from("theme_versions")
      .select("id, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "draft")
      .maybeSingle();
    if (readError) throw mapDbError(readError);

    if (draft) {
      if (input.baseUpdatedAt && input.force !== "1" && draft.updated_at !== input.baseUpdatedAt) {
        throw new AppError("CONFLICT", {
          fieldErrors: { _form: ["Someone else saved this theme after you opened it. Reload to see their changes, or save again to overwrite them."] },
          context: { reason: "stale_draft" },
        });
      }
      const { data, error } = await supabase
        .from("theme_versions")
        .update({ config: parsed.config as unknown as Json })
        .eq("id", draft.id)
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "draft")
        .select("updated_at")
        .single();
      if (error) throw mapDbError(error);
      return { updatedAt: data.updated_at };
    }

    // First save: create the tenant's single draft row (unique index guards concurrent inserts).
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: latest } = await supabase
        .from("theme_versions")
        .select("version")
        .eq("tenant_id", ctx.tenantId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await supabase
        .from("theme_versions")
        .insert({ tenant_id: ctx.tenantId, theme_key: DEFAULT_THEME_KEY, version: (latest?.version ?? 0) + 1, status: "draft", config: parsed.config as unknown as Json, created_by: ctx.user.id })
        .select("updated_at")
        .single();
      if (!error) return { updatedAt: data.updated_at };
      if (error.code !== "23505" || attempt === 1) throw mapDbError(error);
    }
    throw new AppError("CONFLICT");
  });
}

const publishSchema = z.object({ label: z.string().trim().max(80).optional() });

export async function publishThemeAction(_prev: ActionResult<{ versionId: string }> | null, fd: FormData): Promise<ActionResult<{ versionId: string }>> {
  return runAction("theme.publish", async () => {
    const input = parseInput(publishSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.publish");
    const supabase = await createSupabaseServerClient();

    // Re-validate the stored draft strictly: never publish something the renderer would reject.
    const { data: draft, error: readError } = await supabase
      .from("theme_versions")
      .select("config")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "draft")
      .maybeSingle();
    if (readError) throw mapDbError(readError);
    if (!draft) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Save your changes before publishing."] } });
    const parsed = parseThemeConfigStrict(draft.config);
    if (!parsed.ok) throw new AppError("VALIDATION", { fieldErrors: issuesToFieldErrors(parsed.issues) });
    if (!assetsBelongToTenant(parsed.config, ctx.tenantId)) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Some images don't belong to this store."] } });

    const { data, error } = await supabase.rpc("publish_theme", { p_tenant: ctx.tenantId, p_label: input.label || undefined });
    if (error) throw mapDbError(error);
    revalidateStorefront(ctx.tenantId);
    return { versionId: data };
  });
}

const rollbackSchema = z.object({ versionId: uuid });

export async function rollbackThemeAction(_prev: ActionResult<{ versionId: string }> | null, fd: FormData): Promise<ActionResult<{ versionId: string }>> {
  return runAction("theme.rollback", async () => {
    const input = parseInput(rollbackSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.publish");
    const supabase = await createSupabaseServerClient();
    // The version must belong to the ACTIVE store (a member of several stores can't cross over).
    const { data: target, error: readError } = await supabase
      .from("theme_versions")
      .select("id, status, version")
      .eq("id", input.versionId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (readError) throw mapDbError(readError);
    if (!target || target.status === "draft") throw new AppError("NOT_FOUND");
    const { data, error } = await supabase.rpc("rollback_theme", { p_version: target.id });
    if (error) throw mapDbError(error);
    revalidateStorefront(ctx.tenantId);
    return { versionId: data };
  });
}

export async function uploadThemeVideoAction(_prev: ActionResult<{ path: string }> | null, fd: FormData): Promise<ActionResult<{ path: string }>> {
  return runAction("theme.uploadVideo", async () => {
    const file = fd.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Choose a video to upload"] } });
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");
    const { path } = await uploadTenantVideo(ctx.tenantId, "theme", file);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "theme.video_uploaded", entityType: "media", entityId: path });
    return { path };
  });
}

export async function uploadThemeImageAction(_prev: ActionResult<{ path: string }> | null, fd: FormData): Promise<ActionResult<{ path: string }>> {
  return runAction("theme.uploadImage", async () => {
    const file = fd.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose an image to upload"], _form: ["Choose an image to upload"] } });
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");
    const { path } = await uploadTenantImage(ctx.tenantId, "theme", file);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "theme.image_uploaded", entityType: "media", entityId: path });
    return { path };
  });
}

/** Fresh preview URL (tokens expire after 2 hours; the editor asks for a new one when needed). */
export async function refreshPreviewUrlAction(): Promise<ActionResult<{ url: string; expiresAt: number }>> {
  return runAction("theme.previewToken", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");
    const { token, expiresAt } = createPreviewToken(ctx.tenantId, ctx.user.id);
    return { url: previewEntryUrl(storeOrigin(storeSubdomain(ctx.tenantSlug)), token), expiresAt };
  });
}

const applyThemeSchema = z.object({ key: z.string().regex(/^[a-z0-9-]{2,40}$/) });

/**
 * Theme marketplace "Apply": builds a new DRAFT from the chosen preset + the store's current
 * content (draft if one exists, else the published theme). The live store is unchanged until the
 * seller publishes; the previous published version stays in history for rollback.
 */
export async function applyMarketplaceThemeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("theme.applyMarketplace", async () => {
    const { key } = parseInput(applyThemeSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");
    const { theme } = await applyMarketplaceThemeToDraft(ctx, key);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "theme.marketplace_applied", entityType: "theme", entityId: theme.key, metadata: { theme: theme.key, version: theme.version } });
  });
}

/** Apply a marketplace theme and publish it in the same seller action. */
export async function applyMarketplaceThemeAndPublishAction(_prev: ActionResult<{ versionId: string }> | null, fd: FormData): Promise<ActionResult<{ versionId: string }>> {
  return runAction("theme.applyMarketplaceAndPublish", async () => {
    const { key } = parseInput(applyThemeSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "theme.edit");
    assertPermission(ctx, "theme.publish");
    const { supabase, theme } = await applyMarketplaceThemeToDraft(ctx, key);
    const { data: versionId, error } = await supabase.rpc("publish_theme", { p_tenant: ctx.tenantId, p_label: theme.name });
    if (error) throw mapDbError(error);
    revalidateStorefront(ctx.tenantId);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "theme.marketplace_applied_and_published", entityType: "theme_version", entityId: versionId, metadata: { theme: theme.key, version: theme.version } });
    return { versionId };
  });
}
