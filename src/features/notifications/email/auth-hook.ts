import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { PLATFORM_NAME } from "@/config/platform";
import { publicEnv } from "@/lib/env/public";
import { platformOrigin } from "@/lib/platform/urls";
import { platformHostAliases } from "@/lib/platform/hosts";
import { classifyHost } from "@/lib/tenant/host";
import { tenantDirectory } from "@/lib/tenant/directory";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendEmail, type EmailSendResult } from "@/lib/email/send";
import { brandImageView, getPublicPlatformConfig } from "@/features/platform/server/public-config";
import { loadStoreContext } from "./channel";
import { isAuthEmailAction, renderAuthEmail, type AuthEmailAction } from "./account-templates";
import type { EmailBrand } from "./layout";

/**
 * Supabase Auth "Send Email" hook → Resend. Supabase calls POST /api/auth/email-hook instead of
 * sending its own email; we build the confirmation link, brand it (the store when the flow started
 * on a store host, otherwise the platform), and send it with sendEmail() (email_log, idempotency).
 */

const payloadSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().optional().nullable(),
    new_email: z.string().optional().nullable(),
    user_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  }),
  email_data: z.object({
    token: z.string().optional().nullable(),
    token_hash: z.string().optional().nullable(),
    redirect_to: z.string().optional().nullable(),
    email_action_type: z.string(),
    site_url: z.string().optional().nullable(),
    token_new: z.string().optional().nullable(),
    token_hash_new: z.string().optional().nullable(),
  }),
});
export type AuthHookPayload = z.infer<typeof payloadSchema>;

export function parseAuthHookPayload(raw: unknown): AuthHookPayload | null {
  const r = payloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** verifyOtp type for a token_hash link of this action. */
export function otpTypeFor(action: AuthEmailAction): string {
  if (action === "email_change_new") return "email_change";
  return action;
}

/**
 * The link in the email. When `redirect_to` points at a host we serve (platform or a verified
 * store), the token hash is appended to that callback (both callbacks accept token_hash);
 * otherwise it goes to the platform's /auth/confirm. Never links to a foreign host.
 */
export function buildActionLink(input: { redirectTo: string | null | undefined; tokenHash: string; type: string; trusted: (url: URL) => boolean; fallbackOrigin: string }): string {
  let target: URL | null = null;
  if (input.redirectTo) {
    try {
      const u = new URL(input.redirectTo);
      if ((u.protocol === "https:" || u.protocol === "http:") && input.trusted(u)) target = u;
    } catch {
      target = null;
    }
  }
  if (!target) {
    target = new URL("/auth/confirm", input.fallbackOrigin);
    if (input.type === "recovery") target.searchParams.set("next", "/reset-password");
  }
  target.searchParams.set("token_hash", input.tokenHash);
  target.searchParams.set("type", input.type);
  return target.toString();
}

async function platformBrand(): Promise<EmailBrand> {
  const config = await getPublicPlatformConfig();
  const logo = brandImageView(config.headerLogo);
  return { storeName: PLATFORM_NAME, logoUrl: logo?.src ?? null, storeUrl: platformOrigin(), accent: null, supportEmail: null };
}

/** Which tenant (if any) the redirect host belongs to: store-branded emails for shopper flows. */
async function hostTenant(url: URL | null): Promise<{ kind: "platform" } | { kind: "store"; tenantId: string } | null> {
  if (!url) return null;
  const root = publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN;
  const c = classifyHost(url.host, root, platformHostAliases());
  if (c.kind === "platform") return { kind: "platform" };
  if (c.kind === "store-subdomain" || c.kind === "custom-domain") {
    const t = await tenantDirectory.findByHost(c.host).catch(() => null);
    return t ? { kind: "store", tenantId: t.tenantId } : null;
  }
  return null;
}

export type AuthHookResult = { ok: true; sent: EmailSendResult[] } | { ok: false; status: number; message: string };

export async function handleAuthEmailHook(payload: AuthHookPayload): Promise<AuthHookResult> {
  const action = payload.email_data.email_action_type;
  if (!isAuthEmailAction(action)) return { ok: false, status: 400, message: `Unsupported email action ${action.slice(0, 40)}` };

  let redirect: URL | null = null;
  try {
    redirect = payload.email_data.redirect_to ? new URL(payload.email_data.redirect_to) : null;
  } catch {
    redirect = null;
  }
  const owner = await hostTenant(redirect);
  const trustedHost = redirect && owner ? redirect.host : null;
  const trusted = (u: URL) => trustedHost !== null && u.host === trustedHost;

  let brand: EmailBrand;
  let tenantId: string | null = null;
  let replyTo: string | null = null;
  if (owner?.kind === "store") {
    const store = await loadStoreContext(createSupabaseAdminClient(), owner.tenantId).catch(() => null);
    brand = store?.brand ?? (await platformBrand());
    tenantId = store ? owner.tenantId : null;
    replyTo = store?.storeEmail ?? null;
  } else {
    brand = await platformBrand();
  }

  // One email normally; secure email change sends one to the current and one to the new address
  // (Supabase: token_hash_new pairs with the current email, token_hash with the new email).
  const d = payload.email_data;
  const jobs: { to: string; tokenHash: string; otp: string | null }[] = [];
  if (action === "email_change" && payload.user.new_email) {
    if (d.token_hash_new && payload.user.email) jobs.push({ to: payload.user.email, tokenHash: d.token_hash_new, otp: d.token_new ?? null });
    if (d.token_hash) jobs.push({ to: payload.user.new_email, tokenHash: d.token_hash, otp: d.token ?? null });
  } else if (payload.user.email) {
    jobs.push({ to: payload.user.email, tokenHash: d.token_hash ?? "", otp: d.token ?? null });
  }
  if (!jobs.length) return { ok: false, status: 400, message: "No recipient" };

  const sent: EmailSendResult[] = [];
  for (const job of jobs) {
    const actionUrl = action === "reauthentication" || !job.tokenHash ? null : buildActionLink({ redirectTo: d.redirect_to, tokenHash: job.tokenHash, type: otpTypeFor(action), trusted, fallbackOrigin: platformOrigin() });
    const email = renderAuthEmail({ action, brand, actionUrl, otp: job.otp });
    const key = createHash("sha256").update(`auth:${action}:${payload.user.id}:${job.tokenHash || job.otp || ""}`).digest("hex").slice(0, 48);
    const result = await sendEmail({ tenantId, kind: `auth_${action}`, to: job.to, ...email, fromName: brand.storeName, replyTo, idempotencyKey: key });
    sent.push(result);
    if (result.status === "failed" || result.status === "logged") {
      logger.warn("auth_email.not_sent", { action, status: result.status, tenantId });
      // Tell Supabase so the user sees an error instead of waiting for an email that never comes.
      return { ok: false, status: 502, message: result.status === "logged" ? "Email provider is not configured" : "Email could not be sent" };
    }
  }
  return { ok: true, sent };
}
