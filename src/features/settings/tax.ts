import { z } from "zod";

/**
 * GST slab settings stored in stores.tax_settings (pure):
 *   { prices_include_tax: boolean, rules: [{ max_unit_price?: rupees, rate: percent }, ...] }
 * Rules are evaluated in order: the first rule whose max_unit_price >= unit price applies; the
 * last rule has no max (catch-all). Apparel default: ≤ ₹2,500 → 5%, above → 18%.
 */

export const GST_RATES = [0, 3, 5, 12, 18, 28] as const;

export const taxRuleSchema = z.object({
  max_unit_price: z.number().positive().max(10_000_000).multipleOf(0.01).nullable().optional(),
  rate: z.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "Choose a GST rate"),
});

export const taxSettingsSchema = z
  .object({
    prices_include_tax: z.boolean(),
    rules: z.array(taxRuleSchema).min(1, "Add at least one rate").max(10),
  })
  .superRefine((v, ctx) => {
    v.rules.forEach((r, i) => {
      const last = i === v.rules.length - 1;
      if (last && r.max_unit_price != null) ctx.addIssue({ code: "custom", path: ["rules"], message: "The last slab must apply to all higher prices (leave its limit blank)." });
      if (!last && r.max_unit_price == null) ctx.addIssue({ code: "custom", path: ["rules"], message: "Only the last slab can have no price limit." });
      const prev = v.rules[i - 1]?.max_unit_price;
      if (i > 0 && prev != null && r.max_unit_price != null && r.max_unit_price <= prev) ctx.addIssue({ code: "custom", path: ["rules"], message: "Price limits must increase from one slab to the next." });
    });
  });

export type TaxSettings = z.infer<typeof taxSettingsSchema>;

export const DEFAULT_TAX_SETTINGS: TaxSettings = { prices_include_tax: true, rules: [{ max_unit_price: 2500, rate: 5 }, { rate: 18 }] };

/** Lenient read of stored JSON (falls back to the default). */
export function readTaxSettings(v: unknown): TaxSettings {
  const r = taxSettingsSchema.safeParse(v);
  return r.success ? r.data : DEFAULT_TAX_SETTINGS;
}

/** GST rate for a unit price in paise under the given settings. */
export function rateForUnitPrice(settings: TaxSettings, unitPriceMinor: number): number {
  for (const r of settings.rules) {
    if (r.max_unit_price == null || unitPriceMinor <= Math.round(r.max_unit_price * 100)) return r.rate;
  }
  return settings.rules[settings.rules.length - 1]?.rate ?? 0;
}
