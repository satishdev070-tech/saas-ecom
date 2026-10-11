"use client";

import { useState } from "react";
import { ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { deleteFestiveCampaignAction, saveFestiveCampaignAction } from "@/features/settings/actions";
import { FESTIVE_PRESET_IDS, FESTIVE_PRESETS, type FestiveCampaign, type FestivePresetId } from "../festive";
import { garlandBackground } from "./festive";

function Preview({ preset, message, banner, garland }: { preset: FestivePresetId; message: string; banner: boolean; garland: boolean }) {
  const p = FESTIVE_PRESETS[preset];
  return (
    <div aria-label="Preview" className="overflow-hidden rounded-md border border-border bg-white text-[#111]">
      {banner ? (
        <div className="px-3 py-1.5 text-center text-xs font-medium" style={{ background: p.bg, color: p.fg }}>
          {message || p.message}
        </div>
      ) : null}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 text-xs">
        <span className="font-semibold">Your store</span>
        <span className="text-neutral-500">Shop · New in · Sale</span>
      </div>
      {garland ? <div aria-hidden style={{ height: 22, backgroundImage: garlandBackground(p.motif, p.accent, p.bg), backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }} /> : null}
      <div className="h-16 bg-neutral-100" />
    </div>
  );
}

/** Add or edit one scheduled festive look. */
export function FestiveCampaignForm({ value, today }: { value?: FestiveCampaign; today: string }) {
  const [preset, setPreset] = useState<FestivePresetId>(value?.preset ?? "navratri");
  const [message, setMessage] = useState(value?.message ?? "");
  const [banner, setBanner] = useState(value?.banner ?? true);
  const [garland, setGarland] = useState(value?.garland ?? true);
  const k = value?.id ?? "new"; // unique field ids when several forms are on the page
  return (
    <ActionForm action={saveFestiveCampaignAction} fields={value ? { id: value.id } : {}} submitLabel={value ? "Save changes" : "Schedule festive look"} success="Saved. It shows on your store between the dates you chose." resetOnSuccess={!value}>
      {(e) => (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Festival"
              id={`fv-${k}-preset`} name="preset"
              defaultValue={preset}
              onChange={(ev) => setPreset(ev.target.value as FestivePresetId)}
              options={FESTIVE_PRESET_IDS.map((id) => ({ value: id, label: FESTIVE_PRESETS[id].label }))}
              errors={e.preset}
            />
            <div className="hidden sm:block" />
            <TextField label="Starts" id={`fv-${k}-start`} name="start" type="date" required defaultValue={value?.start ?? today} errors={e.start} />
            <TextField label="Ends" id={`fv-${k}-end`} name="end" type="date" required defaultValue={value?.end ?? today} errors={e.end} hint="Inclusive. Turns off automatically after this day (India time)." />
            <TextField label="Announcement" id={`fv-${k}-message`} name="message" maxLength={160} value={message} onChange={(ev) => setMessage(ev.target.value)} placeholder={FESTIVE_PRESETS[preset].message} errors={e.message} optional className="sm:col-span-2" />
            <TextField label="Announcement link" id={`fv-${k}-link`} name="link" defaultValue={value?.link ?? ""} placeholder="/collections/festive" errors={e.link} optional hint="A page on your store, e.g. a festive collection." className="sm:col-span-2" />
            <div className="space-y-2 sm:col-span-2">
              <CheckboxField label="Show the announcement bar" id={`fv-${k}-banner`} name="banner" value="true" checked={banner} onChange={(ev) => setBanner(ev.target.checked)} />
              <CheckboxField label="Show the festive garland under the header" id={`fv-${k}-garland`} name="garland" value="true" checked={garland} onChange={(ev) => setGarland(ev.target.checked)} />
              <CheckboxField label="Falling petals for a few seconds when a page opens" id={`fv-${k}-petals`} name="petals" value="true" defaultChecked={value?.petals ?? false} hint="Off for shoppers who prefer reduced motion." />
            </div>
          </div>
          <div>
            <p className="mb-2 text-small font-medium">Preview</p>
            <Preview preset={preset} message={message} banner={banner} garland={garland} />
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteFestiveButton({ id }: { id: string }) {
  return <InlineAction action={deleteFestiveCampaignAction} fields={{ id }} label="Delete" variant="ghost" success="Deleted." />;
}
