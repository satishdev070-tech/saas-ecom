import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

/**
 * Request-scoped Supabase client acting AS THE SIGNED-IN USER (publishable key + session cookie).
 * All tenant data access goes through this client so Postgres RLS is always enforced.
 * Create one per request; never cache it in module scope.
 */
export async function createSupabaseServerClient() {
  // cookies() first: during prerender it opts the route into dynamic rendering before env is
  // read, so `next build` works without runtime secrets (ARCHITECTURE §9).
  const cookieStore = await cookies();
  const env = serverEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: src/proxy.ts refreshes the session on every navigation.
        }
      },
    },
  });
}

/**
 * Returns the verified user id, or null. Uses getClaims() which validates the JWT
 * signature; never trust getSession() on the server for authorization.
 */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}
