import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

/**
 * Anonymous client WITHOUT cookies, for public storefront reads (catalog, theme, pages).
 * Runs as the `anon` role, so RLS limits it to published data of open tenants, and
 * because it carries no user session its results are safe to cache across visitors.
 */
export function createSupabasePublicClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
