import { z } from "zod";
import { gstin, pincode } from "@/lib/validation/common";
import { bool, intWithDefault, optionalHttpsUrl, optionalInt, optionalRupees, optionalText, rupeesOrZero } from "./fields";
import { TEMPLATE_CHANNELS, TEMPLATE_KEYS } from "./notification-templates";

/** Settings input schemas (pure). */


const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalPhone = z.preprocess(
  blankToUndef,
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"))
    .transform((v) => `+91${v.slice(-10)}`)
    .optional(),
);

export const storeDetailsSchema = z.object({
  name: z.string({ error: "Enter your store name" }).trim().min(2, "Enter your store name").max(120),
  tagline: optionalText(200),
  description: optionalText(2000),
  email: z.preprocess(blankToUndef, z.email("Enter a valid email").trim().toLowerCase().max(254).optional()),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: z.preprocess(blankToUndef, pincode.optional()),
  instagram: optionalHttpsUrl,
  facebook: optionalHttpsUrl,
  youtube: optionalHttpsUrl,
  pinterest: optionalHttpsUrl,
  x: optionalHttpsUrl,
  gstin: z.preprocess(blankToUndef, gstin.optional()),
  legalName: optionalText(200),
  orderPrefix: z.preprocess((v) => (v === undefined ? "#" : v), z.string().trim().max(8, "At most 8 characters").regex(/^[A-Za-z0-9#-]*$/, "Letters, numbers, # or - only")),
  lowStockDefault: intWithDefault(0, 100_000, 5),
  removeLogo: bool,
  removeFavicon: bool,
});
export type StoreDetailsInput = z.infer<typeof storeDetailsSchema>;

/** Store-level search engine settings (stores.seo). Verification values are the token only, not the meta tag. */
export const seoSettingsSchema = z.object({
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  noindex: bool,
  googleVerification: z.preprocess(
    (v) => (typeof v === "string" ? (v.match(/content=["']([^"']+)["']/)?.[1] ?? v).trim() || undefined : v),
    z.string().regex(/^[A-Za-z0-9_-]{10,100}$/, "Paste the content value of Google's HTML tag").optional(),
  ),
  bingVerification: z.preprocess(
    (v) => (typeof v === "string" ? (v.match(/content=["']([^"']+)["']/)?.[1] ?? v).trim() || undefined : v),
    z.string().regex(/^[A-Za-z0-9]{10,64}$/, "Paste the content value of Bing's msvalidate.01 tag").optional(),
  ),
  removeOgImage: bool,
});

export const shippingRateSchema = z
  .object({
    id: z.preprocess(blankToUndef, z.uuid().optional()),
    name: z.string({ error: "Enter a name" }).trim().min(1, "Enter a name").max(80),
    price: rupeesOrZero,
    minSubtotal: rupeesOrZero,
    maxSubtotal: optionalRupees,
    minWeight: intWithDefault(0, 100_000, 0),
    maxWeight: optionalInt(1, 100_000),
    pincodePrefixes: z
      .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
      .transform((s) => [...new Set(s.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean))])
      .pipe(z.array(z.string().regex(/^[1-9]\d{0,5}$/, "PIN prefixes are 1–6 digits and can't start with 0")).max(200)),
    daysMin: intWithDefault(0, 60, 3),
    daysMax: intWithDefault(0, 90, 7),
    codAllowed: bool,
    active: bool,
    position: intWithDefault(0, 1000, 0),
  })
  .superRefine((v, ctx) => {
    if (v.maxSubtotal !== null && v.maxSubtotal <= v.minSubtotal) ctx.addIssue({ code: "custom", path: ["maxSubtotal"], message: "Must be more than the minimum" });
    if (v.maxWeight !== null && v.maxWeight <= v.minWeight) ctx.addIssue({ code: "custom", path: ["maxWeight"], message: "Must be more than the minimum weight" });
    if (v.daysMax < v.daysMin) ctx.addIssue({ code: "custom", path: ["daysMax"], message: "Must be at least the minimum days" });
  });
export type ShippingRateInput = z.infer<typeof shippingRateSchema>;

export const pincodeRuleSchema = z.object({
  prefix: z.string({ error: "Enter a PIN prefix" }).trim().regex(/^[1-9]\d{0,5}$/, "1–6 digits, not starting with 0"),
  deliverable: bool,
  codAllowed: bool,
  extraDays: intWithDefault(0, 30, 0),
});

export const codSettingsSchema = z
  .object({ enabled: bool, fee: rupeesOrZero, minOrder: rupeesOrZero, maxOrder: rupeesOrZero })
  .superRefine((v, ctx) => {
    if (v.maxOrder > 0 && v.maxOrder <= v.minOrder) ctx.addIssue({ code: "custom", path: ["maxOrder"], message: "Must be more than the minimum (or 0 for no limit)" });
  });

export const RAZORPAY_KEY_ID_RE = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;

export const notificationTemplateSchema = z.object({
  key: z.enum(TEMPLATE_KEYS),
  channel: z.enum(TEMPLATE_CHANNELS).default("email"),
  subject: optionalText(200),
  body: z.string({ error: "Enter the message" }).trim().min(1, "Enter the message").max(20000),
  active: bool,
});
