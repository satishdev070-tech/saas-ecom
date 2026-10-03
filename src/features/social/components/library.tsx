"use client";

import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Badge } from "@/components/ui/layout";
import { ActionDialog, ActionForm } from "@/features/settings/ui/action-controls";
import { formatDate } from "@/features/analytics/dates";
import { deleteCampaignAction, deleteHashtagSetAction, deleteMarketingDateAction, saveCampaignAction, saveHashtagSetAction, saveMarketingDateAction } from "../planner-actions";
import type { Campaign, HashtagSet, MarketingDate } from "../planner-types";

const KINDS = [
  { value: "sale", label: "Sale" },
  { value: "launch", label: "Launch" },
  { value: "festival", label: "Festival" },
  { value: "other", label: "Other" },
];
const KIND_TONE = { sale: "error", launch: "info", festival: "warning", other: "neutral" } as const;
const dayIso = (k: string | null) => (k ? `${k}T12:00:00+05:30` : null);
const row = "flex flex-wrap items-center gap-x-3 gap-y-2 py-3";

function CampaignFields({ c, errors, idp }: { c?: Campaign; errors: Record<string, string[]>; idp: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <TextField id={`${idp}-name`} label="Name" name="name" defaultValue={c?.name} required maxLength={80} errors={errors.name} />
      <TextField id={`${idp}-color`} label="Colour" name="color" type="color" defaultValue={c?.color ?? "#6366f1"} className="[&_input]:h-10 [&_input]:w-16 [&_input]:p-1" errors={errors.color} />
      <TextField id={`${idp}-goal`} label="Goal" name="goal" defaultValue={c?.goal ?? ""} maxLength={200} placeholder="200 orders in Diwali week" optional className="sm:col-span-2" errors={errors.goal} />
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <TextField id={`${idp}-start`} label="Starts" name="startsOn" type="date" defaultValue={c?.startsOn ?? ""} optional errors={errors.startsOn} />
        <TextField id={`${idp}-end`} label="Ends" name="endsOn" type="date" defaultValue={c?.endsOn ?? ""} optional errors={errors.endsOn} />
      </div>
    </div>
  );
}

export function CampaignsManager({ campaigns, canWrite }: { campaigns: Campaign[]; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {campaigns.length ? (
        <ul className="divide-y divide-border">
          {campaigns.map((c) => (
            <li key={c.id} className={row}>
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-caption text-muted">
                  {c.startsOn || c.endsOn ? `${formatDate(dayIso(c.startsOn))} – ${formatDate(dayIso(c.endsOn))}` : "No dates"}
                  {c.goal ? ` · ${c.goal}` : ""}
                </p>
              </div>
              {canWrite ? (
                <div className="flex gap-2">
                  <ActionDialog action={saveCampaignAction} fields={{ id: c.id }} title={`Edit ${c.name}`} triggerLabel="Edit" triggerVariant="ghost" confirmLabel="Save">
                    {(errors) => <CampaignFields c={c} errors={errors} idp={`c-${c.id}`} />}
                  </ActionDialog>
                  <ActionDialog action={deleteCampaignAction} fields={{ id: c.id }} title={`Delete ${c.name}?`} description="Posts in this campaign stay, without a campaign." triggerLabel="Delete" triggerVariant="ghost" confirmLabel="Delete" variant="danger" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">No campaigns yet. Group posts for a sale or launch and see them in one colour on the calendar.</p>
      )}
      {canWrite ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-small font-medium">Add campaign</summary>
          <ActionForm action={saveCampaignAction} submitLabel="Add campaign" success="Campaign added." resetOnSuccess className="mt-3 space-y-3">
            {(errors) => <CampaignFields errors={errors} idp="c-new" />}
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

function SetFields({ s, errors, idp }: { s?: HashtagSet; errors: Record<string, string[]>; idp: string }) {
  return (
    <div className="space-y-3">
      <TextField id={`${idp}-name`} label="Name" name="name" defaultValue={s?.name} required maxLength={60} errors={errors.name} />
      <TextAreaField id={`${idp}-tags`} label="Hashtags" name="tags" rows={3} defaultValue={s?.tags.join(" ")} placeholder="#handloom #sareelove #madeinindia" hint="Separate with spaces or commas. Up to 30." required errors={errors.tags} />
    </div>
  );
}

export function HashtagSetsManager({ sets, canWrite }: { sets: HashtagSet[]; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {sets.length ? (
        <ul className="divide-y divide-border">
          {sets.map((s) => (
            <li key={s.id} className={row}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name} <span className="text-caption font-normal text-muted">({s.tags.length})</span></p>
                <p className="line-clamp-2 text-caption break-words text-muted">{s.tags.join(" ")}</p>
              </div>
              {canWrite ? (
                <div className="flex gap-2">
                  <ActionDialog action={saveHashtagSetAction} fields={{ id: s.id }} title={`Edit ${s.name}`} triggerLabel="Edit" triggerVariant="ghost" confirmLabel="Save">
                    {(errors) => <SetFields s={s} errors={errors} idp={`h-${s.id}`} />}
                  </ActionDialog>
                  <ActionDialog action={deleteHashtagSetAction} fields={{ id: s.id }} title={`Delete ${s.name}?`} triggerLabel="Delete" triggerVariant="ghost" confirmLabel="Delete" variant="danger" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">No hashtag sets yet. Save groups you reuse and insert them in one click while writing.</p>
      )}
      {canWrite ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-small font-medium">Add hashtag set</summary>
          <ActionForm action={saveHashtagSetAction} submitLabel="Add set" success="Hashtag set added." resetOnSuccess className="mt-3 space-y-3">
            {(errors) => <SetFields errors={errors} idp="h-new" />}
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

function DateFields({ d, errors, idp }: { d?: MarketingDate; errors: Record<string, string[]>; idp: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField id={`${idp}-title`} label="Title" name="title" defaultValue={d?.title} required maxLength={80} className="sm:col-span-2" errors={errors.title} />
      <TextField id={`${idp}-date`} label="Date" name="onDate" type="date" defaultValue={d?.onDate} required errors={errors.onDate} />
      <SelectField id={`${idp}-kind`} label="Kind" name="kind" defaultValue={d?.kind ?? "sale"} options={KINDS} errors={errors.kind} />
      <TextField id={`${idp}-notes`} label="Notes" name="notes" defaultValue={d?.notes ?? ""} maxLength={500} optional className="sm:col-span-2" errors={errors.notes} />
    </div>
  );
}

export function MarketingDatesManager({ dates, canWrite }: { dates: MarketingDate[]; canWrite: boolean }) {
  const own = dates.filter((d) => !d.builtIn);
  const builtIn = dates.filter((d) => d.builtIn);
  return (
    <div className="space-y-4">
      {own.length ? (
        <ul className="divide-y divide-border">
          {own.map((d) => (
            <li key={d.id ?? `${d.onDate}-${d.title}`} className={row}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.title} <Badge tone={KIND_TONE[d.kind]}>{d.kind}</Badge></p>
                <p className="text-caption text-muted">{formatDate(dayIso(d.onDate))}{d.notes ? ` · ${d.notes}` : ""}</p>
              </div>
              {canWrite && d.id ? (
                <div className="flex gap-2">
                  <ActionDialog action={saveMarketingDateAction} fields={{ id: d.id }} title={`Edit ${d.title}`} triggerLabel="Edit" triggerVariant="ghost" confirmLabel="Save">
                    {(errors) => <DateFields d={d} errors={errors} idp={`d-${d.id}`} />}
                  </ActionDialog>
                  <ActionDialog action={deleteMarketingDateAction} fields={{ id: d.id }} title={`Delete ${d.title}?`} triggerLabel="Delete" triggerVariant="ghost" confirmLabel="Delete" variant="danger" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">No store dates yet. Add your sales, launches and anniversaries so they show on the calendar.</p>
      )}
      {canWrite ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-small font-medium">Add key date</summary>
          <ActionForm action={saveMarketingDateAction} submitLabel="Add date" success="Date added." resetOnSuccess className="mt-3 space-y-3">
            {(errors) => <DateFields errors={errors} idp="d-new" />}
          </ActionForm>
        </details>
      ) : null}
      {builtIn.length ? (
        <div>
          <h3 className="mb-2 text-label">Built-in occasions <span className="font-normal text-muted">(read-only)</span></h3>
          <ul className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-2">
            {builtIn.map((d) => (
              <li key={`${d.onDate}-${d.title}`} className="flex justify-between gap-2 border-b border-border/60 py-1">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-muted tabular-nums">{formatDate(dayIso(d.onDate))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
