import { PLATFORM_NAME } from "@/config/platform";

/**
 * Shown on a custom domain that points at the platform while its connection isn't verified yet
 * (instead of a bare 404). Says nothing about which store it belongs to.
 */
export function DomainPending({ host, state }: { host: string; state: "pending" | "failed" }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{state === "failed" ? "Domain check failed" : "Connecting domain"}</p>
      <h1 className="font-display text-3xl">{host}</h1>
      <p className="text-muted">This address points to {PLATFORM_NAME}, but its connection to a store isn&apos;t verified yet. The store will appear here automatically once it is.</p>
      <p className="text-sm text-muted">
        Store owner: open <strong>Dashboard → Settings → Domains</strong>, check the DNS records shown there (including the TXT record) and select <strong>Verify</strong>.
      </p>
    </main>
  );
}
