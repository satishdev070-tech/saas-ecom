/**
 * Checkout pricing engine. PURE: no IO, no clock, no randomness. Every amount is an integer
 * number of paise. The caller loads CURRENT variant prices, the discount definition, shipping
 * rates, PIN rules, COD and tax settings from the database and passes them in; the result is
 * what the storefront displays AND what is sent to `svc_place_order`, so the numbers always
 * satisfy the `orders` CHECK:
 *
 *   grand_total = subtotal - discount_total + shipping_total + cod_fee (+ tax_total when prices exclude tax)
 *
 * and the `order_items` CHECK `line_total = unit_price * quantity - discount_total`.
 *
 * Rules (documented so the seller dashboard can explain them):
 * - Discount eligibility (`min_subtotal`) is checked against the cart subtotal before discounts.
 * - Order-level discounts (percentage / fixed) are split across eligible lines by the
 *   largest-remainder method, weighted by line subtotal, so line discounts sum exactly.
 * - buy_x_get_y discounts the CHEAPEST eligible units: for every (X + Y) eligible units, Y units
 *   get `get_percent`% off. The discount stays on the lines those units belong to.
 * - `max_discount` caps every discount type (the capped amount is re-split by largest remainder).
 * - Shipping thresholds (`min_subtotal`/`max_subtotal` on rates) use the subtotal AFTER discounts.
 * - Tax slab = rate of the first rule whose `maxUnitPrice` >= the discounted unit price of the
 *   line (a rule without `maxUnitPrice` matches everything). Inclusive prices: tax is extracted
 *   (net * r / (100 + r)); exclusive: tax is added (net * r / 100). Rounded half-up per line.
 *   Shipping and COD fees are not taxed here.
 * - COD needs: COD enabled, order value (before COD fee) within [minOrder, maxOrder],
 *   the selected rate allows COD, and no PIN rule forbids it.
 */

export type PaymentMethod = "cod" | "online";

export type PricingLineInput = {
  /** Stable key for the line, usually the variant id. */
  key: string;
  productId: string;
  /** Collections the product belongs to (for `applies_to = collections`). */
  collectionIds?: readonly string[];
  /** Current unit price in paise (from product_variants.price). */
  unitPrice: number;
  quantity: number;
  weightGrams?: number;
};

export type DiscountDefinition = {
  id: string;
  code: string | null;
  title?: string;
  type: "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y";
  /** percentage: 0..100 (may be fractional); fixed_amount: paise; others: ignored. */
  value: number;
  appliesTo: "all" | "products" | "collections";
  productIds?: readonly string[];
  collectionIds?: readonly string[];
  /** paise */
  minSubtotal: number;
  /** paise, null = uncapped */
  maxDiscount: number | null;
  buyQuantity?: number;
  getQuantity?: number;
  /** 1..100, default 100 (free). */
  getPercent?: number;
};

export type ShippingRateDefinition = {
  id: string;
  name: string;
  /** paise */
  price: number;
  /** paise */
  minSubtotal: number;
  /** paise, null = no upper bound */
  maxSubtotal: number | null;
  minWeightGrams: number;
  maxWeightGrams: number | null;
  pincodePrefixes: readonly string[];
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  codAllowed: boolean;
  position?: number;
};

export type PincodeRuleDefinition = { prefix: string; deliverable: boolean; codAllowed: boolean; extraDays: number };

export type CodSettings = {
  enabled: boolean;
  /** paise */
  fee: number;
  /** paise */
  minOrder: number;
  /** paise, null = no limit */
  maxOrder: number | null;
};

export type TaxRule = { /** paise, inclusive upper bound; omit for "everything else" */ maxUnitPrice?: number | null; /** percent, e.g. 5 or 18 */ rate: number };
export type TaxSettings = { pricesIncludeTax: boolean; rules: readonly TaxRule[] };

export type PricingInput = {
  lines: readonly PricingLineInput[];
  discount?: DiscountDefinition | null;
  shippingRates: readonly ShippingRateDefinition[];
  pincodeRules?: readonly PincodeRuleDefinition[];
  pincode?: string | null;
  selectedShippingRateId?: string | null;
  paymentMethod?: PaymentMethod | null;
  cod: CodSettings;
  tax: TaxSettings;
};

export type PricedLine = {
  key: string;
  productId: string;
  unitPrice: number;
  quantity: number;
  /** unitPrice * quantity */
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  /** subtotal - discount (matches order_items.line_total) */
  total: number;
};

export type AvailableShippingRate = {
  id: string;
  name: string;
  /** price after a free-shipping discount */
  price: number;
  originalPrice: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  codAllowed: boolean;
};

export type DiscountOutcome =
  | { status: "none" }
  | { status: "rejected"; reason: "min_subtotal" | "not_applicable"; message: string; id: string; code: string | null }
  | { status: "applied"; id: string; code: string | null; type: DiscountDefinition["type"]; amount: number; freeShipping: boolean };

export type PricingResult = {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  codFee: number;
  taxTotal: number;
  grandTotal: number;
  pricesIncludeTax: boolean;
  itemCount: number;
  weightGrams: number;
  discount: DiscountOutcome;
  shipping: {
    /** false when a PIN rule marks the PIN undeliverable or no rate matches */
    serviceable: boolean;
    /** true when no PIN was supplied (rates are indicative) */
    pincodeChecked: boolean;
    extraDays: number;
    rates: AvailableShippingRate[];
    selected: AvailableShippingRate | null;
  };
  cod: { available: boolean; reason: string | null; fee: number };
  paymentMethod: PaymentMethod | null;
};

// ---------------------------------------------------------------------------------------------
// integer helpers

function assertMinor(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer number of paise`);
}

/** round(a / b) half-up for non-negative integers. */
export function divRoundHalfUp(a: number, b: number): number {
  if (b <= 0) throw new RangeError("divisor must be positive");
  return Math.floor((2 * a + b) / (2 * b));
}

/**
 * Splits `total` across `weights` proportionally so the parts sum exactly to `total`
 * (largest-remainder / Hamilton method). Ties go to the earlier index. Requires
 * 0 <= total <= sum(weights); each part is then <= its weight.
 */
export function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  assertMinor(total, "total");
  const sum = weights.reduce((a, w) => a + w, 0);
  if (weights.length === 0 || sum === 0) {
    if (total !== 0) throw new RangeError("cannot allocate a non-zero total over zero weights");
    return weights.map(() => 0);
  }
  if (total > sum) throw new RangeError("total exceeds the sum of weights");
  // BigInt: total * weight can exceed 2^53 for large carts.
  const T = BigInt(total);
  const S = BigInt(sum);
  const parts = weights.map((w) => Number((T * BigInt(w)) / S));
  const remainders = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % S }));
  let left = total - parts.reduce((a, p) => a + p, 0);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : b.r > a.r ? 1 : -1));
  for (const { i } of remainders) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

/** Rate in hundredths of a percent (basis points) so fractional GST rates stay exact. */
function toBasisPoints(ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) throw new RangeError("tax rate must be between 0 and 100");
  return Math.round(ratePercent * 100);
}

export function taxRateForUnitPrice(unitPrice: number, rules: readonly TaxRule[]): number {
  for (const rule of rules) {
    if (rule.maxUnitPrice === undefined || rule.maxUnitPrice === null || unitPrice <= rule.maxUnitPrice) return rule.rate;
  }
  return 0;
}

/** Tax on a net amount (paise). Inclusive: extracted from the amount; exclusive: added on top. */
export function computeTax(net: number, ratePercent: number, inclusive: boolean): number {
  assertMinor(net, "net");
  const bp = toBasisPoints(ratePercent);
  if (bp === 0 || net === 0) return 0;
  return inclusive ? divRoundHalfUp(net * bp, 10_000 + bp) : divRoundHalfUp(net * bp, 10_000);
}

// ---------------------------------------------------------------------------------------------
// discounts

function lineIsEligible(line: PricingLineInput, d: DiscountDefinition): boolean {
  switch (d.appliesTo) {
    case "all":
      return true;
    case "products":
      return (d.productIds ?? []).includes(line.productId);
    case "collections": {
      const wanted = new Set(d.collectionIds ?? []);
      return (line.collectionIds ?? []).some((c) => wanted.has(c));
    }
  }
}

function capAndSpread(perLine: number[], cap: number | null): number[] {
  const total = perLine.reduce((a, b) => a + b, 0);
  if (cap === null || total <= cap) return perLine;
  return allocateLargestRemainder(cap, perLine);
}

/** Per-line discount amounts (paise) for a line-level discount type. */
function lineDiscounts(lines: readonly PricingLineInput[], subtotals: readonly number[], d: DiscountDefinition): number[] {
  const eligible = lines.map((l) => lineIsEligible(l, d));
  const weights = subtotals.map((s, i) => (eligible[i] ? s : 0));
  const eligibleSubtotal = weights.reduce((a, b) => a + b, 0);
  if (eligibleSubtotal === 0) return lines.map(() => 0);

  switch (d.type) {
    case "percentage": {
      const bp = toBasisPoints(d.value);
      // Round DOWN so a percentage discount never exceeds the advertised rate.
      let amount = Math.floor((eligibleSubtotal * bp) / 10_000);
      if (d.maxDiscount !== null) amount = Math.min(amount, d.maxDiscount);
      return allocateLargestRemainder(amount, weights);
    }
    case "fixed_amount": {
      assertMinor(d.value, "fixed discount");
      let amount = Math.min(d.value, eligibleSubtotal);
      if (d.maxDiscount !== null) amount = Math.min(amount, d.maxDiscount);
      return allocateLargestRemainder(amount, weights);
    }
    case "buy_x_get_y": {
      const buy = Math.max(1, Math.floor(d.buyQuantity ?? 1));
      const get = Math.max(1, Math.floor(d.getQuantity ?? 1));
      const pctBp = toBasisPoints(Math.min(100, Math.max(0, d.getPercent ?? 100)));
      // Expand eligible units, cheapest first (stable by line order).
      const units: { line: number; price: number }[] = [];
      lines.forEach((l, i) => {
        if (!eligible[i]) return;
        for (let u = 0; u < l.quantity; u++) units.push({ line: i, price: l.unitPrice });
      });
      const freeUnits = Math.floor(units.length / (buy + get)) * get;
      units.sort((a, b) => a.price - b.price || a.line - b.line);
      const per = lines.map(() => 0);
      for (const unit of units.slice(0, freeUnits)) per[unit.line]! += Math.floor((unit.price * pctBp) / 10_000);
      return capAndSpread(per, d.maxDiscount);
    }
    case "free_shipping":
      return lines.map(() => 0);
  }
}

// ---------------------------------------------------------------------------------------------
// shipping

export function matchPincodeRule(pincode: string | null | undefined, rules: readonly PincodeRuleDefinition[]): PincodeRuleDefinition | null {
  if (!pincode) return null;
  let best: PincodeRuleDefinition | null = null;
  for (const rule of rules) {
    if (pincode.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) best = rule;
  }
  return best;
}

function rateMatches(rate: ShippingRateDefinition, basis: number, weight: number, pincode: string | null | undefined): boolean {
  if (basis < rate.minSubtotal) return false;
  if (rate.maxSubtotal !== null && basis > rate.maxSubtotal) return false;
  if (weight < rate.minWeightGrams) return false;
  if (rate.maxWeightGrams !== null && weight > rate.maxWeightGrams) return false;
  if (rate.pincodePrefixes.length > 0) {
    // Without a PIN we can't know; only show region-specific rates once a PIN is given.
    if (!pincode) return false;
    if (!rate.pincodePrefixes.some((p) => pincode.startsWith(p))) return false;
  }
  return true;
}

export type ShippingQuote = PricingResult["shipping"];

/** Available rates for a basis subtotal (paise, after discounts), weight and optional PIN. */
export function quoteShipping(input: {
  rates: readonly ShippingRateDefinition[];
  pincodeRules?: readonly PincodeRuleDefinition[];
  pincode?: string | null;
  basisSubtotal: number;
  weightGrams: number;
  freeShipping?: boolean;
  selectedRateId?: string | null;
}): ShippingQuote {
  const rule = matchPincodeRule(input.pincode, input.pincodeRules ?? []);
  const extraDays = rule ? Math.max(0, rule.extraDays) : 0;
  if (rule && !rule.deliverable) {
    return { serviceable: false, pincodeChecked: Boolean(input.pincode), extraDays, rates: [], selected: null };
  }
  const rates = input.rates
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => rateMatches(r, input.basisSubtotal, input.weightGrams, input.pincode))
    .sort((a, b) => a.r.price - b.r.price || (a.r.position ?? a.idx) - (b.r.position ?? b.idx))
    .map(({ r }) => ({
      id: r.id,
      name: r.name,
      originalPrice: r.price,
      price: input.freeShipping ? 0 : r.price,
      estimatedDaysMin: r.estimatedDaysMin + extraDays,
      estimatedDaysMax: r.estimatedDaysMax + extraDays,
      codAllowed: r.codAllowed && (rule ? rule.codAllowed : true),
    }));
  const selected = rates.find((r) => r.id === input.selectedRateId) ?? rates[0] ?? null;
  return { serviceable: rates.length > 0, pincodeChecked: Boolean(input.pincode), extraDays, rates, selected };
}

// ---------------------------------------------------------------------------------------------
// main

export function priceCart(input: PricingInput): PricingResult {
  const { lines } = input;
  for (const l of lines) {
    assertMinor(l.unitPrice, "unit price");
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) throw new RangeError("quantity must be a positive integer");
  }
  const subtotals = lines.map((l) => l.unitPrice * l.quantity);
  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  const itemCount = lines.reduce((a, l) => a + l.quantity, 0);
  const weightGrams = lines.reduce((a, l) => a + Math.max(0, l.weightGrams ?? 0) * l.quantity, 0);

  // 1. discount
  let discountOutcome: DiscountOutcome = { status: "none" };
  let perLineDiscount = lines.map(() => 0);
  let freeShipping = false;
  const d = input.discount ?? null;
  if (d && lines.length > 0) {
    if (subtotal < d.minSubtotal) {
      discountOutcome = { status: "rejected", reason: "min_subtotal", message: "Your cart doesn't meet the minimum for this code yet.", id: d.id, code: d.code };
    } else if (d.type === "free_shipping") {
      freeShipping = true;
      discountOutcome = { status: "applied", id: d.id, code: d.code, type: d.type, amount: 0, freeShipping: true };
    } else {
      perLineDiscount = lineDiscounts(lines, subtotals, d);
      const amount = perLineDiscount.reduce((a, b) => a + b, 0);
      discountOutcome =
        amount > 0
          ? { status: "applied", id: d.id, code: d.code, type: d.type, amount, freeShipping: false }
          : { status: "rejected", reason: "not_applicable", message: "This code doesn't apply to the items in your cart.", id: d.id, code: d.code };
    }
  }
  const discountTotal = perLineDiscount.reduce((a, b) => a + b, 0);

  // 2. tax per line (on the discounted line value)
  const inclusive = input.tax.pricesIncludeTax;
  const priced: PricedLine[] = lines.map((l, i) => {
    const lineSubtotal = subtotals[i]!;
    const discount = perLineDiscount[i]!;
    const net = lineSubtotal - discount;
    const effectiveUnit = Math.floor(net / l.quantity);
    const taxRate = taxRateForUnitPrice(effectiveUnit, input.tax.rules);
    return {
      key: l.key,
      productId: l.productId,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      subtotal: lineSubtotal,
      discount,
      taxRate,
      tax: computeTax(net, taxRate, inclusive),
      total: net,
    };
  });
  const taxTotal = priced.reduce((a, l) => a + l.tax, 0);

  // 3. shipping
  const shipping = quoteShipping({
    rates: input.shippingRates,
    pincodeRules: input.pincodeRules,
    pincode: input.pincode,
    basisSubtotal: subtotal - discountTotal,
    weightGrams,
    freeShipping,
    selectedRateId: input.selectedShippingRateId,
  });
  const shippingTotal = lines.length > 0 ? (shipping.selected?.price ?? 0) : 0;

  // 4. COD eligibility + fee
  const orderValue = subtotal - discountTotal + shippingTotal + (inclusive ? 0 : taxTotal);
  let codReason: string | null = null;
  if (!input.cod.enabled) codReason = "Cash on Delivery isn't offered by this store.";
  else if (orderValue < input.cod.minOrder) codReason = "Cash on Delivery isn't available for orders this small.";
  else if (input.cod.maxOrder !== null && orderValue > input.cod.maxOrder) codReason = "Cash on Delivery isn't available above this order value.";
  else if (input.pincode && matchPincodeRule(input.pincode, input.pincodeRules ?? [])?.codAllowed === false) codReason = "Cash on Delivery isn't available for this PIN code.";
  else if (shipping.selected && !shipping.selected.codAllowed) codReason = "Cash on Delivery isn't available with this shipping method.";
  const codAvailable = codReason === null && lines.length > 0;
  const codFee = input.paymentMethod === "cod" && codAvailable ? input.cod.fee : 0;

  const grandTotal = orderValue + codFee;

  return {
    lines: priced,
    subtotal,
    discountTotal,
    shippingTotal,
    codFee,
    taxTotal,
    grandTotal,
    pricesIncludeTax: inclusive,
    itemCount,
    weightGrams,
    discount: discountOutcome,
    shipping,
    cod: { available: codAvailable, reason: codAvailable ? null : codReason, fee: input.cod.fee },
    paymentMethod: input.paymentMethod ?? null,
  };
}

/** The invariant the `orders` table enforces; exported for tests and a defensive runtime check. */
export function totalsAreConsistent(r: Pick<PricingResult, "subtotal" | "discountTotal" | "shippingTotal" | "codFee" | "taxTotal" | "grandTotal" | "pricesIncludeTax" | "lines">): boolean {
  const expected = r.subtotal - r.discountTotal + r.shippingTotal + r.codFee + (r.pricesIncludeTax ? 0 : r.taxTotal);
  const linesOk =
    r.lines.reduce((a, l) => a + l.subtotal, 0) === r.subtotal &&
    r.lines.reduce((a, l) => a + l.discount, 0) === r.discountTotal &&
    r.lines.reduce((a, l) => a + l.tax, 0) === r.taxTotal &&
    r.lines.every((l) => l.total === l.unitPrice * l.quantity - l.discount && l.discount <= l.subtotal);
  return expected === r.grandTotal && r.grandTotal >= 0 && linesOk;
}
