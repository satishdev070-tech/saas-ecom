import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { assetUrl } from "@/lib/storage/assets";
import { StoreDetailsForm } from "@/features/dashboard-ui/forms";
import { CloseStoreButton } from "@/features/stores/components/close-store";

export const metadata: Metadata = { title: "Store details" };

export default async function StoreSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const { data: s } = await (await createSupabaseServerClient()).from("stores").select("*").eq("tenant_id", ctx.tenantId).single();
  if (!s) throw new Error("Store profile missing");
  const a = (s.address ?? {}) as Record<string, string>;
  const social = (s.social ?? {}) as Record<string, string>;
  const v: Record<string, string> = {
    name: s.name, tagline: s.tagline ?? "", description: s.description ?? "", email: s.email ?? "", phone: s.phone ?? "", whatsapp: s.whatsapp ?? "",
    addressLine1: a.line1 ?? "", addressLine2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "", postalCode: a.postal_code ?? "",
    instagram: social.instagram ?? "", facebook: social.facebook ?? "", youtube: social.youtube ?? "", pinterest: social.pinterest ?? "", x: social.x ?? "",
    gstin: s.gstin ?? "", legalName: s.legal_name ?? "",
    orderPrefix: s.order_prefix, lowStockDefault: String(s.low_stock_default),
  };
  return (
    <div>
      <PageHeader title="Store details" description="Your brand, contact information and invoice details." />
      <BrandChecklist
        items={[
          { label: "Logo", done: Boolean(s.logo_path), href: "#logo", hint: "Shown in your store header, invoices and labels" },
          { label: "Favicon", done: Boolean(s.favicon_path), href: "#favicon", hint: "The small icon in the browser tab" },
          { label: "Social share image", done: Boolean((s.seo as { og_image_path?: string } | null)?.og_image_path), href: "/dashboard/settings/seo", hint: "Shown when your store link is shared on WhatsApp, Instagram or Facebook" },
          { label: "Social media links", done: Object.values(social).some(Boolean), href: "#f-instagram", hint: "Instagram, Facebook, YouTube… shown in your store footer" },
        ]}
      />
      {can(ctx, "settings.write") ? (
        <StoreDetailsForm v={v} logoUrl={assetUrl(s.logo_path)} faviconUrl={assetUrl(s.favicon_path)} />
      ) : (
        <p className="text-sm text-muted">You can view but not change store settings.</p>
      )}
      {ctx.role === "owner" ? (
        <section className="mt-10 rounded-lg border border-error/30 p-5" aria-labelledby="danger-zone">
          <h2 id="danger-zone" className="text-h3 font-semibold">
            Close this store
          </h2>
          <p className="mt-1 text-small text-muted">
            For a store you no longer use. It goes offline and leaves your store switcher; all data is kept and support can reopen it.
            {ctx.memberships.length > 1 ? " You'll be switched to your other store." : ""}
          </p>
          <div className="mt-4">
            <CloseStoreButton storeName={ctx.tenantName} slug={ctx.tenantSlug} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** At-a-glance brand setup with links to each field (logo/favicon/socials below, share image under SEO). */
function BrandChecklist({ items }: { items: { label: string; done: boolean; href: string; hint: string }[] }) {
  const left = items.filter((i) => !i.done).length;
  return (
    <section aria-labelledby="brand-setup" className="mb-6 rounded-lg border border-border bg-surface p-4">
      <h2 id="brand-setup" className="text-h3 font-semibold">
        Brand & sharing {left ? <span className="text-small font-normal text-muted">· {left} to set up</span> : <span className="text-small font-normal text-success">· all set</span>}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.label}>
            <a href={i.href} className="flex items-start gap-2 rounded-md p-2 hover:bg-surface-secondary">
              <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i.done ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                {i.done ? "✓" : "!"}
              </span>
              <span>
                <span className="block text-small font-medium">
                  {i.label} <span className="sr-only">{i.done ? "(set)" : "(not set)"}</span>
                </span>
                <span className="block text-caption text-muted">{i.hint}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
