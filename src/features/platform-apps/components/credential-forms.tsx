"use client";

import { useState } from "react";
import { ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { TextField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { clearAppCredentialAction, rotateVerifyTokenAction, saveAppCredentialAction, sendTestEmailAction } from "../actions";
import type { AppProvider } from "../core";

/** Write-only credential form: secrets are never sent back to the browser, only a masked hint. */
export function AppCredentialForm({ provider, idLabel, secretLabel, clientId, secretHint, savedInDb }: { provider: AppProvider; idLabel: string | null; secretLabel: string; clientId: string | null; secretHint: string | null; savedInDb: boolean }) {
  return (
    <div className="space-y-3">
      <ActionForm action={saveAppCredentialAction} fields={{ provider }} submitLabel="Save" success="Saved. Sellers can connect now if both values are set." className="space-y-3">
        {(e) => (
          <>
            {idLabel ? <TextField label={idLabel} name="clientId" defaultValue={clientId ?? ""} autoComplete="off" spellCheck={false} errors={e.clientId} /> : null}
            <TextField
              label={secretLabel}
              name="secret"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={secretHint ? `Saved • ending ${secretHint}` : "Not set"}
              hint={secretHint ? "Leave blank to keep the saved value." : "Stored encrypted. It can't be viewed again after saving."}
              errors={e.secret ?? e._form}
            />
          </>
        )}
      </ActionForm>
      {savedInDb ? <InlineAction action={clearAppCredentialAction} fields={{ provider }} label="Remove saved credentials" variant="ghost" success="Removed. Env values are used if set." /> : null}
    </div>
  );
}

export function VerifyTokenControl({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      {token ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded-md border border-border bg-surface-secondary px-2 py-1 text-caption">{token}</code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(token).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : (
        <p className="text-small text-muted">No verify token yet.</p>
      )}
      <InlineAction action={rotateVerifyTokenAction} label={token ? "Regenerate token" : "Generate token"} success="Done. Update the token in Meta's webhook settings." />
    </div>
  );
}

/** Resend: API key (write-only) and the From mailbox, plus a test send to the admin's own address. */
export function EmailProviderForm({ from, secretHint, savedInDb, configured }: { from: string | null; secretHint: string | null; savedInDb: boolean; configured: boolean }) {
  return (
    <div className="space-y-4">
      <ActionForm action={saveAppCredentialAction} fields={{ provider: "resend" }} submitLabel="Save" success="Saved. New emails use these settings." className="space-y-3">
        {(e) => (
          <>
            <TextField
              label="Resend API key"
              name="secret"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={secretHint ? `Saved • ending ${secretHint}` : "re_…"}
              hint={secretHint ? "Leave blank to keep the saved key." : "Resend → API Keys → Create (Sending access). Stored encrypted; it can't be viewed again."}
              errors={e.secret ?? e._form}
            />
            <TextField
              label="From address"
              name="from"
              defaultValue={from ?? ""}
              autoComplete="off"
              spellCheck={false}
              placeholder="Build Brighten <no-reply@mail.buildbrighten.in>"
              hint="Must be on a domain verified in Resend → Domains. Stores send as “Store name <this address>”."
              errors={e.from}
            />
          </>
        )}
      </ActionForm>
      <div className="flex flex-wrap items-center gap-2">
        {configured ? <InlineAction action={sendTestEmailAction} label="Send a test email to me" variant="secondary" success="Sent. Check your inbox (and spam)." /> : null}
        {savedInDb ? <InlineAction action={clearAppCredentialAction} fields={{ provider: "resend" }} label="Remove saved settings" variant="ghost" success="Removed. Env values are used if set." /> : null}
      </div>
    </div>
  );
}
