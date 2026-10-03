"use client";

import { SelectField } from "@/components/ui/field";
import { Badge } from "@/components/ui/layout";
import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { disconnectIntegrationAction } from "@/features/integrations/actions";
import type { IntegrationStatus } from "@/features/integrations/registry";
import { cancelPostAction, deletePostAction, retryPostAction, setPinterestBoardAction } from "../actions";

type Account = { provider: string; status: IntegrationStatus; enabled: boolean; account: string | null; board: string | null; boardName: string | null; message: string | null; connectedAt: string | null };
const NETWORKS = [
  { providers: ["facebook", "instagram"], network: "meta", label: "Facebook & Instagram", note: "Connect with Facebook and choose your store's Page. Its linked Instagram professional account is connected too." },
  { providers: ["pinterest"], network: "pinterest", label: "Pinterest", note: "Create Pins on one of your boards." },
  { providers: ["youtube"], network: "youtube", label: "YouTube", note: "Shows your channel as connected. Video publishing isn't supported yet." },
] as const;
const NAME: Record<string, string> = { facebook: "Facebook Page", instagram: "Instagram", pinterest: "Pinterest", youtube: "YouTube" };
const TONE = { connected: "success", error: "error", expired: "warning", not_connected: "neutral", disabled: "neutral" } as const;
const LABEL = { connected: "Connected", error: "Error", expired: "Expired", not_connected: "Not connected", disabled: "Disabled" } as const;

export function SocialAccounts({ accounts, configured, canManage, boards }: { accounts: Account[]; configured: Record<"meta" | "pinterest" | "youtube", boolean>; canManage: boolean; boards: { id: string; name: string }[] }) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {NETWORKS.map((n) => {
        const rows = accounts.filter((a) => (n.providers as readonly string[]).includes(a.provider));
        const anyConnected = rows.some((r) => r.status !== "not_connected");
        return (
          <div key={n.network} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div>
              <h2 className="font-semibold">{n.label}</h2>
              <p className="text-caption text-muted">{n.note}</p>
            </div>
            <ul className="space-y-2 text-small">
              {rows.map((r) => (
                <li key={r.provider} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{NAME[r.provider]}{r.account ? <span className="text-muted"> · {r.account}</span> : null}</span>
                  <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                  {r.status !== "connected" && r.status !== "not_connected" && r.message ? <p className="w-full text-caption text-error">{r.message}</p> : null}
                </li>
              ))}
            </ul>
            {n.network === "pinterest" && canManage && rows[0]?.status === "connected" ? (
              boards.length ? (
                <ActionForm action={setPinterestBoardAction} submitLabel="Save board" submitVariant="secondary">
                  {() => (
                    <SelectField
                      label="Board for new Pins"
                      name="boardId"
                      defaultValue={rows[0]?.board ?? ""}
                      options={boards.map((b) => ({ value: b.id, label: b.name }))}
                    />
                  )}
                </ActionForm>
              ) : (
                <p className="text-caption text-muted">Create a board on Pinterest first, then reload this page.</p>
              )
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2">
              {!configured[n.network] ? (
                <p className="text-caption text-muted">Waiting on your platform admin to add this app (Admin → Social apps).</p>
              ) : canManage ? (
                <a href={`/api/oauth/${n.network}/start`} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-small font-medium text-primary-foreground">
                  {anyConnected ? "Reconnect" : "Connect"}
                </a>
              ) : null}
              {canManage
                ? rows
                    .filter((r) => r.status !== "not_connected")
                    .map((r) => (
                      <ActionDialog
                        key={r.provider}
                        action={disconnectIntegrationAction}
                        fields={{ provider: r.provider }}
                        title={`Disconnect ${NAME[r.provider]}?`}
                        description="We delete the stored access token. Scheduled posts to this network will fail until you reconnect. To fully revoke access, also remove the app from your account's settings on the network."
                        triggerLabel={`Disconnect ${NAME[r.provider]}`}
                        triggerVariant="ghost"
                        confirmLabel="Disconnect"
                        variant="danger"
                      />
                    ))
                : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function PostActions({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {status === "scheduled" ? <InlineAction action={cancelPostAction} fields={{ id }} label="Cancel" /> : null}
      {status === "failed" ? <InlineAction action={retryPostAction} fields={{ id }} label="Retry" success="Done" /> : null}
      {["draft", "planned", "cancelled", "failed"].includes(status) ? <InlineAction action={deletePostAction} fields={{ id }} label="Delete" variant="ghost" /> : null}
    </div>
  );
}
