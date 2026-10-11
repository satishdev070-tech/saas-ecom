import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { FESTIVE_PRESETS, festiveStatus, istDate, parseFestiveSettings } from "@/features/storefront/festive";
import { DeleteFestiveButton, FestiveCampaignForm } from "@/features/storefront/components/festive-form";

export const metadata: Metadata = { title: "Festive vibes" };

const STATUS = { running: { label: "Live now", tone: "success" }, scheduled: { label: "Scheduled", tone: "info" }, ended: { label: "Ended", tone: "neutral" } } as const;
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const fmt = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

export default async function FestivePage() {
  const ctx = await requireTenantPermission("store.read");
  const { data, error } = await (await createSupabaseServerClient()).from("stores").select("festive_settings").eq("tenant_id", ctx.tenantId).maybeSingle();
  const campaigns = error ? [] : parseFestiveSettings(data?.festive_settings);
  const today = istDate();
  const writable = can(ctx, "settings.write");
  return (
    <div className="space-y-6">
      <PageHeader title="Festive vibes" description="Give your store a festival look for Navratri, Diwali, Eid and more: an announcement bar, a festive garland under the header and, if you like, falling petals. Choose the dates and it switches on and off by itself. Your theme isn't changed." />
      {error ? (
        <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          Festive vibes need a one-time database update. Ask your platform admin to run supabase/dev/apply-2800.sql.
        </p>
      ) : null}
      {campaigns.length ? (
        <Card title="Your festive looks">
          <ul className="divide-y divide-border">
            {campaigns.map((c) => {
              const st = STATUS[festiveStatus(c, today)];
              return (
                <li key={c.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="size-3 rounded-full" style={{ background: FESTIVE_PRESETS[c.preset].bg }} aria-hidden />
                      <span className="font-medium">{FESTIVE_PRESETS[c.preset].label}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="text-small text-muted">
                        {fmt(c.start)} – {fmt(c.end)}
                      </span>
                      {writable ? <span className="ml-auto text-small text-accent">Edit</span> : null}
                    </summary>
                    {writable ? (
                      <div className="mt-4 space-y-3">
                        <FestiveCampaignForm value={c} today={today} />
                        <DeleteFestiveButton id={c.id} />
                      </div>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
      {writable && !error ? (
        <Card title="Schedule a festive look">
          <FestiveCampaignForm today={today} />
        </Card>
      ) : null}
    </div>
  );
}
