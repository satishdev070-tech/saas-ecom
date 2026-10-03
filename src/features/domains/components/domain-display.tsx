import { Badge } from "@/components/ui/layout";
import { verificationRecordName } from "../rules";
import { PROVIDER_STATUS_LABEL, RECORD_PURPOSE_LABEL, isProviderStatus, type StoredDnsRecord } from "../vercel-status";
import { CopyButton } from "./domain-controls";

type Tone = "neutral" | "success" | "warning" | "error" | "accent";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending verification", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  failed: { label: "Verification failed", tone: "error" },
  removed: { label: "Removed", tone: "neutral" },
};
const SSL: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "SSL pending", tone: "warning" },
  active: { label: "SSL active", tone: "success" },
  failed: { label: "SSL failed", tone: "error" },
  not_applicable: { label: "SSL managed", tone: "neutral" },
};

export function DomainStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SslStatusBadge({ status }: { status: string }) {
  const s = SSL[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProviderStatusBadge({ status }: { status: string | null }) {
  if (!isProviderStatus(status)) return null;
  const s = PROVIDER_STATUS_LABEL[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function RecordRow({ type, name, value, nameLabel, note }: { type: string; name: string; value: string; nameLabel: string; note?: string }) {
  return (
    <div className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[4.5rem_1fr_1fr] sm:items-start">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted sm:sr-only">Type</p>
        <p className="font-mono text-sm">{type}</p>
        {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted sm:sr-only">{nameLabel}</p>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{name}</code>
          <CopyButton value={name} label={`${type} record name`} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted sm:sr-only">Value</p>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{value}</code>
          <CopyButton value={value} label={`${type} record value`} />
        </div>
      </div>
    </div>
  );
}

/** DNS records the seller must create at their DNS provider. */
export function DnsInstructions({ hostname, token, cnameTarget }: { hostname: string; token: string; cnameTarget: string | null }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3">
      <div className="hidden grid-cols-[4.5rem_1fr_1fr] gap-2 border-b border-border py-2 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
        <span>Type</span>
        <span>Name / Host</span>
        <span>Value / Target</span>
      </div>
      <RecordRow type="TXT" nameLabel="Name / Host" name={verificationRecordName(hostname)} value={token} />
      {cnameTarget ? <RecordRow type="CNAME" nameLabel="Name / Host" name={hostname} value={cnameTarget} /> : null}
      <p className="py-3 text-xs text-muted">
        Some DNS providers add your domain automatically — if so, enter only the part before it (for example <code>_paliya-verify.www</code>). If you use Cloudflare DNS
        yourself, set the CNAME to “DNS only” (grey cloud). Changes usually appear within minutes but can take up to 24 hours.
      </p>
    </div>
  );
}

/** Exact records returned by the Vercel API (plus our ownership TXT), as stored on the domain row. */
export function VercelDnsInstructions({ records }: { records: StoredDnsRecord[] }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3">
      <div className="hidden grid-cols-[4.5rem_1fr_1fr] gap-2 border-b border-border py-2 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
        <span>Type</span>
        <span>Name / Host</span>
        <span>Value / Target</span>
      </div>
      {records.map((r) => (
        <RecordRow key={`${r.type}|${r.name}|${r.value}`} type={r.type} nameLabel="Name / Host" name={r.name} value={r.value} note={RECORD_PURPOSE_LABEL[r.purpose]} />
      ))}
      <p className="py-3 text-xs text-muted">
        Many DNS providers add your domain automatically. If so, enter only the part before it (for example <code>_paliya-verify.www</code> or <code>www</code>), and use{" "}
        <code>@</code> for an A record on the root domain. Remove any other A, AAAA or CNAME records for the same name. If you use Cloudflare DNS, set these records to
        “DNS only” (grey cloud). Changes usually appear within minutes but can take up to 24 hours.
      </p>
    </div>
  );
}
