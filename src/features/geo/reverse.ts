import { INDIAN_STATES } from "@/features/customer-account/address";

/**
 * "Use my location" address autofill (pure helpers, unit tested). The browser asks the shopper for
 * permission; the coordinates are sent once to /api/geo/reverse, which asks OpenStreetMap
 * Nominatim for the address. Only the locality, city, state and PIN code are filled (the house /
 * flat line always comes from the shopper). Nothing is stored.
 */

export const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

export type GeoAddress = { line2: string | null; city: string | null; state: string | null; postalCode: string | null };

export function parseCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const a = typeof lat === "string" && lat.trim() !== "" ? Number(lat) : NaN;
  const o = typeof lon === "string" && lon.trim() !== "" ? Number(lon) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(o) || a < -90 || a > 90 || o < -180 || o > 180) return null;
  // ~11 m precision is plenty for a street address and avoids sending more than needed.
  return { lat: Math.round(a * 1e4) / 1e4, lon: Math.round(o * 1e4) / 1e4 };
}

export function nominatimReverseUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon), zoom: "18", addressdetails: "1", "accept-language": "en" });
  return `${NOMINATIM_REVERSE}?${q}`;
}

const STATE_ALIASES: Record<string, string> = {
  "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  "jammu & kashmir": "Jammu and Kashmir",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
};

/** Maps a geocoder state name onto the checkout's state list; null when it isn't recognised. */
export function matchIndianState(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  const alias = STATE_ALIASES[key];
  if (alias) return alias;
  return INDIAN_STATES.find((s) => s.toLowerCase() === key) ?? null;
}

const text = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Nominatim jsonv2 `address` → form fields. India only (the checkout ships within India). */
export function mapNominatimAddress(json: unknown): { ok: true; address: GeoAddress } | { ok: false; reason: "outside_india" | "not_found" } {
  const a = (json && typeof json === "object" ? (json as { address?: unknown }).address : null) as Record<string, unknown> | null | undefined;
  if (!a || typeof a !== "object") return { ok: false, reason: "not_found" };
  if (text(a.country_code)?.toLowerCase() !== "in") return { ok: false, reason: "outside_india" };
  const pin = text(a.postcode)?.replace(/\s/g, "") ?? null;
  const locality = [text(a.road), text(a.neighbourhood) ?? text(a.suburb) ?? text(a.quarter) ?? text(a.village)].filter(Boolean);
  return {
    ok: true,
    address: {
      line2: locality.length ? [...new Set(locality)].join(", ").slice(0, 200) : null,
      city: text(a.city) ?? text(a.town) ?? text(a.municipality) ?? text(a.city_district) ?? text(a.state_district) ?? text(a.county) ?? text(a.village),
      state: matchIndianState(text(a.state)),
      postalCode: pin && /^[1-9][0-9]{5}$/.test(pin) ? pin : null,
    },
  };
}
