"use server";

import { checkoutOptionsSchema, toCheckoutSettingsJson } from "@/features/checkout/options";
import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadTenantImage } from "@/lib/storage/upload";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { revalidateStorefront } from "@/lib/cache/storefront";
import type { Json } from "@/lib/supabase/database.types";
import { seoSettingsSchema, codSettingsSchema, notificationTemplateSchema, pincodeRuleSchema, shippingRateSchema, storeDetailsSchema } from "./schemas";
import { minorToDb } from "./fields";

async function settingsCtx(perm: "settings.write" | "payments.manage" = "settings.write") {
  const ctx = await requireTenant();
  assertPermission(ctx, perm);
  return ctx;
}
const idSchema = z.object({ id: z.uuid() });

export async function saveStoreDetailsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.store", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(storeDetailsSchema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const logo = fd.get("logo");
    const favicon = fd.get("favicon");
    const logoPath = logo instanceof File && logo.size ? (await uploadTenantImage(ctx.tenantId, "brand", logo)).path : v.removeLogo ? null : undefined;
    const faviconPath = favicon instanceof File && favicon.size ? (await uploadTenantImage(ctx.tenantId, "brand", favicon)).path : v.removeFavicon ? null : undefined;
    const { data: current } = await supabase.from("stores").select("integrations").eq("tenant_id", ctx.tenantId).maybeSingle();
    const integrations = { ...((current?.integrations as Record<string, unknown>) ?? {}) };
    const social = Object.fromEntries(Object.entries({ instagram: v.instagram, facebook: v.facebook, youtube: v.youtube, pinterest: v.pinterest, x: v.x }).filter(([, u]) => u));
    const { error } = await supabase
      .from("stores")
      .update({
        name: v.name,
        tagline: v.tagline ?? null,
        description: v.description ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        whatsapp: v.whatsapp ?? null,
        address: { line1: v.addressLine1 ?? null, line2: v.addressLine2 ?? null, city: v.city ?? null, state: v.state ?? null, postal_code: v.postalCode ?? null, country: "IN" },
        social,
        gstin: v.gstin ?? null,
        legal_name: v.legalName ?? null,
        integrations: integrations as Json,
        order_prefix: v.orderPrefix,
        low_stock_default: v.lowStockDefault,
        ...(logoPath !== undefined ? { logo_path: logoPath } : {}),
        ...(faviconPath !== undefined ? { favicon_path: faviconPath } : {}),
      })
      .eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "settings.store_updated", entityType: "store", entityId: ctx.tenantId });
    revalidateStorefront(ctx.tenantId);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveShippingRateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.shippingRate", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(shippingRateSchema, formToObject(fd));
    const row = {
      tenant_id: ctx.tenantId,
      name: v.name,
      price: minorToDb(v.price),
      min_subtotal: minorToDb(v.minSubtotal),
      max_subtotal: v.maxSubtotal === null ? null : minorToDb(v.maxSubtotal),
      min_weight_grams: v.minWeight,
      max_weight_grams: v.maxWeight,
      pincode_prefixes: v.pincodePrefixes,
      estimated_days_min: v.daysMin,
      estimated_days_max: v.daysMax,
      cod_allowed: v.codAllowed,
      active: v.active,
      position: v.position,
    };
    const supabase = await createSupabaseServerClient();
    const { error } = v.id ? await supabase.from("shipping_rates").update(row).eq("id", v.id).eq("tenant_id", ctx.tenantId) : await supabase.from("shipping_rates").insert(row);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteShippingRateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.deleteShippingRate", async () => {
    const ctx = await settingsCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("shipping_rates").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function savePincodeRuleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.pincodeRule", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(pincodeRuleSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient())
      .from("pincode_rules")
      .upsert({ tenant_id: ctx.tenantId, prefix: v.prefix, deliverable: v.deliverable, cod_allowed: v.codAllowed, extra_days: v.extraDays });
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function deletePincodeRuleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.deletePincodeRule", async () => {
    const ctx = await settingsCtx();
    const { prefix } = parseInput(z.object({ prefix: z.string().regex(/^[1-9]\d{0,5}$/) }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("pincode_rules").delete().eq("tenant_id", ctx.tenantId).eq("prefix", prefix);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveCodSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.cod", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(codSettingsSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient())
      .from("stores")
      .update({ cod_settings: { enabled: v.enabled, fee: minorToDb(v.fee), min_order: minorToDb(v.minOrder), max_order: v.maxOrder > 0 ? minorToDb(v.maxOrder) : null } })
      .eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "settings.cod_updated", entityType: "store", entityId: ctx.tenantId, metadata: { enabled: v.enabled } });
    revalidateStorefront(ctx.tenantId);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveCheckoutOptionsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.checkout", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(checkoutOptionsSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("stores").update({ checkout_settings: toCheckoutSettingsJson(v) }).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "settings.checkout_updated", entityType: "store", entityId: ctx.tenantId, metadata: { guest_checkout: v.guestCheckout, location_autofill: v.locationAutofill } });
    revalidateStorefront(ctx.tenantId);
  });
  if (result.ok) refresh();
  return result;
}

const taxSchema = z.object({
  pricesIncludeTax: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  thresholdRupees: z.coerce.number().min(0).max(10_000_000),
  lowerRate: z.coerce.number().min(0).max(28),
  upperRate: z.coerce.number().min(0).max(28),
});

export async function saveTaxSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.tax", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(taxSchema, formToObject(fd));
    const rules = v.thresholdRupees > 0 ? [{ max_unit_price: v.thresholdRupees, rate: v.lowerRate }, { rate: v.upperRate }] : [{ rate: v.upperRate }];
    const { error } = await (await createSupabaseServerClient()).from("stores").update({ tax_settings: { prices_include_tax: v.pricesIncludeTax, rules } }).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "settings.tax_updated", entityType: "store", entityId: ctx.tenantId, metadata: { rules } });
  });
  if (result.ok) refresh();
  return result;
}

export async function saveNotificationTemplateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.template", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(notificationTemplateSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient())
      .from("notification_templates")
      .upsert({ tenant_id: ctx.tenantId, key: v.key, channel: v.channel, subject: v.subject ?? null, body: v.body, active: v.active, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key,channel" });
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function resetNotificationTemplateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.templateReset", async () => {
    const ctx = await settingsCtx();
    const { key } = parseInput(z.object({ key: z.string().regex(/^[a-z_]+$/) }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("notification_templates").delete().eq("tenant_id", ctx.tenantId).eq("key", key);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveSeoSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("settings.seo", async () => {
    const ctx = await settingsCtx();
    const v = parseInput(seoSettingsSchema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const { data: current } = await supabase.from("stores").select("seo").eq("tenant_id", ctx.tenantId).maybeSingle();
    const prev = (current?.seo ?? {}) as Record<string, unknown>;
    const og = fd.get("ogImage");
    const ogPath = og instanceof File && og.size ? (await uploadTenantImage(ctx.tenantId, "brand", og)).path : v.removeOgImage ? null : ((prev.og_image_path as string | undefined) ?? null);
    const seo = {
      title: v.seoTitle ?? null,
      description: v.seoDescription ?? null,
      og_image_path: ogPath,
      noindex: v.noindex,
      google_verification: v.googleVerification ?? null,
      bing_verification: v.bingVerification ?? null,
    };
    const { error } = await supabase.from("stores").update({ seo }).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "settings.seo_updated", entityType: "store", entityId: ctx.tenantId, metadata: { noindex: v.noindex, og_image: Boolean(ogPath) } });
    revalidateStorefront(ctx.tenantId);
  });
  if (result.ok) refresh();
  return result;
}
