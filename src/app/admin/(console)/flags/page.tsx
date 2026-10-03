import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { listFeatureFlags } from "@/features/platform/server/queries";
import { CreateFlagForm, FlagRowControls } from "@/features/platform/components/admin-forms";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { formatDate } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Feature flags" };

export default async function FlagsPage() {
  await requirePlatform("platform.flags.manage");
  const flags = await listFeatureFlags({ withOverrideCounts: true });
  return (
    <div className="space-y-6">
      <PageHeader title="Feature flags" description="Resolution order: store override → plan feature → flag default." />
      <Card title="Add a flag">
        <CreateFlagForm />
      </Card>
      <Table>
        <thead>
          <tr>
            <th className={th}>Key</th>
            <th className={th}>Default</th>
            <th className={th}>Store overrides</th>
            <th className={th}>Created</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.key}>
              <td className={td}>
                <code className="text-xs">{f.key}</code>
                {f.description ? <p className="text-xs text-muted">{f.description}</p> : null}
              </td>
              <td className={td}>
                <Badge tone={f.defaultEnabled ? "success" : "neutral"}>{f.defaultEnabled ? "on" : "off"}</Badge>
              </td>
              <td className={`${td} text-sm`}>
                {f.overridesOn} on · {f.overridesOff} off
              </td>
              <td className={td}>{formatDate(f.createdAt)}</td>
              <td className={td}>
                <FlagRowControls flagKey={f.key} description={f.description ?? ""} defaultEnabled={f.defaultEnabled} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
