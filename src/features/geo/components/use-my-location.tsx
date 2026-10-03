"use client";

import { useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { GeoAddress } from "../reverse";

type Status = { kind: "idle" | "busy" | "done" | "error"; message: string };

const ERRORS: Record<string, string> = {
  denied: "Location permission was denied. You can type the address instead.",
  unavailable: "Couldn't get your location. Please type the address.",
  outside_india: "That location is outside India. Please type the address.",
  rate_limited: "Too many lookups. Please wait a moment or type the address.",
  default: "Couldn't find an address for your location. Please type it.",
};

/** Sets an uncontrolled input/select in the same form, so React-managed defaults stay intact. */
function setField(form: HTMLFormElement, name: string, value: string, onlyIfEmpty = false) {
  const el = form.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return false;
  if (onlyIfEmpty && el.value.trim()) return false;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * "Use my current location": asks the browser for the position, looks the address up once via
 * /api/geo/reverse and fills locality, city, state and PIN code in the surrounding form. The
 * house / flat line is never guessed. `onPostalCode` lets a form that controls its PIN field
 * (checkout re-quotes shipping) take that value itself.
 */
export function UseMyLocation({ onPostalCode }: { onPostalCode?: (pin: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

  const fill = (a: GeoAddress) => {
    const form = ref.current?.form;
    if (!form) return;
    const filled: string[] = [];
    if (a.line2 && setField(form, "line2", a.line2, true)) filled.push("area");
    if (a.city && setField(form, "city", a.city)) filled.push("city");
    if (a.state && setField(form, "state", a.state)) filled.push("state");
    if (a.postalCode) {
      if (onPostalCode) onPostalCode(a.postalCode);
      else setField(form, "postalCode", a.postalCode);
      filled.push("PIN code");
    }
    setStatus(filled.length ? { kind: "done", message: `Filled ${filled.join(", ")}. Please check them and add your house / flat number.` } : { kind: "error", message: ERRORS.default! });
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus({ kind: "error", message: ERRORS.unavailable! });
    setStatus({ kind: "busy", message: "Finding your address…" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const q = new URLSearchParams({ lat: pos.coords.latitude.toFixed(5), lon: pos.coords.longitude.toFixed(5) });
          const res = await fetch(`/api/geo/reverse?${q}`, { headers: { Accept: "application/json" } });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; address?: GeoAddress; error?: string };
          if (json.ok && json.address) fill(json.address);
          else setStatus({ kind: "error", message: ERRORS[json.error ?? ""] ?? ERRORS.default! });
        } catch {
          setStatus({ kind: "error", message: ERRORS.default! });
        }
      },
      (err) => setStatus({ kind: "error", message: err.code === err.PERMISSION_DENIED ? ERRORS.denied! : ERRORS.unavailable! }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-1">
      <button ref={ref} type="button" onClick={locate} disabled={status.kind === "busy"} className="sf-link inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
        <LocateFixed aria-hidden className="size-4" />
        {status.kind === "busy" ? "Finding your address…" : "Use my current location"}
      </button>
      <p role="status" aria-live="polite" className={`text-xs ${status.kind === "error" ? "text-[var(--sf-sale)]" : "sf-muted"}`}>
        {status.kind === "done" || status.kind === "error" ? status.message : null}
        {status.kind === "done" ? (
          <>
            {" "}
            Address data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
              OpenStreetMap
            </a>{" "}
            contributors.
          </>
        ) : null}
      </p>
    </div>
  );
}
