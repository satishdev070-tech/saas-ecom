import { redirect } from "next/navigation";

/** The store directory moved to /admin/stores; keep old links (and their filters) working. */
export default async function TenantsRedirect({ searchParams }: PageProps<"/admin/tenants">) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/admin/stores${qs.size ? `?${qs}` : ""}`);
}
