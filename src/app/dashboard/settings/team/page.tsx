import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, UsersRound } from "lucide-react";
import { can, requireTenant } from "@/lib/tenant/membership";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonClass } from "@/components/ui/button";
import { roleLabel } from "@/lib/permissions/labels";
import { listCustomRoles, listPendingInvites, listTeam } from "@/features/team/queries";
import { roleOptions } from "@/features/team/role-options";
import { encodeRoleChoice } from "@/features/team/role-choice";
import { InviteActions, InviteMemberDialog, MemberActions, MemberRoleForm } from "@/features/team/components/team-ui";

export const metadata: Metadata = { title: "Team" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const relFmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function lastActive(iso: string | null): string {
  if (!iso) return "Never signed in";
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  return days > -1 ? "Today" : Math.abs(days) < 30 ? relFmt.format(days, "day") : dateFmt.format(new Date(iso));
}

export default async function TeamPage() {
  const ctx = await requireTenant();
  if (!can(ctx, "members.read") && !can(ctx, "members.manage")) redirect("/dashboard?denied=1");
  const manage = can(ctx, "members.manage");
  const [members, invites, custom] = await Promise.all([listTeam(ctx.tenantId), manage ? listPendingInvites(ctx.tenantId) : Promise.resolve([]), listCustomRoles(ctx.tenantId)]);
  const options = roleOptions(ctx, custom);
  const active = members.filter((m) => m.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={`${active} active ${active === 1 ? "member" : "members"}${invites.length ? ` · ${invites.length} pending ${invites.length === 1 ? "invitation" : "invitations"}` : ""}`}
        actions={
          <>
            {can(ctx, "roles.manage") ? (
              <Link href="/dashboard/settings/roles" className={buttonClass({ variant: "secondary" })}>
                <ShieldCheck aria-hidden /> Roles & permissions
              </Link>
            ) : null}
            {manage ? <InviteMemberDialog roles={options} /> : null}
          </>
        }
      />

      {members.length ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_140px_minmax(0,1.2fr)] gap-4 border-b border-border bg-surface-secondary/60 px-4 py-2.5 text-caption font-medium text-muted lg:grid">
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last active</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const editable = manage && m.role !== "owner" && m.userId !== ctx.user.id;
              return (
                <li key={m.membershipId} className="grid gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_140px_minmax(0,1.2fr)] lg:items-center lg:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-secondary text-small font-semibold ring-1 ring-border">
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium">
                        {m.name}
                        {m.userId === ctx.user.id ? <span className="ml-1.5 text-caption font-normal text-muted">(you)</span> : null}
                      </span>
                      <span className="block truncate text-small text-muted">{m.email}</span>
                    </span>
                  </div>
                  <div>
                    {editable ? (
                      <MemberRoleForm membershipId={m.membershipId} current={encodeRoleChoice(m.role, m.customRoleId)} roles={options} />
                    ) : (
                      <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{roleLabel(m.role, m.customRoleName)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 lg:block">
                    <span className="text-caption text-muted lg:hidden">Status</span>
                    <Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status === "active" ? "Active" : "Deactivated"}</Badge>
                  </div>
                  <div className="text-small text-muted">
                    <span className="lg:hidden">Last active: </span>
                    {lastActive(m.lastActiveAt)}
                  </div>
                  <div>{editable ? <MemberActions membershipId={m.membershipId} name={m.name} status={m.status} /> : null}</div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState icon={<UsersRound />} title="No team members yet" description="Invite people to help run your store. You choose exactly what each person can do." />
      )}

      {manage && invites.length ? (
        <Card title="Pending invitations" description="Links expire after 7 days. Resending creates a new link.">
          <ul className="-my-2 divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">{i.email}</p>
                  <p className="text-small text-muted">
                    {roleLabel(i.role, i.customRoleName)} · expires {dateFmt.format(new Date(i.expiresAt))}
                  </p>
                </div>
                <InviteActions id={i.id} email={i.email} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
