import { permanentRedirect } from "next/navigation";

/** Legacy URL (emails, bookmarks). Seller auth lives under /seller. Keeps ?next and ?error. */
export default async function LegacyRedirect({ searchParams }: PageProps<"/signup">) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && (k === "next" || k === "error")) qs.set(k, v);
  permanentRedirect(qs.size ? `/seller/register?${qs}` : "/seller/register");
}
