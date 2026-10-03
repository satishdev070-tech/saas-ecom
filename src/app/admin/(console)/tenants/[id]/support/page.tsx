import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform/access";
import { getMyActiveSupportSession, getTenantDetail } from "@/features/platform/server/queries";
import { supportSessionState } from "@/features/platform/stats";
import { maskEmail } from "@/features/platform/privacy";
import { EndSupportButton, StartSupportForm } from "@/features/platform/components/admin-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/features/analytics/dates";
import { formatMoney, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Support view" };

/**
 * Read-only support view. Data is read with the support user's own session: RLS grants
 * viewer-level read access only while the support session is active (app.has_permission).
 * There are no write controls here, and viewer permissions exclude every write.
 */
export default async function SupportViewPage({ params }: PageProps<"/admin/tenants/[id]/support">) {
  const ctx = await requirePlatform("platform.support.impersonate");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, session] = await Promise.all([getTenantDetail(id), getMyActiveSupportSession(ctx.user.id, id)]);
  if (!t) notFound();
  const back = <Link href={`/admin/tenants/${id}`}>← {t.name}</Link>;
  if (!session) {
    return (
      <div>
        <PageHeader title="Support view" back={back} />
        <EmptyState title="No active support session" description="Start a session with a reason to view this store's data read-only." action={<StartSupportForm tenantId={id} />} />
      </div>
    );
  }
  const state = supportSessionState({ ended_at: session.endedAt, expires_at: session.expiresAt });
  const supabase = await createSupabaseServerClient();
  const [orders, products] = await Promise.all([
    supabase.from("orders").select("id, order_number, email, status, payment_status, fulfillment_status, grand_total, created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(25),
    supabase.from("products").select("id, title, slug, status, min_price, updated_at").eq("tenant_id", id).order("updated_at", { ascending: false }).limit(25),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Support view · ${t.name}`}
        description={
          <>
            Read-only. {state.state === "active" ? `${state.minutesLeft} min left` : "Expired"} · reason: {session.reason}
          </>
        }
        back={back}
        actions={<EndSupportButton sessionId={session.id} tenantId={id} />}
      />
      <Card title="Recent orders">
        {orders.data?.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Customer</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((o) => (
                <tr key={o.id}>
                  <td className={td}>#{o.order_number}</td>
                  <td className={td}>{maskEmail(o.email)}</td>
                  <td className={td}>
                    <Badge>{o.status}</Badge> <Badge tone={o.payment_status === "paid" ? "success" : "neutral"}>{o.payment_status}</Badge> <Badge>{o.fulfillment_status}</Badge>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(toMinor(o.grand_total))}</td>
                  <td className={td}>{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">{orders.error ? "Orders aren't readable (session may have expired)." : "No orders yet."}</p>
        )}
      </Card>
      <Card title="Recently updated products">
        {products.data?.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>From</th>
                <th className={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {products.data.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    {p.title}
                    <p className="text-xs text-muted">/{p.slug}</p>
                  </td>
                  <td className={td}>
                    <Badge>{p.status}</Badge>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{p.min_price === null ? "—" : formatMoney(toMinor(p.min_price))}</td>
                  <td className={td}>{formatDateTime(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">No products.</p>
        )}
      </Card>
    </div>
  );
}
