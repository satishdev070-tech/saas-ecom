"use client";

import { useEffect } from "react";
import { THEME_PREVIEW_ESCAPE_MESSAGE } from "@/features/theme/marketplace/live-preview";

/**
 * Live Preview only: when the demo store is framed by the dashboard's preview dialog, keyboard
 * focus sits inside this (cross-origin) frame, so Escape never reaches the dialog. Tell the parent.
 * The message carries no data; the dashboard checks it came from its own iframe.
 */
export function PreviewEscapeBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.parent.postMessage({ type: THEME_PREVIEW_ESCAPE_MESSAGE }, "*");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
