import localFont from "next/font/local";

/**
 * Platform fonts, self-hosted from @fontsource packages (ADR-019: no build-time font downloads).
 * Inter for application UI, Fraunces for brand/marketing display type. Exposed as CSS variables
 * consumed by globals.css (--font-sans / --font-display).
 */
export const inter = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", style: "normal", weight: "100 900" },
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-inter",
  display: "swap",
  // Not preloaded: the root layout is shared with every storefront, and a preload here made each
  // store download ~97 KB of Inter that its theme never uses. The variable stays on <html> (the
  // "modern-sans" theme stack and the platform UI use it), so pages that render Inter still load it.
  preload: false,
});

export const fraunces = localFont({
  src: [{ path: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});
