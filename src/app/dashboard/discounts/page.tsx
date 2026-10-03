import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney } from "@/lib/money";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listDiscounts } from "@/features/marketing/queries";
import { describeDiscount, discountStatus } from "@/features/marketing/discount-form";
import { ToggleDiscount } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Discounts" };
const TONE = { active: "success", scheduled: "accent", expired: "neutral", disabled: "neutral", exhausted: "warning" } as const;

export default async function DiscountsPage() {
  const ctx = await requireTenantPermission("marketing.read");
  const rows = await listDiscounts(ctx.tenantId);
  const writable = can(ctx, "marketing.write");
  return (
    <div>
      <PageHeader title="Discounts" description="Codes and automatic offers applied at checkout." actions={writable ? <Link href="/dashboard/discounts/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Create discount</Link> : null} />
      {rows.length === 0 ? (
        <EmptyState title="No discounts yet" description="Create a code like WELCOME10 or an automatic festive offer." />
      ) : (
        <Table caption="Discounts">
          <thead>
            <tr><th className={th}>Discount</th><th className={th}>Details</th><th className={th}>Used</th><th className={th}>Status</th>{writable ? <th className={th}><span className="sr-only">Actions</span></th> : null}</tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const st = discountStatus(d);
              return (
                <tr key={d.id}>
                  <td className={td}>
                    <Link href={`/dashboard/discounts/${d.id}`} className="font-medium hover:underline">{d.code ?? d.title}</Link>
                    <span className="block text-xs text-muted">{d.automatic ? "Automatic" : d.title}</span>
                  </td>
                  <td className={td}>{describeDiscount(d, formatMoney)}</td>
                  <td className={`${td} tabular-nums`}>{d.usage_count}{d.usage_limit ? ` / ${d.usage_limit}` : ""}</td>
                  <td className={td}><Badge tone={TONE[st]}>{st}</Badge></td>
                  {writable ? <td className={td}><ToggleDiscount id={d.id} active={d.status === "active"} /></td> : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
