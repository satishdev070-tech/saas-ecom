import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/layout";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/features/platform";
import { istDayKey } from "@/features/social/planner";
import { configuredProviders, countGenerationsToday, getBrandProfile, listGenerations } from "@/features/neural-pulse/server";
import { DAILY_GENERATION_LIMIT, PROVIDER_LABELS } from "@/features/neural-pulse/schemas";
import { NeuralPulseStudio } from "@/features/neural-pulse/components/studio";

export const metadata: Metadata = { title: "Neural Pulse" };

export default async function NeuralPulsePage() {
  const ctx = await requireTenantPermission("marketing.read");
  const supabase = await createSupabaseServerClient();
  const [ent, providers, brand, history, usedToday, products] = await Promise.all([
    getEntitlements(ctx.tenantId),
    configuredProviders(),
    getBrandProfile(ctx.tenantId),
    listGenerations(ctx.tenantId),
    countGenerationsToday(ctx.tenantId),
    supabase.from("products").select("id, title").eq("tenant_id", ctx.tenantId).eq("status", "active").order("updated_at", { ascending: false }).limit(200),
  ]);
  const enabled = ent.isEnabled("social_media");
  const canWrite = can(ctx, "marketing.write") && enabled;
  const aiReady = providers.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Neural Pulse"
        description="AI content studio: on-brand post ideas, captions with hashtags and content plans from your products and key dates. You review everything before it's posted."
      />
      {!enabled ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">Neural Pulse is part of social publishing, which isn&apos;t included in your plan.</p> : null}
      {!aiReady ? (
        <div role="status" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-small text-warning">
          <p className="font-medium">AI writing isn&apos;t set up yet.</p>
          <p className="mt-1">
            A platform admin needs to add an API key for Google Gemini (free tier), Groq (free tier) or Anthropic Claude (paid) in{" "}
            <Link href="/admin/social-apps" className="font-medium underline">
              Admin → Social apps
            </Link>
            . You can still fill in your brand profile meanwhile.
          </p>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
          <span className="inline-flex items-center gap-1">
            <Sparkles aria-hidden className="size-3.5" /> Using {providers.map((p) => PROVIDER_LABELS[p]).join(", then ")}
          </span>
          <span>
            {Math.min(usedToday, DAILY_GENERATION_LIMIT)} of {DAILY_GENERATION_LIMIT} generations used today
          </span>
        </p>
      )}
      <NeuralPulseStudio brand={brand} canWrite={canWrite} aiReady={aiReady} products={products.data ?? []} history={history} today={istDayKey(new Date().toISOString())} />
    </div>
  );
}
