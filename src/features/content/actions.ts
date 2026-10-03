"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput, slug } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { uploadTenantImage } from "@/lib/storage/upload";
import { audit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import { blocksBelongToTenant, contentBlockSchema } from "./blocks";

async function writer() {
  const ctx = await requireTenant();
  assertPermission(ctx, "content.write");
  return ctx;
}
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const blocksField = z
  .string()
  .max(500_000)
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid content" });
      return z.NEVER;
    }
  })
  .pipe(z.array(contentBlockSchema).max(200));
const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const docSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  title: z.string().trim().min(1, "Enter a title").max(200),
  slug,
  status: z.enum(["draft", "published"]),
  blocks: blocksField,
  seoTitle: optText(120),
  seoDescription: optText(320),
  kind: z.enum(["page", "policy", "contact", "faq", "about"]).optional(),
  excerpt: optText(500),
  authorName: optText(80),
  tags: optText(400),
  removeCover: bool.optional(),
});

export async function saveDocumentAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  let createdPath: string | null = null;
  const result = await runAction("content.save", async () => {
    const ctx = await writer();
    const table = fd.get("table") === "blog_posts" ? "blog_posts" : "pages";
    const v = parseInput(docSchema, formToObject(fd));
    if (!blocksBelongToTenant(v.blocks, ctx.tenantId)) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Images must be uploaded to this store."] } });
    const supabase = await createSupabaseServerClient();
    const base = {
      tenant_id: ctx.tenantId,
      title: v.title,
      slug: v.slug,
      status: v.status,
      body: v.blocks as unknown as Json,
      seo: { title: v.seoTitle ?? null, description: v.seoDescription ?? null },
      published_at: v.status === "published" ? new Date().toISOString() : null,
    };
    let id = v.id ?? null;
    if (table === "pages") {
      const row = { ...base, kind: v.kind ?? "page" };
      if (id) {
        const { data: prev } = await supabase.from("pages").select("published_at").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
        const { error } = await supabase.from("pages").update({ ...row, published_at: v.status === "published" ? (prev?.published_at ?? row.published_at) : null }).eq("id", id).eq("tenant_id", ctx.tenantId);
        if (error) throw mapDbError(error);
      } else {
        const { data, error } = await supabase.from("pages").insert(row).select("id").single();
        if (error) throw mapDbError(error);
        id = data.id;
      }
    } else {
      const cover = fd.get("cover");
      const coverPath = cover instanceof File && cover.size ? (await uploadTenantImage(ctx.tenantId, "blog", cover)).path : v.removeCover ? null : undefined;
      const row = {
        ...base,
        excerpt: v.excerpt ?? null,
        author_name: v.authorName ?? null,
        tags: (v.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
        ...(coverPath !== undefined ? { cover_path: coverPath } : {}),
      };
      if (id) {
        const { data: prev } = await supabase.from("blog_posts").select("published_at").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
        const { error } = await supabase.from("blog_posts").update({ ...row, published_at: v.status === "published" ? (prev?.published_at ?? row.published_at) : null }).eq("id", id).eq("tenant_id", ctx.tenantId);
        if (error) throw mapDbError(error);
      } else {
        const { data, error } = await supabase.from("blog_posts").insert({ ...row, created_by: ctx.user.id }).select("id").single();
        if (error) throw mapDbError(error);
        id = data.id;
      }
    }
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `content.${table === "pages" ? "page" : "post"}_saved`, entityType: table, entityId: id!, metadata: { status: v.status } });
    if (!v.id) createdPath = `/dashboard/content/${table === "pages" ? "pages" : "blog"}/${id}?created=1`;
    return { id: id! };
  });
  if (createdPath) redirect(createdPath);
  if (result.ok) refresh();
  return result;
}

export async function deleteDocumentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let back = "/dashboard/content/pages";
  const result = await runAction("content.delete", async () => {
    const ctx = await writer();
    const table = fd.get("table") === "blog_posts" ? "blog_posts" : "pages";
    back = table === "pages" ? "/dashboard/content/pages" : "/dashboard/content/blog";
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from(table).delete().eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "content.deleted", entityType: table, entityId: id });
  });
  if (result.ok) redirect(back);
  return result;
}

export async function uploadContentImageAction(fd: FormData): Promise<ActionResult<{ path: string }>> {
  return runAction("content.uploadImage", async () => {
    const ctx = await writer();
    const f = fd.get("file");
    if (!(f instanceof File)) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose an image"] } });
    const { path } = await uploadTenantImage(ctx.tenantId, "pages", f);
    return { path };
  });
}

// Menus -------------------------------------------------------------------
const linkItem = z.object({
  title: z.string().trim().min(1).max(80),
  link_type: z.enum(["url", "collection", "category", "product", "page", "blog", "home", "search"]),
  link_ref: z.uuid().nullable().optional(),
  url: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, "Links must start with / or https://").nullable().optional(),
  highlight: z.boolean().optional(),
});
const menuSchema = z.object({
  menuId: z.uuid().optional(),
  handle: z.string().regex(/^[a-z0-9-]{2,40}$/, "Use lowercase letters, numbers and hyphens"),
  title: z.string().trim().min(1).max(80),
  items: z
    .string()
    .max(200_000)
    .transform((s) => JSON.parse(s) as unknown)
    .pipe(z.array(linkItem.extend({ children: z.array(linkItem).max(50).default([]) })).max(50)),
});

export async function saveMenuAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("content.menu", async () => {
    const ctx = await writer();
    const v = parseInput(menuSchema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    let menuId = v.menuId;
    if (menuId) {
      const { error } = await supabase.from("menus").update({ title: v.title }).eq("id", menuId).eq("tenant_id", ctx.tenantId);
      if (error) throw mapDbError(error);
    } else {
      const { data, error } = await supabase.from("menus").insert({ tenant_id: ctx.tenantId, handle: v.handle, title: v.title }).select("id").single();
      if (error) throw mapDbError(error);
      menuId = data.id;
    }
    const { error } = await supabase.rpc("replace_menu_items", { p_menu: menuId!, p_items: v.items as unknown as Json });
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "content.menu_saved", entityType: "menu", entityId: menuId! });
  });
  if (result.ok) refresh();
  return result;
}

// Simple rows: FAQs, store locations, redirects ------------------------------
const faqSchema = z.object({ id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()), question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(3000), groupName: z.string().trim().min(1).max(60).default("General"), position: z.coerce.number().int().min(0).max(10000).default(0), published: bool });
const locationSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1).max(120),
  line1: optText(200),
  city: optText(80),
  state: optText(80),
  postalCode: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[1-9]\d{5}$/, "6-digit PIN").optional()),
  phone: optText(20),
  hours: optText(200),
  latitude: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-180).max(180).optional()),
  active: bool,
});
const redirectSchema = z.object({
  fromPath: z.string().trim().regex(/^\/[^\s]*$/, "Start with /").max(500),
  toPath: z.string().trim().regex(/^\/[^\s]*$/, "Start with / (same store)").max(500),
  statusCode: z.coerce.number().refine((n) => n === 301 || n === 302),
});

export async function saveRowAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("content.row", async () => {
    const ctx = await writer();
    const kind = fd.get("kind");
    const raw = formToObject(fd);
    const supabase = await createSupabaseServerClient();
    if (kind === "faq") {
      const v = parseInput(faqSchema, raw);
      const row = { tenant_id: ctx.tenantId, question: v.question, answer: v.answer, group_name: v.groupName, position: v.position, status: v.published ? "published" : "draft" };
      const { error } = v.id ? await supabase.from("faqs").update(row).eq("id", v.id).eq("tenant_id", ctx.tenantId) : await supabase.from("faqs").insert(row);
      if (error) throw mapDbError(error);
    } else if (kind === "location") {
      const v = parseInput(locationSchema, raw);
      const row = { tenant_id: ctx.tenantId, name: v.name, address: { line1: v.line1 ?? null, city: v.city ?? null, state: v.state ?? null, postal_code: v.postalCode ?? null, country: "IN" }, phone: v.phone ?? null, hours: v.hours ?? null, latitude: v.latitude ?? null, longitude: v.longitude ?? null, active: v.active };
      const { error } = v.id ? await supabase.from("store_locations").update(row).eq("id", v.id).eq("tenant_id", ctx.tenantId) : await supabase.from("store_locations").insert(row);
      if (error) throw mapDbError(error);
    } else if (kind === "redirect") {
      const v = parseInput(redirectSchema, raw);
      if (v.fromPath === v.toPath) throw new AppError("VALIDATION", { fieldErrors: { toPath: ["Must differ from the old path"] } });
      const { error } = await supabase.from("redirects").upsert({ tenant_id: ctx.tenantId, from_path: v.fromPath, to_path: v.toPath, status_code: v.statusCode }, { onConflict: "tenant_id,from_path" });
      if (error) throw mapDbError(error);
    } else throw new AppError("VALIDATION");
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteRowAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("content.deleteRow", async () => {
    const ctx = await writer();
    const table = ({ faq: "faqs", location: "store_locations", redirect: "redirects", menu: "menus" } as const)[String(fd.get("kind")) as "faq"];
    if (!table) throw new AppError("VALIDATION");
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from(table).delete().eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}
