import { Card } from "@/components/ui/layout";
import { formatDateTime } from "@/features/analytics/dates";
import type { Json } from "@/lib/supabase/database.types";
import { PLATFORM_SETTINGS } from "../settings-registry";
import { PlatformSettingForm } from "./admin-forms";

/** Editable cards for the registry settings that belong to one admin page. */
export function SettingCards({ keys, stored }: { keys: readonly string[]; stored: Map<string, { value: Json; updatedAt: string }> }) {
  return (
    <>
      {PLATFORM_SETTINGS.filter((s) => keys.includes(s.key)).map((s) => {
        const row = stored.get(s.key);
        return (
          <Card key={s.key} description={row ? `Last changed ${formatDateTime(row.updatedAt)}` : "Using the default"}>
            <PlatformSettingForm settingKey={s.key} label={s.label} description={s.description} kind={s.kind} value={row ? row.value : s.defaultValue} />
          </Card>
        );
      })}
    </>
  );
}
