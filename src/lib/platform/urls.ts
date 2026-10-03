import { publicEnv } from "@/lib/env/public";

/** Origin of the platform app (seller dashboard, auth emails). */
export function platformOrigin(): string {
  const env = publicEnv();
  if (env.NEXT_PUBLIC_PLATFORM_URL) return env.NEXT_PUBLIC_PLATFORM_URL.replace(/\/$/, "");
  const root = env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN;
  return root === "localhost" ? "http://localhost:3000" : `https://${root}`;
}

/** Public URL of a storefront host (http for *.localhost in development). */
export function storeOrigin(host: string): string {
  return host === "localhost" || host.endsWith(".localhost") ? `http://${host}:3000` : `https://${host}`;
}

/** Platform subdomain for a store slug. */
export function storeSubdomain(slug: string): string {
  return `${slug}.${publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN}`;
}
