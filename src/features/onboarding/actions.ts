"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { publicEnv } from "@/lib/env/public";
import { isValidStoreSlug } from "@/lib/tenant/host";
import { setActiveTenant } from "@/lib/tenant/active";
import { assertPermission } from "@/lib/tenant/membership";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { isIndustry } from "@/features/stores/industries";
import { isThemeKey } from "@/features/marketing-site/themes";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { findPlan } from "@/features/marketing-site/plans";
import { applyMarketplaceThemeToDraft } from "@/features/theme/server/apply-marketplace";
import { listOwnedStores, ownerContext } from "./server";
import { cleanPlanCode, onboardingHref, UUID_RE } from "./steps";

/**
 * Seller onboarding actions. Every action re-checks that the signed-in user OWNS the store it
 * names (a store id from the form is never trusted on its own); RLS enforces the same rules.
 * Nothing here publishes a store: new stores are created as drafts.
 */

const choiceSchema = {
  plan: z.string().optional().transform((v) => cleanPlanCode(v)),
  theme: z.string().optional().transform((v) => (isThemeKey(v) ? v : null)),
};

const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120, "Use 120 characters or fewer"),
  category: z.string().refine(isIndustry, "Choose the category that fits your business best"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters")
    .max(63, "Use 63 characters or fewer")
    .refine((v) => !v.includes("--"), "Don't use two hyphens in a row")
    .refine(isValidStoreSlug, "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number. Some names are reserved."),
  ...choiceSchema,
});

const editBusinessSchema = z.object({ store: z.string().regex(UUID_RE), category: z.string().refine(isIndustry, "Choose a category"), ...choiceSchema });

async function setCategory(tenantId: string, slug: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: cat } = await supabase.from("store_categories").select("id").eq("slug", slug).maybeSingle();
  if (!cat) return;
  const { error } = await supabase.from("stores").update({ category_id: cat.id }).eq("tenant_id", tenantId);
  if (error) logger.warn("onboarding.category_failed", { tenantId, code: error.code });
}

/** New stores start private. Missing column (migration 2400 not applied) leaves it live, as before. */
async function markDraft(tenantId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("stores").update({ launch_status: "draft" }).eq("tenant_id", tenantId);
  if (error) logger.error("onboarding.draft_failed", { tenantId, code: error.code, error: error.message });
}

/** Step 2: create the store (or, with `store`, update its category when the seller went Back). */
export async function saveBusinessAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const result = await runAction("onboarding.business", async () => {
    const user = await requireUser("/onboarding");
    const raw = formToObject(fd);

    if (typeof raw.store === "string" && raw.store) {
      const input = parseInput(editBusinessSchema, raw);
      const ctx = await ownerContext(user, input.store);
      if (!ctx) throw new AppError("FORBIDDEN");
      assertPermission(ctx, "settings.write");
      await setCategory(ctx.tenantId, input.category);
      target = onboardingHref("theme", ctx.tenantId, input);
      return;
    }

    const input = parseInput(businessSchema, raw);
    await rateLimit("create-store", await clientIpKey(), 5, 3600);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_tenant", { p_name: input.name, p_slug: input.slug, p_root_domain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN });
    let tenantId: string | null = data ?? null;
    if (error) {
      if (error.code === "23505") {
        // Same address submitted twice (double click, retry after a slow response): resume the
        // store this user already created instead of failing or creating a second one.
        const mine = (await listOwnedStores(user.id)).find((s) => s.slug === input.slug);
        if (!mine) throw new AppError("VALIDATION", { fieldErrors: { slug: ["That store address is taken. Try another."] } });
        tenantId = mine.tenantId;
      } else if (error.code === "54000") {
        throw new AppError("VALIDATION", { fieldErrors: { _form: ["You've reached the maximum number of stores for one account."] } });
      } else {
        throw mapDbError(error);
      }
    } else if (tenantId) {
      await markDraft(tenantId);
      await setCategory(tenantId, input.category);
    }
    if (!tenantId) throw new AppError("INTERNAL");
    await setActiveTenant(tenantId);
    target = onboardingHref("theme", tenantId, input);
  });
  if (result.ok && target) redirect(target);
  return result;
}

const themeSchema = z.object({ store: z.string().regex(UUID_RE), choice: z.string().optional(), skip: z.string().optional(), plan: choiceSchema.plan });

/** Step 3: apply the chosen theme as a DRAFT (or skip and keep the default theme). */
export async function chooseThemeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const result = await runAction("onboarding.theme", async () => {
    const user = await requireUser("/onboarding");
    const input = parseInput(themeSchema, formToObject(fd));
    const ctx = await ownerContext(user, input.store);
    if (!ctx) throw new AppError("FORBIDDEN");
    if (!input.skip) {
      if (!isThemeKey(input.choice)) throw new AppError("VALIDATION", { fieldErrors: { choice: ["Choose a theme, or skip this step."] } });
      assertPermission(ctx, "theme.edit");
      const { theme } = await applyMarketplaceThemeToDraft(ctx, input.choice);
      await audit({ tenantId: ctx.tenantId, actorUserId: user.id, action: "theme.marketplace_applied", entityType: "theme", entityId: theme.key, metadata: { theme: theme.key, version: theme.version, source: "onboarding" } });
    }
    await setActiveTenant(ctx.tenantId);
    target = onboardingHref("plan", ctx.tenantId, { plan: input.plan });
  });
  if (result.ok && target) redirect(target);
  return result;
}

const planSchema = z.object({ store: z.string().regex(UUID_RE), choice: z.string().optional(), skip: z.string().optional() });

/**
 * Step 4: record the seller's preferred plan. Plans can't be bought online yet, so this changes
 * NO entitlements: the preference is saved on the account and in the store's audit log, where the
 * platform team (Admin → Stores → Change plan) can act on it.
 */
export async function choosePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const result = await runAction("onboarding.plan", async () => {
    const user = await requireUser("/onboarding");
    const input = parseInput(planSchema, formToObject(fd));
    const ctx = await ownerContext(user, input.store);
    if (!ctx) throw new AppError("FORBIDDEN");
    if (!input.skip) {
      const plan = findPlan(await getMarketingPlans(), cleanPlanCode(input.choice));
      if (!plan) throw new AppError("VALIDATION", { fieldErrors: { choice: ["Choose one of the plans shown, or skip this step."] } });
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.updateUser({ data: { requested_plan: plan.code } });
      if (error) logger.warn("onboarding.plan_metadata_failed", { code: error.code });
      await audit({ tenantId: ctx.tenantId, actorUserId: user.id, action: "tenant.plan_requested", entityType: "tenant", entityId: ctx.tenantId, metadata: { plan: plan.code } });
    }
    target = onboardingHref("ready", ctx.tenantId);
  });
  if (result.ok && target) redirect(target);
  return result;
}
