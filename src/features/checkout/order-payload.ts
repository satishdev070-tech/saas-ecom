import { toDecimalString } from "@/lib/money";
import type { OrderAddress } from "@/features/customer-account/address";
import type { DiscountDefinition, PaymentMethod, PricingResult } from "./pricing";

/**
 * Pure builder for the `svc_place_order(p_order, p_items)` arguments. Amounts are converted
 * from paise to rupee numbers exactly once, here. The SQL function re-checks every unit price
 * under row lock (PRICE_CHANGED), reserves stock (INSUFFICIENT_STOCK) and discount limits
 * (DISCOUNT_INVALID); the `orders` CHECK re-checks the totals identity.
 */

/** Minor units -> rupee number for SQL numeric parameters (exact: at most 2 decimals). */
export function rupees(minor: number): number {
  return Number(toDecimalString(minor));
}

export type OrderPayloadInput = {
  tenantId: string;
  idempotencyKey: string;
  cartId: string | null;
  customerId: string | null;
  email: string;
  phone: string;
  paymentMethod: PaymentMethod;
  pricing: PricingResult;
  discount: DiscountDefinition | null;
  shippingAddress: OrderAddress;
  customerSnapshot: Record<string, string | boolean | null>;
  note: string | null;
  reservationMinutes: number;
};

export type OrderItemPayload = { variant_id: string; quantity: number; unit_price: number; discount_total: number; tax_rate: number; tax_total: number };

export function buildOrderPayload(input: OrderPayloadInput): { order: Record<string, unknown>; items: OrderItemPayload[] } {
  const p = input.pricing;
  const selected = p.shipping.selected;
  const discountApplied = p.discount.status === "applied" && input.discount ? input.discount : null;
  const order = {
    tenant_id: input.tenantId,
    idempotency_key: input.idempotencyKey,
    customer_id: input.customerId,
    cart_id: input.cartId,
    email: input.email,
    phone: input.phone,
    payment_method: input.paymentMethod,
    subtotal: rupees(p.subtotal),
    discount_total: rupees(p.discountTotal),
    shipping_total: rupees(p.shippingTotal),
    cod_fee: rupees(p.codFee),
    tax_total: rupees(p.taxTotal),
    grand_total: rupees(p.grandTotal),
    prices_include_tax: p.pricesIncludeTax,
    discount_id: discountApplied?.id ?? null,
    discount_code: discountApplied?.code ?? null,
    discount_snapshot: discountApplied
      ? {
          id: discountApplied.id,
          code: discountApplied.code,
          title: discountApplied.title ?? null,
          type: discountApplied.type,
          value: discountApplied.type === "fixed_amount" ? rupees(discountApplied.value) : discountApplied.value,
          amount: rupees(p.discountTotal),
          free_shipping: p.discount.status === "applied" && p.discount.freeShipping,
          automatic: discountApplied.code === null,
        }
      : null,
    shipping_rate_snapshot: selected
      ? {
          id: selected.id,
          name: selected.name,
          price: rupees(selected.price),
          original_price: rupees(selected.originalPrice),
          estimated_days_min: selected.estimatedDaysMin,
          estimated_days_max: selected.estimatedDaysMax,
        }
      : null,
    shipping_address: input.shippingAddress,
    billing_address: null,
    customer_snapshot: input.customerSnapshot,
    note: input.note,
    reservation_minutes: input.reservationMinutes,
  };
  const items = p.lines.map((l) => ({
    variant_id: l.key,
    quantity: l.quantity,
    unit_price: rupees(l.unitPrice),
    discount_total: rupees(l.discount),
    tax_rate: l.taxRate,
    tax_total: rupees(l.tax),
  }));
  return { order, items };
}
