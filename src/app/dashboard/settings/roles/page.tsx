import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { TENANT_ROLES, TENANT_ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { PERMISSION_GROUPS, ROLE_INFO } from "@/lib/permissions/labels";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonClass } from "@/components/ui/button";
import { listCustomRoles } from "@/features/team/queries";
import { ActionDialog } from "@/features/settings/ui/action-controls";
import { deleteCustomRoleAction } from "@/features/team/actions";

export const metadata: Metadata = { title: "Roles & permissions" };

const LABEL = new Map(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)));

export default async function RolesPage({ searchParams }: PageProps<"/dashboard/settings/roles">) {
  const ctx = await requireTenantPermission("roles.manage");
  const sp = await searchParams;
  const custom = await listCustomRoles(ctx.tenantId);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Roles & permissions"
        description="Standard roles cover most teams. Create custom roles when someone needs a precise set of permissions."
        back={<Link href="/dashboard/settings/team">← Team</Link>}
        actions={
          <Link href="/dashboard/settings/roles/new" className={buttonClass()}>
            <Plus aria-hidden /> Create role
          </Link>
        }
      />
      {sp.saved ? (
        <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">
          Role saved. Members with this role get the new permissions on their next page load.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-h2">Custom roles</h2>
        {custom.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {custom.map((r) => (
              <Card key={r.id} title={r.name} description={r.description ?? undefined} actions={<Badge>{r.memberCount} {r.memberCount === 1 ? "member" : "members"}</Badge>}>
                <p className="line-clamp-2 text-small text-muted">{r.permissions.map((p) => LABEL.get(p) ?? p).join(" · ")}</p>
                <div className="mt-4 flex gap-2">
                  <Link href={`/dashboard/settings/roles/${r.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                    Edit
                  </Link>
                  <ActionDialog
                    action={deleteCustomRoleAction}
                    fields={{ id: r.id }}
                    title={`Delete “${r.name}”?`}
                    description={r.memberCount ? "Members still have this role. Give them another role first." : "This can't be undone."}
                    triggerLabel="Delete"
                    confirmLabel="Delete role"
                    variant="danger"
                    triggerVariant="ghost"
                    disabled={r.memberCount > 0}
                  />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck />}
            title="No custom roles yet"
            description="For example, a “Photo editor” who can edit products but not publish or delete them."
            action={
              <Link href="/dashboard/settings/roles/new" className={buttonClass({ variant: "secondary" })}>
                Create a custom role
              </Link>
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Standard roles</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
          <ul className="divide-y divide-border">
            {TENANT_ROLES.map((r) => (
              <li key={r}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3.5 hover:bg-surface-secondary/50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-body font-medium">
                        {ROLE_INFO[r].label}
                        {r === "owner" ? <Badge tone="accent">Owner</Badge> : null}
                      </span>
                      <span className="block text-small text-muted">{ROLE_INFO[r].description}</span>
                    </span>
                    <span className="shrink-0 text-caption text-muted">{TENANT_ROLE_PERMISSIONS[r].size} permissions</span>
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <ul className="flex flex-wrap gap-1.5 border-t border-border bg-surface-secondary/40 px-4 py-3">
                    {[...TENANT_ROLE_PERMISSIONS[r]].map((p) => (
                      <li key={p}>
                        <Badge>{LABEL.get(p) ?? p}</Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-caption text-muted">Standard roles can&apos;t be edited. Store Owner permissions never include platform administration.</p>
      </section>
    </div>
  );
}
