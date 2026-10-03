import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getEditorPickers, getThemeEditorData } from "@/features/theme/server/queries";
import { ThemeEditor } from "@/features/theme/editor/theme-editor";

export const metadata: Metadata = { title: "Theme" };

export default async function ThemePage() {
  const ctx = await requireTenantPermission("theme.edit");
  const [data, pickers] = await Promise.all([getThemeEditorData(ctx.tenantId), getEditorPickers(ctx.tenantId)]);
  return (
    <div className="-mx-2 sm:mx-0" data-full-width>
      <PageHeader title="Theme" description={data.source === "default" ? "You're starting from the Aangan theme. Customise it, save a draft, then publish." : `Editing your ${data.source} theme.`} />
      <ThemeEditor
        initial={data.config}
        draftUpdatedAt={data.draftUpdatedAt}
        pickers={pickers}
        history={data.history}
        publishedVersion={data.published?.version ?? null}
        canPublish={can(ctx, "theme.publish")}
        issues={data.issues.map((i) => JSON.stringify(i))}
      />
    </div>
  );
}
