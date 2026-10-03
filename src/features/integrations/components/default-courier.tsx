"use client";

import { SelectField } from "@/components/ui/field";
import { ActionForm } from "@/features/settings/ui/action-controls";
import { setDefaultCourierAction } from "../actions";
import { PROVIDERS } from "../registry";

export function DefaultCourierForm({ options, current }: { options: ("shiprocket" | "delhivery")[]; current: "shiprocket" | "delhivery" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <ActionForm action={setDefaultCourierAction} submitLabel="Save default" submitVariant="secondary">
        {(e) => <SelectField label="Default courier for new shipments" name="courier" defaultValue={current} options={options.map((o) => ({ value: o, label: PROVIDERS[o].label }))} errors={e.courier} />}
      </ActionForm>
    </div>
  );
}
