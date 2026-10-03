"use client";

import { ActionForm } from "@/features/settings/ui/action-controls";
import { CheckboxField } from "@/components/ui/field";
import { saveEmailPreferencesAction } from "../actions";
import { EMAIL_PREFERENCE_KEYS, EMAIL_PREFERENCE_META, type EmailPreferences } from "../preferences";

/** Per-store email toggles. Mount on Settings → Notifications (role D's page). */
export function EmailPreferencesForm({ prefs, providerConfigured }: { prefs: EmailPreferences; providerConfigured: boolean }) {
  return (
    <div className="space-y-4">
      {providerConfigured ? null : (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Email delivery isn&apos;t set up on this platform yet, so emails are recorded but not sent. Ask your platform admin to add the Resend API key.
        </p>
      )}
      <ActionForm action={saveEmailPreferencesAction} submitLabel="Save email settings">
        {() => (
          <div className="grid gap-3 sm:grid-cols-2">
            {EMAIL_PREFERENCE_KEYS.map((k) => (
              <CheckboxField key={k} name={k} value="true" label={EMAIL_PREFERENCE_META[k].label} hint={EMAIL_PREFERENCE_META[k].hint} defaultChecked={prefs[k]} />
            ))}
          </div>
        )}
      </ActionForm>
    </div>
  );
}
