import "server-only";
import { serverEnv } from "@/lib/env/server";

/** True when RESEND_API_KEY is set (never exposes the key itself). */
export function emailProviderConfigured(): boolean {
  return Boolean(serverEnv().RESEND_API_KEY);
}
