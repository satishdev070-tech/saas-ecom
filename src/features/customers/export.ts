import { toMinor } from "@/lib/money";
import type { CsvValue } from "@/features/analytics/csv";

/**
 * Customer CSV export (pure).
 *
 * Consent (DPDP Act 2023 / marketing hygiene):
 *   - "all"       : operational export for servicing orders. Includes contact details plus
 *                   explicit "Accepts marketing" + consent timestamp columns so the file
 *                   can't be mistaken for a marketing list.
 *   - "marketing" : ONLY customers who opted in and are not blocked. Contact columns are
 *                   present only for these rows by construction.
 * Staff notes are never exported.
 */

export type CustomerExportRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  accepts_marketing: boolean;
  marketing_consent_at: string | null;
  status: string;
  tags: string[];
  orders_count: number;
  total_spent: number | string;
  last_order_at: string | null;
  created_at: string;
};

export const CUSTOMER_EXPORT_MODES = ["all", "marketing"] as const;
export type CustomerExportMode = (typeof CUSTOMER_EXPORT_MODES)[number];

export const CUSTOMER_CSV_HEADER = {
  all: ["First name", "Last name", "Email", "Phone", "Accepts marketing", "Marketing consent at", "Status", "Tags", "Orders", "Total spent", "Last order at", "Customer since"],
  marketing: ["First name", "Last name", "Email", "Phone", "Marketing consent at", "Tags"],
} as const satisfies Record<CustomerExportMode, readonly string[]>;

export function canMarketTo(c: Pick<CustomerExportRow, "accepts_marketing" | "status">): boolean {
  return c.accepts_marketing && c.status === "active";
}

export function customerCsvRows(customers: CustomerExportRow[], mode: CustomerExportMode): CsvValue[][] {
  if (mode === "marketing") {
    return customers.filter(canMarketTo).map((c) => [c.first_name, c.last_name, c.email, c.phone, c.marketing_consent_at, c.tags.join("; ")]);
  }
  return customers.map((c) => [
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.accepts_marketing ? "yes" : "no",
    c.marketing_consent_at,
    c.status,
    c.tags.join("; "),
    c.orders_count,
    toMinor(c.total_spent) / 100,
    c.last_order_at,
    c.created_at,
  ]);
}

export function customerDisplayName(c: { first_name: string | null; last_name: string | null; email?: string | null; phone?: string | null }): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.email || c.phone || "Guest";
}
