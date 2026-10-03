"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form";
import { inputClassName } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { markReadAction, sendReplyAction, suggestReplyAction } from "../actions";

/** Re-renders the server components every `seconds` while the tab is visible. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}

/** Marks the open conversation read once (only when it has unread messages and the user may write). */
export function MarkRead({ conversationId, unread }: { conversationId: string; unread: number }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (unread <= 0 || done.current === conversationId) return;
    done.current = conversationId;
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    void markReadAction(null, fd);
  }, [conversationId, unread]);
  return null;
}

/** Keeps the newest message in view. */
export function ScrollToEnd({ dep }: { dep: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "end" }), [dep]);
  return <div ref={ref} />;
}

export function ReplyBox({ conversationId, windowOpen, closedMessage, canSuggest }: { conversationId: string; windowOpen: boolean; closedMessage: string; canSuggest: boolean }) {
  const [text, setText] = useState("");
  const [state, formAction] = useActionState(async (prev: Awaited<ReturnType<typeof sendReplyAction>> | null, fd: FormData) => {
    const r = await sendReplyAction(prev, fd);
    if (r.ok) setText("");
    return r;
  }, null);
  const [note, setNote] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();
  if (!windowOpen) {
    return (
      <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">
        {closedMessage}
      </p>
    );
  }

  const suggest = () =>
    startSuggest(async () => {
      setNote(null);
      const r = await suggestReplyAction(conversationId);
      if (r.ok) setText(r.data);
      else setNote(r.error.message);
    });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="inbox-reply" className="sr-only">
        Reply
      </label>
      <textarea
        id="inbox-reply"
        name="body"
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
        placeholder="Write a reply…"
        className={cn(inputClassName, "resize-y")}
      />
      {state && !state.ok ? (
        <p role="alert" className="text-small text-error">
          {state.error.fieldErrors?.body?.[0] ?? state.error.message}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-small text-muted">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-muted">{text.length}/2000 · Ctrl/⌘+Enter to send</span>
        <div className="flex gap-2">
          {canSuggest ? (
            <Button type="button" variant="secondary" size="sm" pending={suggesting} onClick={suggest}>
              Suggest reply
            </Button>
          ) : null}
          <SubmitButton size="sm" disabled={!text.trim()}>
            Send
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
