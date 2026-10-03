import "server-only";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";

/** Tenant from membership + marketing.write + the social_media entitlement. Used by every social mutation. */
export async function marketingCtx() {
  const ctx = await requireTenant();
  assertPermission(ctx, "marketing.write");
  if (!(await getEntitlements(ctx.tenantId)).isEnabled("social_media")) throw new AppError("FORBIDDEN", { message: "Social publishing isn't available on your plan." });
  return ctx;
}
