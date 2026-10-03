import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { OWNER_ONLY_PERMISSIONS } from "@/lib/permissions/matrix";
import { PageHeader } from "@/components/ui/layout";
import { RoleEditor } from "@/features/team/components/role-editor";

export const metadata: Metadata = { title: "Create role" };

export default async function NewRolePage() {
  const ctx = await requireTenantPermission("roles.manage");
  const grantable = [...ctx.permissions].filter((p) => !OWNER_ONLY_PERMISSIONS.includes(p));
  return (
    <div className="space-y-6">
      <PageHeader title="Create role" description="Pick exactly what members with this role can do." back={<Link href="/dashboard/settings/roles">← Roles & permissions</Link>} />
      <RoleEditor grantable={grantable} />
    </div>
  );
}
