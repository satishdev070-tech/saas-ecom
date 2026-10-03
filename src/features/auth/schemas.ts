import { z } from "zod";
import { email } from "@/lib/validation/common";

export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const signInSchema = z.object({ email, password: z.string({ error: "Enter your password" }).min(1, "Enter your password").max(128), next: z.string().optional() });
export const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password,
  /** Optional at the schema level so older links keep working; the merchant form always sends it. */
  storeName: z.string().trim().max(120).optional().transform((v) => v || undefined),
  next: z.string().optional(),
  /** Choices carried from the marketing site (validated again where they are used). */
  plan: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/).optional().catch(undefined),
  theme: z.string().regex(/^[a-z0-9-]{2,40}$/).optional().catch(undefined),
});
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
