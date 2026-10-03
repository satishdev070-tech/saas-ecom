import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { listPlatformSettings } from "@/features/platform/server/queries";
import { PLATFORM_SETTINGS } from "@/features/platform/settings-registry";
import { PlatformSettingForm } from "@/features/platform/components/admin-forms";
import { Card, PageHeader } from "@/components/ui/layout";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Settings" };

export default async function PlatformSettingsPage() {
  await requirePlatform("platform.settings.manage");
  const stored = await listPlatformSettings();
  return (
    <div className="space-y-4">
      <PageHeader title="Platform settings" description="Global switches for the whole platform. Changes are audited." />
      {PLATFORM_SETTINGS.map((s) => {
        const row = stored.get(s.key);
        return (
          <Card key={s.key} description={row ? `Last changed ${formatDateTime(row.updatedAt)}` : "Using the default"}>
            <PlatformSettingForm settingKey={s.key} label={s.label} description={s.description} kind={s.kind} value={row ? row.value : s.defaultValue} />
          </Card>
        );
      })}
    </div>
  );
}
