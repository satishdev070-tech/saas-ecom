import "server-only";
import { resolveEmailProvider } from "@/lib/email/send";

/** True when a Resend API key is saved in the platform console or set in env (never exposes it). */
export async function emailProviderConfigured(): Promise<boolean> {
  return Boolean((await resolveEmailProvider()).apiKey);
}
