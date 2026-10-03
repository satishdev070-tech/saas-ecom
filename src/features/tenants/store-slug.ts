import { isValidStoreSlug } from "@/lib/tenant/host";

/** Store address candidates derived from a store name (pure): "Aangan Jaipur" → aangan-jaipur, aangan-jaipur-2… */
export function storeSlugCandidates(name: string, count = 4): string[] {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const root = base.length >= 3 ? base : `${base || "store"}-shop`;
  const out = [root, ...Array.from({ length: count - 1 }, (_, i) => `${root}-${i + 2}`)];
  return out.filter(isValidStoreSlug);
}
