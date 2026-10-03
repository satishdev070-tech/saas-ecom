import type { Metadata } from "next";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { Card, PageHeader } from "@/components/ui/layout";
import { linkTargets, listMenus } from "@/features/content/queries";
import { DeleteRow, MenuEditor } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Navigation" };

export default async function MenusPage() {
  const ctx = await requireTenantPermission("content.write");
  const [menus, targets] = await Promise.all([listMenus(ctx.tenantId), linkTargets(ctx.tenantId)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Navigation" description="Menus used by your theme's header (main) and footer." />
      {menus.map((m) => (
        <Card key={m.id} title={`${m.title} (${m.handle})`} actions={m.handle !== "main" ? <DeleteRow kind="menu" id={m.id} /> : null}>
          <MenuEditor menu={{ id: m.id, handle: m.handle, title: m.title, items: m.items.map((i) => ({ ...i, children: i.children })) }} targets={targets} />
        </Card>
      ))}
      <Card title="New menu">
        <MenuEditor menu={{ handle: menus.some((m) => m.handle === "main") ? "" : "main", title: menus.some((m) => m.handle === "main") ? "" : "Main menu", items: [] }} targets={targets} />
      </Card>
    </div>
  );
}
