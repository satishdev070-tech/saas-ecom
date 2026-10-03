"use client";

import { useActionState, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { Hint, TextAreaField, TextField } from "@/components/ui/field";
import type { ActionResult } from "@/lib/actions/result";
import { autofillBrandAction, saveBrandProfileAction } from "../actions";
import { BRAND_LANGUAGES, LANGUAGE_LABELS, PROVIDER_LABELS, type BrandLanguage, type BrandProfile } from "../schemas";

export function BrandForm({ initial, canWrite, aiReady }: { initial: BrandProfile; canWrite: boolean; aiReady: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveBrandProfileAction, null);
  const [v, setV] = useState({ voice: initial.voice ?? "", audience: initial.audience ?? "", keywords: initial.keywords.join(", "), dos: initial.dos ?? "", donts: initial.donts ?? "" });
  const [langs, setLangs] = useState<BrandLanguage[]>(initial.languages);
  const [filling, startFill] = useTransition();
  const [fillMsg, setFillMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const errors = fieldErrors(state);

  const autofill = () =>
    startFill(async () => {
      setFillMsg(null);
      const r = await autofillBrandAction();
      if (!r.ok) return setFillMsg({ ok: false, text: r.error.fieldErrors?._form?.[0] ?? r.error.message });
      setV({ voice: r.data.voice, audience: r.data.audience, keywords: r.data.keywords.join(", "), dos: r.data.dos, donts: r.data.donts });
      setLangs(r.data.languages);
      setFillMsg({ ok: true, text: `Draft filled in by ${PROVIDER_LABELS[r.data.provider]}. Review it, then save.` });
    });

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-muted">Every generator uses this profile. Keep it short and specific.</p>
        {canWrite ? (
          <Button variant="secondary" size="sm" onClick={autofill} pending={filling} disabled={!aiReady}>
            <Sparkles aria-hidden /> Auto-fill from my store
          </Button>
        ) : null}
      </div>
      {fillMsg ? (
        <p role={fillMsg.ok ? "status" : "alert"} className={fillMsg.ok ? "rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success" : "rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error"}>
          {fillMsg.text}
        </p>
      ) : null}
      <fieldset disabled={!canWrite} className="grid gap-4 md:grid-cols-2">
        <TextAreaField label="Brand voice" name="voice" rows={3} maxLength={500} value={v.voice} onChange={set("voice")} errors={errors.voice} optional placeholder="Warm, witty, proudly handmade. Talks like a friend, not a salesperson." />
        <TextAreaField label="Audience" name="audience" rows={3} maxLength={500} value={v.audience} onChange={set("audience")} errors={errors.audience} optional placeholder="Women 22-40 in metro cities who love ethnic wear for festivals and work." />
        <TextField label="Keywords" name="keywords" className="md:col-span-2" value={v.keywords} onChange={set("keywords")} errors={errors.keywords} optional hint="Comma separated, up to 30." placeholder="handloom, cotton kurtis, festive edit" />
        <TextAreaField label="Do's" name="dos" rows={3} maxLength={1000} value={v.dos} onChange={set("dos")} errors={errors.dos} optional placeholder="Mention free shipping over ₹999. Use emojis sparingly." />
        <TextAreaField label="Don'ts" name="donts" rows={3} maxLength={1000} value={v.donts} onChange={set("donts")} errors={errors.donts} optional placeholder="No discounts unless we announce one. No slang about competitors." />
        <div className="md:col-span-2">
          <p className="mb-1.5 text-label text-foreground">Languages</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {BRAND_LANGUAGES.map((l) => (
              <label key={l} className="inline-flex items-center gap-2 text-small">
                <input type="checkbox" name="languages" value={l} checked={langs.includes(l)} onChange={(e) => setLangs((s) => (e.target.checked ? [...s, l] : s.filter((x) => x !== l)))} className="size-4 rounded border-border accent-[var(--accent)]" />
                {LANGUAGE_LABELS[l]}
              </label>
            ))}
          </div>
          <Hint>Up to 5. Hinglish is Hindi written in English letters, mixed with English.</Hint>
          {errors.languages ? <p role="alert" className="mt-1.5 text-small text-error">{errors.languages[0]}</p> : null}
        </div>
      </fieldset>
      <FormMessage state={state} success="Brand profile saved." />
      {canWrite ? <SubmitButton>Save brand profile</SubmitButton> : null}
    </form>
  );
}
