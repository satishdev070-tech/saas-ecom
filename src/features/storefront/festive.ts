import { z } from "zod";

/**
 * Festive vibes: a seller schedules a festival look (Navratri, Diwali, …) with start and end
 * dates. While it runs, the storefront shows a festive announcement bar, a decorative garland
 * under the header and, optionally, gently falling petals. Nothing about the theme itself changes,
 * so it switches off cleanly when the dates end. Stored in stores.festive_settings (migration 2700).
 * PURE (no I/O), unit tested.
 */

export const FESTIVE_PRESETS = {
  navratri: { label: "Navratri", bg: "#b5122e", fg: "#ffffff", accent: "#f7b500", motif: "toran", petals: "#f7b500", message: "Shubh Navratri! Celebrate nine nights in style with our festive picks." },
  durga_puja: { label: "Durga Puja", bg: "#a50f1e", fg: "#ffffff", accent: "#ffd166", motif: "toran", petals: "#ffd166", message: "Shubho Pujo! Festive looks for every pandal hop." },
  diwali: { label: "Diwali", bg: "#3b0a45", fg: "#fff4d6", accent: "#ffb300", motif: "diya", petals: "#ffb300", message: "Happy Diwali! Light up the season with our festive collection." },
  karva_chauth: { label: "Karva Chauth", bg: "#8e0e3c", fg: "#ffffff", accent: "#ffcc4d", motif: "toran", petals: "#ff5c8a", message: "Karva Chauth special: shine on your big night." },
  holi: { label: "Holi", bg: "#ff3d7f", fg: "#ffffff", accent: "#2ec4b6", motif: "dots", petals: "multi", message: "Happy Holi! Colour your wardrobe this festive season." },
  raksha_bandhan: { label: "Raksha Bandhan", bg: "#e85d04", fg: "#ffffff", accent: "#ffd166", motif: "dots", petals: "#ffd166", message: "Happy Raksha Bandhan! Gifts your sibling will love." },
  eid: { label: "Eid", bg: "#0b5d4a", fg: "#fdf6e3", accent: "#d4af37", motif: "stars", petals: "#d4af37", message: "Eid Mubarak! Festive edits for Eid celebrations." },
  wedding: { label: "Wedding season", bg: "#7a1f3d", fg: "#fff7ed", accent: "#e0b15b", motif: "toran", petals: "#ff8fab", message: "Wedding season is here: looks for every function." },
  independence_day: { label: "Independence Day", bg: "#0a3d91", fg: "#ffffff", accent: "#ff9933", motif: "tricolour", petals: "multi", message: "Happy Independence Day! Celebrate with our special offers." },
  christmas: { label: "Christmas", bg: "#14532d", fg: "#ffffff", accent: "#dc2626", motif: "stars", petals: "#ffffff", message: "Merry Christmas! Gift something special this season." },
  new_year: { label: "New Year", bg: "#111827", fg: "#fde68a", accent: "#fbbf24", motif: "stars", petals: "#fbbf24", message: "Happy New Year! Start the year in style." },
  sale: { label: "Festive sale", bg: "#111111", fg: "#ffffff", accent: "#ef4444", motif: "dots", petals: "#ef4444", message: "Festive sale is live: limited-time prices on our bestsellers." },
} as const;

export type FestivePresetId = keyof typeof FESTIVE_PRESETS;
export const FESTIVE_PRESET_IDS = Object.keys(FESTIVE_PRESETS) as FestivePresetId[];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const festiveCampaignSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{6,24}$/),
    preset: z.enum(FESTIVE_PRESET_IDS as [FestivePresetId, ...FestivePresetId[]]),
    start: z.string().regex(DATE, "Choose a start date"),
    end: z.string().regex(DATE, "Choose an end date"),
    message: z.string().trim().max(160, "Keep the message under 160 characters"),
    link: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || (v.startsWith("/") && !v.startsWith("//")), "Use a link on your store, starting with /"),
    banner: z.boolean(),
    garland: z.boolean(),
    petals: z.boolean(),
  })
  .refine((c) => c.end >= c.start, { message: "The end date must be on or after the start date", path: ["end"] });

export type FestiveCampaign = z.infer<typeof festiveCampaignSchema>;
export const MAX_FESTIVE_CAMPAIGNS = 12;

/** Valid campaigns from stores.festive_settings; anything malformed is dropped. */
export function parseFestiveSettings(raw: unknown): FestiveCampaign[] {
  const list = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { campaigns?: unknown }).campaigns : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => {
    const r = festiveCampaignSchema.safeParse(c);
    return r.success ? [r.data] : [];
  });
}

/** Today's date in India (stores and shoppers are IST), as YYYY-MM-DD. */
export function istDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The campaign running on `today` (inclusive dates); the most recently started wins on overlap. */
export function activeFestive(campaigns: readonly FestiveCampaign[], today: string = istDate()): FestiveCampaign | null {
  const live = campaigns.filter((c) => c.start <= today && today <= c.end);
  return live.sort((a, b) => (a.start < b.start ? 1 : -1))[0] ?? null;
}

export type FestiveStatus = "running" | "scheduled" | "ended";
export function festiveStatus(c: FestiveCampaign, today: string = istDate()): FestiveStatus {
  return today < c.start ? "scheduled" : today > c.end ? "ended" : "running";
}
