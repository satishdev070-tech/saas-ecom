import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailSendResult } from "@/lib/email/send";
import { loadStoreContext } from "./channel";
import { renderContactForwardEmail, renderTeamInviteEmail } from "./templates";

/**
 * One-off emails that are not order lifecycle events (they carry a secret link or a visitor's
 * message, so they do not go through the multi-channel dispatcher).
 */

/** Team invitation. Caller has already checked `roles.manage` on `tenantId` (membership). */
export async function sendTeamInviteEmail(input: { tenantId: string; to: string; inviterName: string; roleName: string; acceptUrl: string; idempotencyKey: string }): Promise<EmailSendResult> {
  const store = await loadStoreContext(createSupabaseAdminClient(), input.tenantId);
  const brand = store?.brand ?? { storeName: "your store" };
  const email = renderTeamInviteEmail({ brand, inviterName: input.inviterName, roleName: input.roleName, acceptUrl: input.acceptUrl, expiresInDays: 7 });
  // Invites go out under the store's name; replies reach the store email, not the platform.
  return sendEmail({ tenantId: input.tenantId, kind: "team_invite", to: input.to, ...email, fromName: brand.storeName, replyTo: store?.storeEmail ?? null, idempotencyKey: input.idempotencyKey });
}

/**
 * Forwards a storefront contact-form message to the store email (reply-to = the visitor).
 * `tenantId` must come from the verified host (resolveStorefrontTenant); the caller validates
 * and rate-limits the input. Returns "skipped" when the store has no email on file.
 */
export async function sendContactFormEmail(input: { tenantId: string; name: string; email: string; phone?: string | null; subject?: string | null; message: string; idempotencyKey: string }): Promise<EmailSendResult> {
  const store = await loadStoreContext(createSupabaseAdminClient(), input.tenantId);
  if (!store?.storeEmail) return { status: "skipped", error: "store has no email" };
  const email = renderContactForwardEmail({ brand: store.brand, name: input.name, email: input.email, phone: input.phone, subject: input.subject, message: input.message });
  return sendEmail({ tenantId: input.tenantId, kind: "contact_form", to: store.storeEmail, ...email, fromName: `${store.brand.storeName} contact form`, replyTo: input.email, idempotencyKey: input.idempotencyKey });
}
