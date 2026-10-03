"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishStoreAction } from "../actions";
import { refreshPreviewUrlAction } from "@/features/theme/actions";

/** Opens the store with a signed preview cookie, so the owner can see a draft store. */
export function PreviewStoreButton({ label = "Preview store", variant = "secondary" }: { label?: string; variant?: "secondary" | "primary" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            // Open synchronously (popup blockers), then point it at the signed preview URL.
            const tab = window.open("about:blank", "_blank");
            const res = await refreshPreviewUrlAction();
            if (res.ok && tab) {
              tab.opener = null;
              tab.location.href = res.data.url;
            } else {
              tab?.close();
              setError(res.ok ? "Allow pop-ups to open the preview." : res.error.message);
            }
          })
        }
      >
        <ExternalLink aria-hidden className="size-4" /> {pending ? "Opening…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-caption text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Publish a draft store, with a confirmation step. */
export function PublishStoreButton() {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <Button type="button" onClick={() => setConfirming(true)}>
        <Rocket aria-hidden className="size-4" /> Publish store
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirm publishing">
      <span className="text-small">Make your store visible to everyone?</span>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await publishStoreAction();
            if (!res.ok) setError(res.error.message);
            else setConfirming(false);
          })
        }
      >
        {pending ? "Publishing…" : "Yes, publish"}
      </Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error ? (
        <span role="alert" className="w-full text-caption text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
