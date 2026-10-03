const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure parser for a VERIFIED cart token payload (`tenantId:cartId`). Returns the cart id only
 * when the payload's tenant equals the tenant resolved from the host; otherwise null.
 */
export function parseCartPayload(payload: string | null, tenantId: string): string | null {
  if (!payload) return null;
  const parts = payload.split(":");
  if (parts.length !== 2) return null;
  const [t, c] = parts as [string, string];
  if (t !== tenantId || !UUID.test(t) || !UUID.test(c)) return null;
  return c.toLowerCase();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
