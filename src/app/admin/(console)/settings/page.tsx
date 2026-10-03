import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { listPlatformSettings } from "@/features/platform/server/queries";
import { PLATFORM_SETTINGS } from "@/features/platform/settings-registry";
import { SettingCards } from "@/features/platform/components/setting-cards";
import { PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Settings" };

export default async function PlatformSettingsPage() {
  await requirePlatform("platform.settings.manage");
  const stored = await listPlatformSettings();
  return (
    <div className="space-y-4">
      <PageHeader title="Platform settings" description="Global switches for the whole platform. Changes are audited. Branding, analytics, sign-in and email have their own pages." />
      <SettingCards keys={PLATFORM_SETTINGS.filter((s) => !s.page).map((s) => s.key)} stored={stored} />
    </div>
  );
}
