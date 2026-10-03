"use client";

import { useEffect } from "react";
import { track, trackOnce } from "../client";
import type { EcommerceEvent, EventParams } from "../items";

/** Fires one analytics event when mounted (server pages pass the payload). `onceKey` dedupes per session. */
export function TrackEvent({ name, params, onceKey }: { name: EcommerceEvent; params?: EventParams; onceKey?: string }) {
  const json = JSON.stringify(params ?? {});
  useEffect(() => {
    const p = JSON.parse(json) as EventParams;
    // Let the tag bootstrap (afterInteractive) define window.__pl first.
    const t = window.setTimeout(() => (onceKey ? trackOnce(onceKey, name, p) : track(name, p)), 50);
    return () => window.clearTimeout(t);
  }, [name, json, onceKey]);
  return null;
}
