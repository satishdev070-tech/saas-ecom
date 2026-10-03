"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { ActionForm } from "@/features/settings/ui/action-controls";
import { chooseLocationAction, generateDescriptionAction, replyReviewAction, saveDescriptionAction, suggestReplyAction } from "../actions";
import { DESCRIPTION_MAX } from "../gbp";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />} {done ? "Copied" : label}
    </Button>
  );
}

export function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-caption text-muted">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-3.5 ${i <= n ? "fill-warning text-warning" : "text-border"}`} aria-hidden />
      ))}
    </span>
  );
}

export function LocationPicker({ choices, current }: { choices: { value: string; label: string }[]; current: string | null }) {
  return (
    <ActionForm action={chooseLocationAction} submitLabel="Use this location" success="Location saved.">
      {(errors) => <SelectField label="Google Business location" name="location" defaultValue={current ?? choices[0]?.value ?? ""} options={choices} errors={errors.location} />}
    </ActionForm>
  );
}

/** Reply / edit reply with an optional AI suggestion (Neural Pulse). */
export function ReplyForm({ id, existing, canSuggest }: { id: string; existing: string | null; canSuggest: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(existing ?? "");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();
  const [state, action] = useActionState(replyReviewAction, null);
  if (!open) {
    return (
      <Button type="button" variant={existing ? "ghost" : "secondary"} size="sm" onClick={() => setOpen(true)}>
        {existing ? "Edit reply" : "Reply"}
      </Button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormMessage state={state} success="Reply posted on Google." />
      <TextAreaField id={`reply-${id}`} label="Your reply" name="reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} errors={fieldErrors(state).reply} hint="Shown publicly on Google under the review." />
      {suggestError ? <p role="alert" className="text-caption text-error">{suggestError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm">{existing ? "Update reply" : "Post reply"}</SubmitButton>
        {canSuggest ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            pending={suggesting}
            onClick={() =>
              startSuggest(async () => {
                setSuggestError(null);
                const r = await suggestReplyAction(id);
                if (r.ok) setText(r.data);
                else setSuggestError(r.error.message);
              })
            }
          >
            <Sparkles aria-hidden /> Suggest reply
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Generate (Neural Pulse) → edit → copy, or save to the connected Google listing. */
export function DescriptionBuilder({ initial, canWrite, canSave }: { initial: string; canWrite: boolean; canSave: boolean }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action] = useActionState(saveDescriptionAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} success="Description updated on Google." />
      <TextAreaField label="Business description" name="description" rows={6} maxLength={DESCRIPTION_MAX} value={text} onChange={(e) => setText(e.target.value)} errors={fieldErrors(state).description} hint={`${text.length}/${DESCRIPTION_MAX} characters. No links or promotional phrases: Google may reject them.`} />
      {error ? <p role="alert" className="text-caption text-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            pending={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await generateDescriptionAction();
                if (r.ok) setText(r.data);
                else setError(r.error.message);
              })
            }
          >
            <Sparkles aria-hidden /> Generate description
          </Button>
        ) : null}
        {text ? <CopyButton text={text} /> : null}
        {canSave && text ? <SubmitButton size="sm">Save to Google</SubmitButton> : null}
      </div>
    </form>
  );
}
