import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { OWNER_ONLY_PERMISSIONS } from "@/lib/permissions/matrix";
import { PageHeader } from "@/components/ui/layout";
import { RoleEditor } from "@/features/team/components/role-editor";
import { getCustomRole } from "@/features/team/queries";

export const metadata: Metadata = { title: "Edit role" };

export default async function EditRolePage({ params }: PageProps<"/dashboard/settings/roles/[id]">) {
  const ctx = await requireTenantPermission("roles.manage");
  const { id } = await params;
  const role = /^[0-9a-f-]{36}$/i.test(id) ? await getCustomRole(ctx.tenantId, id) : null;
  if (!role) notFound();
  const grantable = [...ctx.permissions].filter((p) => !OWNER_ONLY_PERMISSIONS.includes(p));
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit “${role.name}”`}
        description={`${role.memberCount} ${role.memberCount === 1 ? "member has" : "members have"} this role.`}
        back={<Link href="/dashboard/settings/roles">← Roles & permissions</Link>}
      />
      <RoleEditor role={role} grantable={grantable} />
    </div>
  );
}
