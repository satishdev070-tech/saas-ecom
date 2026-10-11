import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor } from "@/lib/money";
import { Badge, PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { SelectField, TextField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar, queryString } from "@/features/settings/ui/filter-bar";
import { getStoreProfile } from "@/features/settings/queries";
import { orderNumberLabel } from "@/features/orders-admin/format";
import { formatDateTime } from "@/features/analytics/dates";
import { listIntegrationSummaries } from "@/features/integrations/server/store";
import { queryTransactions, refundTotal, transactionSummary } from "@/features/payments/transactions";
import { TXN_PAGE_SIZE, TXN_PROVIDERS, TXN_STATUSES, methodLabel, parseTxnFilters, providerLabel, txnStatusLabel, txnStatusTone } from "@/features/payments/transactions-format";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsTransactionsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  const ctx = await requireTenantPermission("orders.read");
  const f = parseTxnFilters(await searchParams);
  const [{ rows, total }, summary, refunds, store, gateways] = await Promise.all([
    queryTransactions(ctx, f, { offset: (f.page - 1) * TXN_PAGE_SIZE, limit: TXN_PAGE_SIZE }),
    transactionSummary(ctx, f),
    refundTotal(ctx, f),
    getStoreProfile(ctx.tenantId),
    listIntegrationSummaries(ctx.tenantId, "payment").catch(() => []),
  ]);
  const params = { q: f.q, provider: f.provider, status: f.status, from: f.from, to: f.to };
  const filtered = Object.values(params).some(Boolean);
  const live = gateways.filter((g) => g.enabled && g.status === "connected" && g.featureEnabled);
  const canManage = can(ctx, "payments.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every online payment attempt on your store, from Razorpay, Cashfree and PayU, with its status at the gateway."
        actions={
          <>
            {canManage ? (
              <Link href="/dashboard/settings/payments" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-background">
                Gateway settings
              </Link>
            ) : null}
            {total > 0 ? (
              <a href={`/dashboard/payments/export${queryString(params)}`} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-background" download>
                Export CSV
              </a>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-small">
        <span className="text-muted">Live at checkout:</span>
        {live.length ? live.map((g) => <Badge key={g.provider} tone="success">{providerLabel(g.provider)} · {g.environment === "live" ? "Live" : "Test"} mode</Badge>) : <Badge tone="warning">No online gateway is live</Badge>}
        {!live.length && canManage ? (
          <Link href="/dashboard/settings/payments" className="text-accent hover:underline">
            Connect a gateway
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={formatMoney(summary.collectedMinor)} hint={`${summary.successCount} successful payment${summary.successCount === 1 ? "" : "s"}${filtered ? " (filtered)" : ""}`} />
        <StatCard label="Success rate" value={summary.successRate === null ? "—" : `${Math.round(summary.successRate * 100)}%`} hint={`${summary.failedCount} failed · ${summary.pendingCount} not completed`} />
        <StatCard label="Refunded" value={formatMoney(refunds.amountMinor)} hint={`${refunds.count} refund${refunds.count === 1 ? "" : "s"}`} />
        <StatCard
          label="By gateway"
          value={summary.byProvider.filter((p) => p.count > 0).length || "—"}
          hint={summary.byProvider.filter((p) => p.count > 0).map((p) => `${providerLabel(p.provider)} ${formatMoney(p.collectedMinor)}`).join(" · ") || "No successful payments yet"}
        />
      </div>
      {summary.capped ? <p className="text-caption text-muted">Totals cover the latest 20,000 transactions. Narrow the dates for exact figures.</p> : null}

      <FilterBar action="/dashboard/payments" resetHref="/dashboard/payments" label="Filter payments">
        <TextField label="Search" name="q" type="search" defaultValue={f.q ?? ""} placeholder="Order # or gateway ID (pay_…, order_…)" className="sm:col-span-2" maxLength={100} />
        <SelectField label="Gateway" name="provider" defaultValue={f.provider ?? ""} options={[{ value: "", label: "All gateways" }, ...TXN_PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) }))]} />
        <SelectField label="Status" name="status" defaultValue={f.status ?? ""} options={[{ value: "", label: "Any status" }, ...TXN_STATUSES.map((s) => ({ value: s, label: txnStatusLabel(s) }))]} />
        <TextField label="From" name="from" type="date" defaultValue={f.from ?? ""} />
        <TextField label="To" name="to" type="date" defaultValue={f.to ?? ""} />
      </FilterBar>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No payments match these filters"
            description="Try a different search or clear the filters."
            action={
              <Link href="/dashboard/payments" className="text-sm font-medium text-accent underline">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState title="No online payments yet" description="When a shopper pays online at checkout, each attempt appears here with its gateway status. Cash on delivery orders are listed under Orders." />
        )
      ) : (
        <>
          <Table caption="Payment transactions">
            <thead>
              <tr>
                <th scope="col" className={th}>Date</th>
                <th scope="col" className={th}>Order</th>
                <th scope="col" className={th}>Gateway</th>
                <th scope="col" className={th}>Method</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Gateway reference</th>
                <th scope="col" className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-background">
                  <td className={`${td} whitespace-nowrap text-muted`}>
                    {formatDateTime(r.created_at)}
                    {r.paid_at && r.paid_at.slice(0, 16) !== r.created_at.slice(0, 16) ? <p className="text-xs">Paid {formatDateTime(r.paid_at)}</p> : null}
                  </td>
                  <td className={td}>
                    {r.orders ? (
                      <Link href={`/dashboard/orders/${r.order_id}`} className="font-medium text-accent hover:underline">
                        {orderNumberLabel(r.orders.order_number, store.order_prefix)}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {r.orders?.email || r.orders?.phone ? <p className="max-w-[12rem] truncate text-xs text-muted">{r.orders.email ?? r.orders.phone}</p> : null}
                  </td>
                  <td className={td}>{providerLabel(r.provider)}</td>
                  <td className={td}>{methodLabel(r.method)}</td>
                  <td className={td}>
                    <Badge tone={txnStatusTone(r.status)}>{txnStatusLabel(r.status)}</Badge>
                    {r.status === "failed" && r.error_description ? <p className="mt-1 max-w-[14rem] truncate text-xs text-muted" title={r.error_description}>{r.error_description}</p> : null}
                  </td>
                  <td className={`${td} font-mono text-xs`}>
                    {r.provider_payment_id ? <p className="max-w-[14rem] truncate" title={r.provider_payment_id}>{r.provider_payment_id}</p> : null}
                    {r.provider_order_id ? <p className="max-w-[14rem] truncate text-muted" title={r.provider_order_id}>{r.provider_order_id}</p> : null}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(toMinor(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={TXN_PAGE_SIZE} total={total} basePath="/dashboard/payments" params={params} />
        </>
      )}
    </div>
  );
}
