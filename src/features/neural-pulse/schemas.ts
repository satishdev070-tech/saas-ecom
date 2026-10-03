/**
 * Neural Pulse contracts: AI output schemas (every model response is validated against these),
 * action input schemas and shared constants. Pure module, safe for client and server.
 */
import { z } from "zod";
import { ALL_CHANNELS, CONTENT_PILLARS } from "@/features/social/compose";

export const AI_PROVIDERS = ["gemini", "groq", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const PROVIDER_LABELS: Record<AiProvider, string> = { gemini: "Google Gemini", groq: "Groq (Llama)", anthropic: "Anthropic Claude" };

export const BRAND_LANGUAGES = ["en", "hi", "hinglish", "bn", "gu", "kn", "ml", "mr", "pa", "ta", "te"] as const;
export type BrandLanguage = (typeof BRAND_LANGUAGES)[number];
export const LANGUAGE_LABELS: Record<BrandLanguage, string> = {
  en: "English",
  hi: "Hindi",
  hinglish: "Hinglish",
  bn: "Bengali",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
};

export const POST_FORMATS = ["reel", "carousel", "static", "story"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export const FORMAT_LABELS: Record<PostFormat, string> = { reel: "Reel", carousel: "Carousel", static: "Static post", story: "Story" };

/** Daily generations per store (all Neural Pulse features and the inbox / review reply helpers). */
export const DAILY_GENERATION_LIMIT = 30;

export type BrandProfile = {
  voice: string | null;
  audience: string | null;
  keywords: string[];
  dos: string | null;
  donts: string | null;
  languages: BrandLanguage[];
};

export const EMPTY_BRAND: BrandProfile = { voice: null, audience: null, keywords: [], dos: null, donts: null, languages: ["en"] };

// ---------- Model output schemas ----------

const text = (max: number) => z.string().trim().min(1).max(max);
const channels = z.array(z.enum(ALL_CHANNELS)).min(1).max(6);
const hashtags = z.array(z.string().trim().min(1).max(60)).max(30);

/** Language codes the model may echo back in other casings; unknown ones are dropped. */
const languageList = z
  .array(z.string())
  .transform((xs) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter((x): x is BrandLanguage => (BRAND_LANGUAGES as readonly string[]).includes(x)))].slice(0, 5));

export const brandDraftOutput = z.object({
  voice: text(500),
  audience: text(500),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  dos: text(1000),
  donts: text(1000),
  languages: languageList.pipe(z.array(z.enum(BRAND_LANGUAGES)).min(1)),
});
export type BrandDraft = z.infer<typeof brandDraftOutput>;

export const ideaSchema = z.object({
  title: text(120),
  hook: text(300),
  format: z.enum(POST_FORMATS),
  pillar: z.enum(CONTENT_PILLARS),
  channels,
  notes: z.string().trim().max(500).optional(),
});
export type ContentIdea = z.infer<typeof ideaSchema>;
export const ideasOutput = z.object({ ideas: z.array(ideaSchema).min(5).max(12) });

export const captionOutput = z.object({
  instagram: text(2200),
  facebook: text(2200),
  x: text(280),
  hashtags,
});
export type CaptionSet = z.infer<typeof captionOutput>;

export const planPostSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  title: text(120),
  caption: text(2200),
  format: z.enum(POST_FORMATS),
  pillar: z.enum(CONTENT_PILLARS),
  channels,
  hashtags: hashtags.optional().default([]),
  keyDate: z.string().trim().max(80).optional(),
});
export type PlanPost = z.infer<typeof planPostSchema>;
export const planOutput = z.object({ posts: z.array(planPostSchema).min(1).max(40) });

export const replyOutput = z.object({ reply: text(1000) });
export const profileDescriptionOutput = z.object({ description: text(750) });

// ---------- Action inputs ----------

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number, msg: string) => z.preprocess(blank, z.string().trim().max(max, msg).optional());

/** Brand profile form. Keywords are comma / newline separated. */
export const brandProfileInput = z.object({
  voice: optText(500, "Up to 500 characters"),
  audience: optText(500, "Up to 500 characters"),
  keywords: z.string().max(2000).optional().default(""),
  dos: optText(1000, "Up to 1,000 characters"),
  donts: optText(1000, "Up to 1,000 characters"),
  languages: z.array(z.enum(BRAND_LANGUAGES)).min(1, "Pick at least one language").max(5, "Pick up to 5 languages"),
});

export function parseKeywords(raw: string): string[] {
  const out: string[] = [];
  for (const k of raw.split(/[,\n]+/)) {
    const v = k.trim().replace(/\s+/g, " ").slice(0, 40);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 30);
}

export const ideasInput = z.object({ focus: optText(300, "Up to 300 characters") });

export const captionInput = z
  .object({
    productId: z.preprocess(blank, z.uuid().optional()),
    idea: optText(800, "Up to 800 characters"),
  })
  .refine((v) => v.productId || v.idea, { path: ["idea"], message: "Pick a product or describe the post" });

export const planInput = z.object({
  weeks: z.coerce.number().pipe(z.union([z.literal(2), z.literal(4)])),
  postsPerWeek: z.coerce.number().int().min(2, "At least 2 a week").max(7, "Up to 7 a week"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31"),
  focus: optText(300, "Up to 300 characters"),
});

/** One calendar item from any generator output. */
export const calendarItemInput = z.object({
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(2200),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
  pillar: z.enum(CONTENT_PILLARS).optional(),
  channels,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CalendarItem = z.infer<typeof calendarItemInput>;
export const addToCalendarInput = z.object({ mode: z.enum(["draft", "plan"]), items: z.array(calendarItemInput).min(1).max(40) });

export type GenerationKind = "caption" | "hashtags" | "ideas" | "plan" | "review_reply" | "message_reply" | "profile";

/** A past generation for the history list (no secrets; the output is re-validated before rendering). */
export type GenerationRow = { id: string; kind: GenerationKind; provider: string; model: string | null; tokens: number | null; createdAt: string; input: unknown; output: unknown };
