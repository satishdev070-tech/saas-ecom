import { z } from "zod";
import { indianMobile, pincode } from "@/lib/validation/common";

/** States and union territories of India (shipping address state list). */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const text = (max: number, label: string) => z.string().trim().min(1, `Enter ${label}`).max(max, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const addressSchema = z.object({
  name: text(120, "the recipient's name"),
  phone: indianMobile,
  line1: text(200, "the address"),
  line2: optionalText(200),
  landmark: optionalText(120),
  city: text(80, "the city"),
  state: z.enum(INDIAN_STATES, { message: "Choose a state" }),
  postalCode: pincode,
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Address JSON stored on orders (snake_case, country fixed to IN). */
export type OrderAddress = {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: "IN";
};

export function toOrderAddress(a: AddressInput): OrderAddress {
  return {
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? null,
    landmark: a.landmark ?? null,
    city: a.city,
    state: a.state,
    postal_code: a.postalCode,
    country: "IN",
  };
}

/** Reads the (untrusted-shape) jsonb address from an order row for display. */
export function readOrderAddress(raw: unknown): OrderAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  return {
    name: s("name") ?? "",
    phone: s("phone") ?? "",
    line1: s("line1") ?? "",
    line2: s("line2"),
    landmark: s("landmark"),
    city: s("city") ?? "",
    state: s("state") ?? "",
    postal_code: s("postal_code") ?? "",
    country: "IN",
  };
}
