import { z } from "zod";
import { email, indianMobile, uuid } from "@/lib/validation/common";
import { addressSchema } from "./address";

export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

const bool = z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean());

export const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(128), next: z.string().max(2048).optional() });
export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().max(80).optional(),
  email,
  password,
  acceptsMarketing: bool.default(false),
  next: z.string().max(2048).optional(),
});
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ password, confirm: z.string().max(128) })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
export const otpRequestSchema = z.object({ email, next: z.string().max(2048).optional() });
export const otpVerifySchema = z.object({ email, token: z.string().trim().regex(/^\d{6,10}$/, "Enter the code from the email"), next: z.string().max(2048).optional() });

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().max(80).optional(),
  phone: z.union([indianMobile, z.undefined()]),
  acceptsMarketing: bool.default(false),
});

export const savedAddressSchema = addressSchema.extend({
  id: uuid.optional(),
  label: z.string().trim().max(40).optional(),
  isDefault: bool.default(false),
});

export const idSchema = z.object({ id: uuid });
export const wishlistSchema = z.object({ productId: uuid });
export const cancelOrderSchema = z.object({ orderId: uuid, reason: z.string().trim().max(300).optional() });
export const returnRequestSchema = z.object({
  orderId: uuid,
  reason: z.enum(["size_issue", "damaged", "wrong_item", "not_as_described", "changed_mind", "other"], { message: "Choose a reason" }),
  note: z.string().trim().max(1000).optional(),
});

export const RETURN_REASONS: Record<z.infer<typeof returnRequestSchema>["reason"], string> = {
  size_issue: "Size or fit issue",
  damaged: "Item arrived damaged",
  wrong_item: "Received the wrong item",
  not_as_described: "Not as described",
  changed_mind: "Changed my mind",
  other: "Other",
};
