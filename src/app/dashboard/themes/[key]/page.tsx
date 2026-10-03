import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { getEntitlements } from "@/features/platform";
import { getThemeKeys } from "@/features/theme/server/queries";
import { findMarketplaceTheme } from "@/features/theme/marketplace/catalog";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import { ApplyThemeButton } from "@/features/theme/marketplace/apply-button";
import { FONT_STACKS, type FontKey } from "@/features/theme/schema/tokens";
import { THEME_STYLE_LABELS } from "@/features/theme/marketplace/types";
import { industryName } from "@/features/stores/industries";
import { liveDemoOrigins } from "@/features/theme/marketplace/server";
import { livePreviewUrl } from "@/features/theme/marketplace/live-preview";
import { LivePreviewButton } from "@/features/theme/marketplace/components/preview-dialog";

export async function generateMetadata({ params }: PageProps<"/dashboard/themes/[key]">): Promise<Metadata> {
  const t = findMarketplaceTheme((await params).key);
  return { title: t ? `${t.name} theme` : "Theme" };
}

export default async function ThemeDetailPage({ params }: PageProps<"/dashboard/themes/[key]">) {
  const ctx = await requireTenantPermission("theme.edit");
  const t = findMarketplaceTheme((await params).key);
  if (!t) notFound();
  const [keys, ent, demos] = await Promise.all([getThemeKeys(ctx.tenantId), getEntitlements(ctx.tenantId), liveDemoOrigins(t.demo ? [t.demo] : [])]);
  const live = keys.published === t.key;
  const previewUrl = t.demo && demos.has(t.demo) ? livePreviewUrl(storeOrigin(storeSubdomain(t.demo)), t.key) : null;
  const colors = t.preset.tokens.colors;
  const canApply = !live && ent.isEnabled("theme_marketplace");
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        description={t.tagline}
        back={<Link href="/dashboard/themes">← Theme marketplace</Link>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {live ? <Badge tone="success">Live on your store</Badge> : canApply ? <ApplyThemeButton themeKey={t.key} name={t.name} canPublish={can(ctx, "theme.publish")} size="md" /> : null}
            {previewUrl ? (
              <LivePreviewButton name={t.name} url={previewUrl} size="md" actions={canApply ? <ApplyThemeButton themeKey={t.key} name={t.name} canPublish={can(ctx, "theme.publish")} /> : null} />
            ) : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="self-start overflow-hidden rounded-lg border border-border">
          <ThemeMockup preset={t.preset} name={t.name.split(" ")[0]!} size="large" />
        </div>
        <div className="space-y-4">
          <Card title="About this theme">
            <div className="mb-3 flex flex-wrap gap-1.5 text-caption">
              <span className="rounded-full bg-surface-secondary px-2 py-0.5">{industryName(t.industry)}</span>
              <span className="rounded-full border border-border px-2 py-0.5">{THEME_STYLE_LABELS[t.style]}</span>
            </div>
            <p className="text-small">{t.description}</p>
            <ul className="mt-3 space-y-1.5 text-small">
              {t.features.map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="size-4 text-success" aria-hidden /> {f}</li>
              ))}
            </ul>
            <p className="mt-3 text-caption text-muted">Best for {t.bestFor.join(" · ")} · version {t.version}</p>
          </Card>
          <Card title="Style">
            <div className="flex flex-wrap gap-2">
              {Object.entries(colors).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-caption text-muted">
                  <span className="size-5 rounded-full border border-border" style={{ background: v }} /> {k}
                </span>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-small">
              <dt className="text-muted">Headings</dt>
              <dd style={{ fontFamily: FONT_STACKS[t.preset.tokens.headingFont as FontKey]?.stack }}>{FONT_STACKS[t.preset.tokens.headingFont as FontKey]?.label.split(" (")[0]}</dd>
              <dt className="text-muted">Body</dt>
              <dd style={{ fontFamily: FONT_STACKS[t.preset.tokens.bodyFont as FontKey]?.stack }}>{FONT_STACKS[t.preset.tokens.bodyFont as FontKey]?.label.split(" (")[0]}</dd>
              <dt className="text-muted">Home sections</dt>
              <dd>{t.preset.home.length}</dd>
            </dl>
          </Card>
          <Card title="What happens when you apply">
            <ol className="list-decimal space-y-1 pl-4 text-small text-muted">
              <li>We build a draft with this theme&apos;s look and your store&apos;s own text, images, menus and product picks.</li>
              <li>Your live store doesn&apos;t change. Preview and fine-tune the draft in the theme editor.</li>
              <li>Publish when you&apos;re happy. Your previous theme stays in history for one-click rollback.</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
