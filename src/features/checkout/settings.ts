import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { AppError } from "@/lib/errors";
import type { CodSettings, PincodeRuleDefinition, ShippingRateDefinition, TaxSettings } from "./pricing";

/** Store JSON settings are rupee amounts (numeric); parsed defensively and converted to paise. */
const rupees = z.coerce.number().finite().nonnegative();

const taxSchema = z.object({
  prices_include_tax: z.boolean().catch(true).default(true),
  rules: z
    .array(z.object({ max_unit_price: rupees.nullable().optional(), rate: z.coerce.number().min(0).max(100) }))
    .catch([{ max_unit_price: 2500, rate: 5 }, { rate: 18 }])
    .default([{ max_unit_price: 2500, rate: 5 }, { rate: 18 }]),
});

const codSchema = z.object({
  enabled: z.boolean().catch(false).default(true),
  fee: rupees.catch(0).default(0),
  min_order: rupees.catch(0).default(0),
  max_order: rupees.nullable().catch(null).default(null),
});

export function parseTaxSettings(raw: unknown): TaxSettings {
  const t = taxSchema.parse(raw && typeof raw === "object" ? raw : {});
  return {
    pricesIncludeTax: t.prices_include_tax,
    rules: t.rules.map((r) => ({ maxUnitPrice: r.max_unit_price == null ? null : toMinor(r.max_unit_price), rate: r.rate })),
  };
}

export function parseCodSettings(raw: unknown): CodSettings {
  const c = codSchema.parse(raw && typeof raw === "object" ? raw : {});
  return { enabled: c.enabled, fee: toMinor(c.fee), minOrder: toMinor(c.min_order), maxOrder: c.max_order == null ? null : toMinor(c.max_order) };
}

export type StoreProfile = {
  name: string;
  legalName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  postalCode: string | null;
  orderPrefix: string;
};

export type CheckoutSettings = {
  store: StoreProfile;
  tax: TaxSettings;
  cod: CodSettings;
  shippingRates: ShippingRateDefinition[];
  pincodeRules: PincodeRuleDefinition[];
};

/**
 * A store that has not configured any shipping rate still needs to take orders: it ships free
 * across India with a generic estimate until the seller adds rates in Settings -> Shipping.
 */
export const DEFAULT_SHIPPING_RATE: ShippingRateDefinition = {
  id: "default",
  name: "Standard delivery",
  price: 0,
  minSubtotal: 0,
  maxSubtotal: null,
  minWeightGrams: 0,
  maxWeightGrams: null,
  pincodePrefixes: [],
  estimatedDaysMin: 4,
  estimatedDaysMax: 8,
  codAllowed: true,
  position: 0,
};

export const loadCheckoutSettings = cache(async (tenantId: string): Promise<CheckoutSettings> => {
  const admin = createSupabaseAdminClient();
  const [store, rates, rules] = await Promise.all([
    admin.from("stores").select("name, legal_name, gstin, email, phone, address, tax_settings, cod_settings, order_prefix").eq("tenant_id", tenantId).single(),
    admin.from("shipping_rates").select("*").eq("tenant_id", tenantId).eq("active", true).order("position"),
    admin.from("pincode_rules").select("prefix, deliverable, cod_allowed, extra_days").eq("tenant_id", tenantId),
  ]);
  if (store.error || !store.data) throw new AppError("TENANT_UNAVAILABLE", { context: { db: store.error?.message } });
  const address = (store.data.address ?? {}) as Record<string, unknown>;
  const configuredRates: ShippingRateDefinition[] = (rates.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    price: toMinor(r.price),
    minSubtotal: toMinor(r.min_subtotal),
    maxSubtotal: r.max_subtotal === null ? null : toMinor(r.max_subtotal),
    minWeightGrams: r.min_weight_grams,
    maxWeightGrams: r.max_weight_grams,
    pincodePrefixes: r.pincode_prefixes ?? [],
    estimatedDaysMin: r.estimated_days_min,
    estimatedDaysMax: r.estimated_days_max,
    codAllowed: r.cod_allowed,
    position: r.position,
  }));
  return {
    store: {
      name: store.data.name,
      legalName: store.data.legal_name,
      gstin: store.data.gstin,
      email: store.data.email,
      phone: store.data.phone,
      state: typeof address.state === "string" ? address.state : null,
      postalCode: typeof address.postal_code === "string" ? address.postal_code : null,
      orderPrefix: store.data.order_prefix,
    },
    tax: parseTaxSettings(store.data.tax_settings),
    cod: parseCodSettings(store.data.cod_settings),
    shippingRates: configuredRates.length > 0 ? configuredRates : [DEFAULT_SHIPPING_RATE],
    pincodeRules: (rules.data ?? []).map((r) => ({ prefix: r.prefix, deliverable: r.deliverable, codAllowed: r.cod_allowed, extraDays: r.extra_days })),
  };
});

export function formatOrderNumber(prefix: string, orderNumber: number | string): string {
  return `${prefix}${orderNumber}`;
}
