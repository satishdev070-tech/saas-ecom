import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assetUrl } from "@/lib/storage/assets";
import { Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { getEntitlements } from "@/features/platform";
import { getBrand, listCreativeTemplates } from "@/features/creative/server";
import { CreativeStudio } from "@/features/creative/studio";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Creative studio" };

export default async function CreativePage() {
  const ctx = await requireTenantPermission("marketing.read");
  const [templates, brand, ent, { data: creatives }] = await Promise.all([
    listCreativeTemplates(),
    getBrand(ctx.tenantId),
    getEntitlements(ctx.tenantId),
    (await createSupabaseServerClient()).from("creatives").select("id, name, template_key, output_path, created_at").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(24),
  ]);
  const enabled = ent.isEnabled("creative_studio");
  const { logoPath: _logoPath, ...clientBrand } = brand;
  return (
    <div className="space-y-6">
      <PageHeader title="Creative studio" description="Make on-brand images for Instagram, WhatsApp and ads from ready templates. Designs use your theme colours and logo and are saved to your media library." />
      {!enabled ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">Creative Studio isn&apos;t included in your plan. You can preview templates but not save designs.</p> : null}
      <CreativeStudio templates={templates} brand={clientBrand} canSave={enabled && can(ctx, "marketing.write")} />
      <Card title="Saved designs">
        {creatives?.length ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {creatives.map((c) => {
              const url = assetUrl(c.output_path);
              return (
                <li key={c.id} className="space-y-1">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={c.name} className="aspect-square w-full rounded-md border border-border object-cover" />
                    </a>
                  ) : null}
                  <p className="truncate text-caption">{c.name}</p>
                  <p className="text-caption text-muted">{formatDateTime(c.created_at)}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No designs yet" description="Pick a template above, fill in the text and save." />
        )}
      </Card>
    </div>
  );
}
