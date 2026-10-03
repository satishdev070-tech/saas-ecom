import { parseEnv, publicEnvSchema, type PublicEnv } from "./schema";

let cached: PublicEnv | undefined;

/**
 * Validated public env. `NEXT_PUBLIC_*` values must be referenced literally so
 * Next.js can inline them into the browser bundle.
 */
export function publicEnv(): PublicEnv {
  cached ??= parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN,
    NEXT_PUBLIC_PLATFORM_URL: process.env.NEXT_PUBLIC_PLATFORM_URL,
  });
  return cached;
}
