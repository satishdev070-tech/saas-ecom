import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { integrationPresence } from "@/features/platform/health";
import { Badge, Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Integrations" };

/** Reports whether integration env vars are present. Values are never read into the page. */
export default async function HealthPage() {
  await requirePlatform("platform.settings.manage");
  const rows = integrationPresence(process.env);
  return (
    <div className="space-y-4">
      <PageHeader title="Integrations" description="Configuration presence only. Secret values are never shown." />
      {rows.map((r) => (
        <Card key={r.id} title={r.label} actions={<Badge tone={r.configured ? "success" : "warning"}>{r.configured ? "Configured" : "Not configured"}</Badge>}>
          <p className="text-sm text-muted">{r.note}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {r.vars.map((v) => (
              <li key={v.name}>
                <Badge tone={v.present ? "success" : v.required ? "error" : "neutral"}>
                  {v.name} {v.present ? "✓" : v.required ? "missing" : "optional"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
