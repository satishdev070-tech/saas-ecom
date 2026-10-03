"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPlatformPermission, getPlatformContext } from "@/lib/platform/access";
import { providerOnlySchema, saveAppCredentialSchema } from "./core";
import { clearAppCredential, rotateMetaWebhookVerifyToken, saveAppCredential } from "./server";
import { sendEmail } from "@/lib/email/send";
import { rateLimit } from "@/lib/rate-limit";
import { PLATFORM_NAME } from "@/config/platform";

async function actor() {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError("FORBIDDEN");
  assertPlatformPermission(ctx, "platform.settings.manage");
  return ctx;
}

const PATH = "/admin/social-apps";
const EMAIL_PATH = "/admin/email";

export async function saveAppCredentialAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.save", async () => {
    const input = parseInput(saveAppCredentialSchema, formToObject(fd));
    const ctx = await actor();
    await saveAppCredential(ctx, input);
    revalidatePath(input.provider === "resend" ? EMAIL_PATH : PATH);
  });
}

/** Sends one test email to the signed-in admin's own address with the current Resend settings. */
export async function sendTestEmailAction(_prev: ActionResult<{ status: string }> | null, _fd: FormData): Promise<ActionResult<{ status: string }>> {
  return runAction("platform.email.test", async () => {
    const ctx = await actor();
    if (!ctx.user.email) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Your account has no email address."] } });
    await rateLimit("platform-email-test", ctx.user.id, 5, 600);
    const result = await sendEmail({
      tenantId: null,
      kind: "platform_test",
      to: ctx.user.email,
      subject: `${PLATFORM_NAME}: test email`,
      html: `<p>This is a test email from the ${PLATFORM_NAME} platform console. If you can read it, Resend is set up correctly.</p>`,
      text: `This is a test email from the ${PLATFORM_NAME} platform console. If you can read it, Resend is set up correctly.`,
      idempotencyKey: `platform-test:${ctx.user.id}:${Date.now()}`,
    });
    if (result.status === "logged") throw new AppError("VALIDATION", { fieldErrors: { _form: ["No Resend API key is configured, so nothing was sent."] } });
    if (result.status !== "sent") throw new AppError("VALIDATION", { fieldErrors: { _form: [`Resend didn't accept the email (${result.error ?? "unknown error"}). Check the API key and that the From domain is verified in Resend.`] } });
    return { status: "sent" };
  });
}

export async function clearAppCredentialAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.clear", async () => {
    const { provider } = parseInput(providerOnlySchema, formToObject(fd));
    const ctx = await actor();
    await clearAppCredential(ctx, provider);
    revalidatePath(provider === "resend" ? EMAIL_PATH : PATH);
  });
}

export async function rotateVerifyTokenAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.rotate_verify_token", async () => {
    const ctx = await actor();
    await rotateMetaWebhookVerifyToken(ctx);
    revalidatePath(PATH);
  });
}
