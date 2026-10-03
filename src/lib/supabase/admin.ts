import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

/**
 * PRIVILEGED client using the Supabase secret key. BYPASSES RLS.
 *
 * Allowed uses only (see docs/DECISIONS.md ADR-006):
 *   - hostname -> tenant resolution (read-only, verified domains)
 *   - verified payment/shipping webhooks after signature verification
 *   - platform (super admin) operations after an explicit platform-permission check
 *   - background jobs
 *
 * Every call site must scope queries by an already-resolved tenant id and must
 * never pass through a tenant id taken from the browser. `server-only` makes any
 * client-bundle import a build error.
 */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
