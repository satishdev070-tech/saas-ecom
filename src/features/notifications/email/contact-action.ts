"use server";

import { after } from "next/server";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { email, parseInput } from "@/lib/validation/common";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { randomToken } from "@/lib/crypto";
import { requireStoreTenant } from "@/features/cart/context";
import { sendContactFormEmail } from "./direct";

const contactSchema = z.object({
  name: z.string({ error: "Enter your name" }).trim().min(2, "Enter your name").max(100),
  email,
  phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(20).optional()),
  subject: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(150).optional()),
  message: z.string({ error: "Write a message" }).trim().min(10, "Tell us a little more").max(5000),
  /** Honeypot: real visitors leave it empty. */
  website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * Storefront contact form → email to the store (reply-to = visitor). Not wired to any form yet:
 * the storefront contact page has no form today. Tenant = verified host, never input.
 */
export async function submitContactFormAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("storefront.contact", async () => {
    const tenant = await requireStoreTenant();
    const input = parseInput(contactSchema, formToObject(fd));
    await rateLimit("contact-form", `${tenant.tenantId}:${await clientIpKey()}`, 5, 3600);
    const key = `${tenant.tenantId}:contact:${randomToken(12)}`;
    after(() => sendContactFormEmail({ tenantId: tenant.tenantId, name: input.name, email: input.email, phone: input.phone ?? null, subject: input.subject ?? null, message: input.message, idempotencyKey: key }).then(() => undefined));
  });
}
