import "server-only";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { logger } from "@/lib/observability/logger";

/** Normalises a request path for redirect lookup: decoded, no trailing slash (except "/"), max 500 chars. */
export function normalizeRedirectPath(path: string): string | null {
  let p: string;
  try {
    p = decodeURI(path);
  } catch {
    return null;
  }
  if (!p.startsWith("/") || p.length > 500 || /[\s\u0000-\u001f]/.test(p)) return null;
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "") || "/";
  return p;
}

/** Seller-managed redirect (redirects table via storefront_redirect()). Targets are same-origin paths only. */
export async function findRedirect(tenantId: string, path: string): Promise<{ to: string; permanent: boolean } | null> {
  const from = normalizeRedirectPath(path);
  if (!from) return null;
  const { data, error } = await createSupabasePublicClient().rpc("storefront_redirect", { p_tenant: tenantId, p_path: from });
  if (error) {
    logger.warn("storefront.redirect_lookup_failed", { tenantId, error: error.message });
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  const to = safeRedirectPath(row.to_path, "");
  if (!to || to === from) return null;
  return { to, permanent: row.status_code !== 302 };
}

/** For unknown storefront paths: follow a seller redirect if one exists, else the store 404. */
export async function redirectOrNotFound(tenantId: string, path: string): Promise<never> {
  const hit = await findRedirect(tenantId, path);
  if (hit) {
    if (hit.permanent) permanentRedirect(hit.to);
    redirect(hit.to);
  }
  notFound();
}
