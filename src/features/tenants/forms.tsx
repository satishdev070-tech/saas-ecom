"use client";

import { useActionState, useState } from "react";
import { TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { acceptInvitationAction, createStoreAction } from "./actions";

function slugify(v: string) {
  return v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export function CreateStoreForm({ rootDomain, defaultName = "" }: { rootDomain: string; defaultName?: string }) {
  const [state, action] = useActionState(createStoreAction, null);
  const errors = fieldErrors(state);
  const [slug, setSlug] = useState(() => slugify(defaultName));
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField label="Store name" name="name" required defaultValue={defaultName} errors={errors.name} onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
      <TextField
        label="Store address"
        name="slug"
        required
        value={slug}
        onChange={(e) => {
          setTouched(true);
          setSlug(slugify(e.target.value));
        }}
        errors={errors.slug}
        hint={`Your store will be live at ${slug || "your-store"}.${rootDomain}. You can connect your own domain later.`}
      />
      <SubmitButton size="lg" className="w-full">
        Create store
      </SubmitButton>
    </form>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Accept invitation</SubmitButton>
    </form>
  );
}
