"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPlatformPermission, getPlatformContext } from "@/lib/platform/access";
import { providerOnlySchema, saveAppCredentialSchema } from "./core";
import { clearAppCredential, rotateMetaWebhookVerifyToken, saveAppCredential } from "./server";

async function actor() {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError("FORBIDDEN");
  assertPlatformPermission(ctx, "platform.settings.manage");
  return ctx;
}

const PATH = "/admin/social-apps";

export async function saveAppCredentialAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.save", async () => {
    const input = parseInput(saveAppCredentialSchema, formToObject(fd));
    const ctx = await actor();
    await saveAppCredential(ctx, input);
    revalidatePath(PATH);
  });
}

export async function clearAppCredentialAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.clear", async () => {
    const { provider } = parseInput(providerOnlySchema, formToObject(fd));
    const ctx = await actor();
    await clearAppCredential(ctx, provider);
    revalidatePath(PATH);
  });
}

export async function rotateVerifyTokenAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return runAction("platform.app_credential.rotate_verify_token", async () => {
    const ctx = await actor();
    await rotateMetaWebhookVerifyToken(ctx);
    revalidatePath(PATH);
  });
}
