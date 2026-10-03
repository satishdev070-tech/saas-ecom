/**
 * Platform appearance (light / dark / system). Light is the default. The preference lives in
 * localStorage per origin, so storefront hosts (their own origins) are never affected.
 */
export const APPEARANCE_KEY = "paliya-appearance";
export const APPEARANCES = ["light", "dark", "system"] as const;
export type Appearance = (typeof APPEARANCES)[number];

/** Runs before first paint (inline in <head>): applies a saved dark preference without a flash. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${APPEARANCE_KEY}");var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.setAttribute("data-theme","dark")}catch(e){}})();`;
