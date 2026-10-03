import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission, can } from "@/lib/tenant/membership";
import { storeOrigin } from "@/lib/platform/urls";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { domainSettings, getDomainAllowance, listTenantDomains, type DomainAllowance } from "@/features/domains/server/service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { AddDomainForm, RemoveDomainButton, SetPrimaryButton, VerifyDomainButton } from "@/features/domains/components/domain-controls";
import { DnsInstructions, DomainStatusBadge, ProviderStatusBadge, SslStatusBadge, VercelDnsInstructions } from "@/features/domains/components/domain-display";
import { parseStoredDnsRecords } from "@/features/domains/vercel-status";

export const metadata: Metadata = { title: "Domains" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof AppError ? { code: error.code, message: error.message, context: error.context } : { error };
}

async function loadDomains(tenantId: string) {
  const domains = await listTenantDomains(tenantId);
  let allowance: DomainAllowance | null = null;
  try {
    allowance = await getDomainAllowance(tenantId, domains);
  } catch (error) {
    // Plan lookup failed: still show the domains, just without the add form.
    logger.error("domains.allowance_failed", { tenantId, ...errorFields(error) });
  }
  return { domains, allowance, ...domainSettings() };
}

export default async function DomainsSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const canManage = can(ctx, "domains.manage");
  let loaded: Awaited<ReturnType<typeof loadDomains>>;
  try {
    loaded = await loadDomains(ctx.tenantId);
  } catch (error) {
    logger.error("domains.page_failed", { tenantId: ctx.tenantId, ...errorFields(error) });
    return (
      <div className="space-y-6">
        <PageHeader
          title="Domains"
          back={
            <Link href="/dashboard/settings" className="text-muted hover:text-foreground">
              ← Settings
            </Link>
          }
        />
        <Card title="Domains are unavailable right now">
          <p role="alert" className="text-sm text-muted">
            We couldn&apos;t load your domains. Your store is still online at its current addresses. Please try again in a few minutes; if this keeps
            happening, contact platform support.
          </p>
        </Card>
      </div>
    );
  }
  const { domains, allowance, cnameTarget, edge } = loaded;
  const platform = domains.filter((d) => d.type === "platform_subdomain");
  const custom = domains.filter((d) => d.type === "custom");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="Your store is always available on its platform address. Connect your own domain to give shoppers a branded web address."
        back={
          <Link href="/dashboard/settings" className="text-muted hover:text-foreground">
            ← Settings
          </Link>
        }
      />

      {!canManage ? (
        <p role="note" className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
          You can view domains but not change them. Ask the store owner or an admin for access.
        </p>
      ) : null}

      <Card title="Platform address" description="Always works, even if you connect a custom domain.">
        <ul className="space-y-3">
          {platform.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <a href={storeOrigin(d.hostname)} target="_blank" rel="noopener noreferrer" className="break-all font-medium hover:underline">
                  {d.hostname}
                </a>
                <div className="mt-1 flex flex-wrap gap-2">
                  {d.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                  <DomainStatusBadge status={d.status} />
                </div>
              </div>
              {canManage && !d.is_primary && d.status === "verified" ? <SetPrimaryButton domainId={d.id} /> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Custom domains"
        description={
          allowance?.enabled
            ? allowance.limit === null
              ? `${allowance.used} connected`
              : `${allowance.used} of ${allowance.limit} used on your ${allowance.planName ?? "current"} plan`
            : undefined
        }
      >
        {!allowance ? (
          <p role="status" className="text-sm text-muted">
            We couldn&apos;t check your plan right now, so adding a domain is paused. Existing domains keep working.
          </p>
        ) : !allowance.enabled ? (
          <EmptyState
            title="Custom domains aren't included in your plan"
            description="Upgrade your plan to sell from your own domain, such as www.yourbrand.in."
            action={
              <Link href="/dashboard/settings" className="text-sm font-medium text-accent underline">
                View plan details
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {canManage && allowance.canAdd ? <AddDomainForm apexSupported={edge === "vercel"} /> : null}
            {canManage && !allowance.canAdd ? (
              <p className="text-sm text-muted">You&apos;ve used all custom domains on your plan. Remove one to add another.</p>
            ) : null}

            {custom.length === 0 ? (
              <EmptyState title="No custom domain yet" description="Add a domain you own, then create two DNS records at your domain provider to verify it." />
            ) : (
              <ul className="space-y-4">
                {custom.map((d) => {
                  const vercelRecords = d.provider === "vercel" ? parseStoredDnsRecords(d.dns_records) : [];
                  const edgeLive = !edge || d.ssl_status === "active";
                  return (
                  <li key={d.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-all font-medium">
                          {d.status === "verified" ? (
                            <a href={storeOrigin(d.hostname)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {d.hostname}
                            </a>
                          ) : (
                            d.hostname
                          )}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {d.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                          <DomainStatusBadge status={d.status} />
                          {d.status === "verified" ? <SslStatusBadge status={d.ssl_status} /> : null}
                          {d.provider === "vercel" ? <ProviderStatusBadge status={d.provider_status} /> : null}
                        </div>
                        {d.redirect_hostname ? <p className="mt-1 text-xs text-muted">{d.redirect_hostname} redirects here</p> : null}
                        <p className="mt-2 text-xs text-muted">
                          {d.last_checked_at ? `Last checked ${dateFmt.format(new Date(d.last_checked_at))}` : "Not checked yet"}
                          {d.verified_at ? ` · Verified ${dateFmt.format(new Date(d.verified_at))}` : ""}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex flex-wrap items-start gap-2">
                          {d.status !== "verified" || !edgeLive ? <VerifyDomainButton domainId={d.id} /> : null}
                          {d.status === "verified" && !d.is_primary && edgeLive ? <SetPrimaryButton domainId={d.id} /> : null}
                          <RemoveDomainButton domainId={d.id} hostname={d.hostname} />
                        </div>
                      ) : null}
                    </div>

                    {d.last_error ? (
                      <p role="status" className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                        {d.last_error}
                      </p>
                    ) : null}

                    {vercelRecords.length > 0 && (d.status !== "verified" || d.provider_status !== "active") ? (
                      <div className="mt-4 space-y-2">
                        <h3 className="text-sm font-semibold">Add these DNS records at your domain provider</h3>
                        <VercelDnsInstructions records={vercelRecords} />
                        <p className="text-xs text-muted">We also re-check domains automatically. Your store goes live on this domain once ownership is verified and SSL is active.</p>
                      </div>
                    ) : d.status !== "verified" ? (
                      <div className="mt-4 space-y-2">
                        <h3 className="text-sm font-semibold">Add these DNS records at your domain provider</h3>
                        <DnsInstructions hostname={d.hostname} token={d.verification_token} cnameTarget={cnameTarget} />
                        <p className="text-xs text-muted">We also re-check pending domains automatically every few minutes.</p>
                      </div>
                    ) : !edgeLive ? (
                      <p className="mt-3 text-sm text-muted">SSL certificate is being issued. This usually takes a few minutes; you can make the domain primary once it&apos;s active.</p>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
