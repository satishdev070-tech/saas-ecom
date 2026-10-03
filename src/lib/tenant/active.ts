import "server-only";
import { cookies } from "next/headers";
import { ACTIVE_TENANT_COOKIE } from "./membership";

/** Remembers the seller's selected store. Only a hint: requireTenant() re-checks memberships. */
export async function setActiveTenant(tenantId: string): Promise<void> {
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
