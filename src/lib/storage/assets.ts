import { publicEnv } from "@/lib/env/public";

export const STORE_ASSETS_BUCKET = "store-assets";
export const PRIVATE_FILES_BUCKET = "private-files";

/** Public URL for a path in the store-assets bucket (safe in client and server code). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!/^tenant\/[0-9a-f-]{36}\//.test(path)) return null;
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${STORE_ASSETS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
