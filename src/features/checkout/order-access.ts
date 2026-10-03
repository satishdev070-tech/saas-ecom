import "server-only";
import { signToken, verifyToken } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { storeOrigin } from "@/lib/platform/urls";

/**
 * Guest access to an order page is by a signed token (signToken("order", orderId)) in the URL,
 * never by a bare id. Pages still filter by the host-resolved tenant, so a token for another
 * store's order finds nothing.
 */
export function orderAccessToken(orderId: string): string {
  return signToken("order", orderId);
}

export function verifyOrderAccessToken(orderId: string, token: string | null | undefined): boolean {
  return Boolean(token) && verifyToken("order", token) === orderId;
}

export function orderPath(orderId: string): string {
  return `/orders/${orderId}?t=${encodeURIComponent(orderAccessToken(orderId))}`;
}

export function paymentPath(orderId: string): string {
  return `/checkout/pay?t=${encodeURIComponent(orderAccessToken(orderId))}`;
}

/** Order id from a signed token (for /checkout/pay?t=...). */
export function orderIdFromToken(token: string | null | undefined): string | null {
  const id = verifyToken("order", token);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Public origin of the tenant's primary verified domain (for links in emails/webhooks). */
export async function tenantStoreOrigin(tenantId: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from("domains")
    .select("hostname, is_primary")
    .eq("tenant_id", tenantId)
    .eq("status", "verified")
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? storeOrigin(data.hostname) : null;
}
