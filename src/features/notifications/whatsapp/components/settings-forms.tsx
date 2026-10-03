"use client";

import { useActionState } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { saveWhatsAppEventAction, testWhatsAppSendAction } from "../actions";

export type TemplateOption = { value: string; label: string; disabledReason: string | null };

export function WhatsAppEventForm({ event, enabled, current, options, connected }: { event: string; enabled: boolean; current: string; options: TemplateOption[]; connected: boolean }) {
  const [state, action] = useActionState(saveWhatsAppEventAction, null);
  const errors = fieldErrors(state);
  const usable = options.filter((o) => !o.disabledReason);
  const unusable = options.filter((o) => o.disabledReason);
  // Keep the saved mapping selectable even if the live list couldn't be loaded.
  const selectOptions = [{ value: "", label: "— No template —" }, ...usable.map((o) => ({ value: o.value, label: o.label }))];
  if (current && !selectOptions.some((o) => o.value === current)) selectOptions.push({ value: current, label: `${current.replace("|", " · ")} (saved)` });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="event" value={event} />
      <FormMessage state={state} success="Saved." />
      <SelectField label="Approved template" name="template" defaultValue={current} options={selectOptions} errors={errors.template} disabled={!connected} />
      {unusable.length ? (
        <details className="text-caption text-muted">
          <summary>{unusable.length} template{unusable.length > 1 ? "s" : ""} can&apos;t be used for this event</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {unusable.map((o) => (
              <li key={o.value}>
                {o.label}: {o.disabledReason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <CheckboxField label="Send this WhatsApp message automatically" name="enabled" defaultChecked={enabled} disabled={!connected} />
      <SubmitButton size="sm" disabled={!connected}>
        Save
      </SubmitButton>
    </form>
  );
}

export function WhatsAppTestSendForm({ events }: { events: { value: string; label: string }[] }) {
  const [state, action] = useActionState(testWhatsAppSendAction, null);
  const errors = fieldErrors(state);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} success={state?.ok ? state.data : null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Event" name="event" options={events} />
        <TextField label="Your WhatsApp number" name="phone" inputMode="tel" autoComplete="tel" placeholder="98765 43210" errors={errors.phone} hint="Sent with sample values. Use your own number." />
      </div>
      <SubmitButton size="sm" variant="secondary" disabled={!events.length}>
        Send test message
      </SubmitButton>
    </form>
  );
}
