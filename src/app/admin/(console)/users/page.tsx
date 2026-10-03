import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { listPlatformUsers } from "@/features/platform/server/queries";
import { AddPlatformUserForm, PlatformUserControls } from "@/features/platform/components/admin-forms";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { formatDate } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Platform users" };

export default async function PlatformUsersPage() {
  const ctx = await requirePlatform("platform.users.manage");
  const users = await listPlatformUsers();
  return (
    <div className="space-y-6">
      <PageHeader title="Platform users" description="People who can use this console. Every change is audited." />
      <Card title="Add a platform user">
        <AddPlatformUserForm />
      </Card>
      <Table>
        <thead>
          <tr>
            <th className={th}>User</th>
            <th className={th}>Role</th>
            <th className={th}>Status</th>
            <th className={th}>Added</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.userId}>
              <td className={td}>
                {u.displayName ?? u.email ?? u.userId}
                <p className="text-xs text-muted">{u.email}</p>
              </td>
              <td className={td}>{u.role.replace("_", " ")}</td>
              <td className={td}>
                <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.status}</Badge>
              </td>
              <td className={td}>
                {formatDate(u.createdAt)}
                {u.createdByEmail ? <p className="text-xs text-muted">by {u.createdByEmail}</p> : null}
              </td>
              <td className={td}>
                <PlatformUserControls userId={u.userId} role={u.role} status={u.status} self={u.userId === ctx.user.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
