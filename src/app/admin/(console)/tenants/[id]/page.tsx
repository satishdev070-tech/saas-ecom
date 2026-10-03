import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform/access";
import {
  getMyActiveSupportSession,
  getStorageUsage,
  getTenantCounts,
  getTenantDetail,
  getTenantMonthlyUsage,
  listAuditLogs,
  listFeatureFlags,
  listPlans,
  listTenantDomainsForPlatform,
  listTenantFlagOverrides,
  listTenantMembers,
} from "@/features/platform/server/queries";
import { getEntitlements } from "@/features/platform";
import { planLimitValue } from "@/features/platform/schemas";
import { percentOfLimit, storageLimitBytes } from "@/features/platform/stats";
import { formatBytes } from "@/features/platform/health";
import { maskEmail } from "@/features/platform/privacy";
import { ChangePlanForm, ExtendTrialForm, FlagOverrideForm, RecheckDomainButton, StartSupportForm, TenantStatusForm } from "@/features/platform/components/admin-forms";
import { DomainStatusBadge, SslStatusBadge } from "@/features/domains/components/domain-display";
import { Badge, Card, PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { formatDate, formatDateTime } from "@/features/analytics/dates";
import { formatMoney } from "@/lib/money";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { getStoreConfiguration } from "@/features/platform/server/store-config";
import { PROVIDERS } from "@/features/integrations/registry";

export const metadata: Metadata = { title: "Store" };
const TONE = { trial: "accent", active: "success", suspended: "error", cancelled: "neutral" } as const;

function Meter({ label, used, limit, fmt = String }: { label: string; used: number; limit: number | null; fmt?: (n: number) => string }) {
  const pct = percentOfLimit(used, limit);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {fmt(used)} / {limit === null ? "∞" : fmt(limit)}
        </span>
      </div>
      <div className="mt-1 h-2 rounded bg-border" role="meter" aria-label={label} aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-2 rounded ${pct !== null && pct >= 90 ? "bg-error" : "bg-accent"}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </div>
    </div>
  );
}

export default async function TenantDetailPage({ params, searchParams }: PageProps<"/admin/tenants/[id]">) {
  const ctx = await requirePlatform("platform.tenants.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getTenantDetail(id);
  if (!t) notFound();
  const sp = await searchParams;
  const manage = ctx.permissions.has("platform.tenants.manage");
  const canFlags = ctx.permissions.has("platform.flags.manage");
  const canSupport = ctx.permissions.has("platform.support.impersonate");
  const canAudit = ctx.permissions.has("platform.audit.read");
  const [counts, usage, storage, domains, members, audit, flags, overrides, plans, ent, session] = await Promise.all([
    getTenantCounts(id),
    getTenantMonthlyUsage(id, 6),
    getStorageUsage(id, 1),
    listTenantDomainsForPlatform(id),
    listTenantMembers(id),
    canAudit ? listAuditLogs({ tenant: id, pageSize: 15 }) : Promise.resolve({ rows: [], hasMore: false }),
    listFeatureFlags(),
    listTenantFlagOverrides(id),
    manage ? listPlans() : Promise.resolve([]),
    getEntitlements(id),
    canSupport ? getMyActiveSupportSession(ctx.user.id, id) : Promise.resolve(null),
  ]);
  const config = await getStoreConfiguration(id);
  const limits = t.plan?.limits ?? null;
  const bytes = storage[0]?.bytes ?? 0;
  const url = storeOrigin(storeSubdomain(t.slug));
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[t.status]}>{t.status}</Badge>
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              {t.slug}
            </a>
            <span>· {t.plan?.name ?? "No plan"}</span>
            {t.status === "trial" ? <span>· trial ends {formatDate(t.trialEndsAt)}</span> : null}
          </span>
        }
        back={<Link href="/admin/stores">← Stores</Link>}
        actions={
          <>
            {manage ? <TenantStatusForm tenantId={id} status={t.status} /> : null}
            {manage ? <ChangePlanForm tenantId={id} planId={t.planId} plans={plans.map((p) => ({ value: p.id, label: p.name }))} /> : null}
            {manage && t.status === "trial" ? <ExtendTrialForm tenantId={id} /> : null}
            {canSupport ? (
              session ? (
                <Link href={`/admin/tenants/${id}/support`} className="inline-flex h-8 items-center rounded-md border border-warning px-3 text-sm font-medium text-warning">
                  Open support view
                </Link>
              ) : (
                <StartSupportForm tenantId={id} />
              )
            ) : null}
          </>
        }
      />
      {sp.created ? (
        <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Store created.
        </p>
      ) : null}
      {t.statusReason ? <p className="text-sm text-muted">Status reason: {t.statusReason}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products" value={counts.products} />
        <StatCard label="Orders" value={counts.orders} />
        <StatCard label="Customers" value={counts.customers} />
        <StatCard label="Lifetime GMV" value={formatMoney(counts.gmvMinor)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Plan usage">
          <div className="space-y-4">
            <Meter label="Products" used={counts.products} limit={planLimitValue(limits, "products")} />
            <Meter label="Staff" used={members.filter((m) => m.status === "active").length} limit={planLimitValue(limits, "staff")} />
            <Meter label="Storage" used={bytes} limit={storageLimitBytes(planLimitValue(limits, "storage_mb"))} fmt={formatBytes} />
            <Meter label="Custom domains" used={domains.filter((d) => d.type === "custom" && d.status !== "removed").length} limit={planLimitValue(limits, "custom_domains")} />
          </div>
        </Card>
        <Card title="Monthly sales">
          <Table>
            <thead>
              <tr>
                <th className={th}>Month</th>
                <th className={`${th} text-right`}>Orders</th>
                <th className={`${th} text-right`}>GMV</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.month}>
                  <td className={td}>{u.label}</td>
                  <td className={`${td} text-right tabular-nums`}>{u.orders}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(u.gmvMinor)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="Store profile">
        {t.store ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Display name</dt>
              <dd>{t.store.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Contact email</dt>
              <dd>{maskEmail(t.store.email)}</dd>
            </div>
            <div>
              <dt className="text-muted">GSTIN</dt>
              <dd>{t.store.gstin ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Legal name</dt>
              <dd>{t.store.legalName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Created</dt>
              <dd>{formatDateTime(t.createdAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">The owner hasn&apos;t finished store setup.</p>
        )}
      </Card>

      <Card title="Domains">
        <Table>
          <thead>
            <tr>
              <th className={th}>Hostname</th>
              <th className={th}>Status</th>
              <th className={th}>SSL</th>
              <th className={th}>Last check</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  {d.hostname} {d.isPrimary ? <Badge tone="accent">primary</Badge> : null}
                  {d.lastError ? <p className="text-xs text-error">{d.lastError}</p> : null}
                </td>
                <td className={td}>
                  <DomainStatusBadge status={d.status} />
                </td>
                <td className={td}>
                  <SslStatusBadge status={d.sslStatus} />
                </td>
                <td className={td}>{formatDateTime(d.lastCheckedAt)}</td>
                <td className={td}>{manage && d.type === "custom" && d.status !== "removed" ? <RecheckDomainButton domainId={d.id} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Team">
        <Table>
          <thead>
            <tr>
              <th className={th}>Member</th>
              <th className={th}>Role</th>
              <th className={th}>Status</th>
              <th className={th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td className={td}>
                  {m.displayName ?? "—"}
                  <p className="text-xs text-muted">{m.email ?? "—"}</p>
                </td>
                <td className={`${td} capitalize`}>{m.role}</td>
                <td className={td}>{m.status}</td>
                <td className={td}>{formatDate(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Configuration" description="Connection state only. Credentials are never shown here.">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted">Published theme</dt>
            <dd>{config.theme ? `${config.theme.key} · v${config.theme.version}${config.theme.publishedAt ? ` · ${formatDate(config.theme.publishedAt)}` : ""}` : "Not published"}</dd>
          </div>
          <div>
            <dt className="text-muted">Cash on delivery</dt>
            <dd>{config.codEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-muted">Default courier</dt>
            <dd>{config.defaultCourier ?? "Manual fulfilment"}</dd>
          </div>
          {(["payment", "shipping", "tracking", "social"] as const).map((kind) => (
            <div key={kind}>
              <dt className="text-muted">{{ payment: "Payment gateways", shipping: "Couriers", tracking: "Analytics & ads", social: "Social accounts" }[kind]}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {config.integrations.filter((i) => i.kind === kind).length ? (
                  config.integrations
                    .filter((i) => i.kind === kind)
                    .map((i) => (
                      <Badge key={i.provider} tone={i.status === "connected" ? (i.enabled ? "success" : "neutral") : i.status === "error" || i.status === "expired" ? "error" : "neutral"}>
                        {PROVIDERS[i.provider as keyof typeof PROVIDERS]?.label ?? i.provider}: {i.status === "connected" ? (i.enabled ? `on${i.environment === "test" ? " (test)" : ""}` : "off") : i.status.replace("_", " ")}
                      </Badge>
                    ))
                ) : (
                  <span className="text-muted">Not connected</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Feature flags" description="Resolved value for this store; overrides beat the plan, which beats the flag default.">
        <Table>
          <thead>
            <tr>
              <th className={th}>Flag</th>
              <th className={th}>Effective</th>
              <th className={th}>Override</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => {
              const r = ent.features[f.key];
              const ov = overrides.get(f.key);
              return (
                <tr key={f.key}>
                  <td className={td}>
                    <code className="text-xs">{f.key}</code>
                    {f.description ? <p className="text-xs text-muted">{f.description}</p> : null}
                  </td>
                  <td className={td}>
                    <Badge tone={r?.enabled ? "success" : "neutral"}>{r?.enabled ? "on" : "off"}</Badge> <span className="text-xs text-muted">{r?.source ?? "default"}</span>
                  </td>
                  <td className={td}>{canFlags ? <FlagOverrideForm tenantId={id} flagKey={f.key} value={ov === undefined ? "inherit" : ov ? "on" : "off"} /> : ov === undefined ? "—" : ov ? "on" : "off"}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {canAudit ? (
        <Card title="Recent activity" actions={<Link href={`/admin/audit?tenant=${id}`} className="text-sm text-accent">Full audit log →</Link>}>
          {audit.rows.length ? (
            <ul className="divide-y divide-border text-sm">
              {audit.rows.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <code className="text-xs">{a.action}</code> <span className="text-muted">by {a.actorEmail ?? a.actorType}</span>
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No activity yet.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
