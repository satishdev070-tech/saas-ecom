import localFont from "next/font/local";

/**
 * Storefront theme fonts, self-hosted from @fontsource (ADR-019). Declared once as CSS variables;
 * browsers only download a font when a theme actually uses it (preload off). Mapped to theme
 * font keys in features/theme/schema/tokens.ts (FONT_STACKS).
 */
export const cormorant = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2", weight: "300 700" }, { path: "../../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-italic.woff2", weight: "300 700", style: "italic" }], variable: "--font-cormorant", display: "swap", preload: false });
export const playfair = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2", weight: "400 900" }, { path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2", weight: "400 900", style: "italic" }], variable: "--font-playfair", display: "swap", preload: false });
export const bodoni = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-wght-normal.woff2", weight: "400 900" }, { path: "../../node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-wght-italic.woff2", weight: "400 900", style: "italic" }], variable: "--font-bodoni", display: "swap", preload: false });
export const marcellus = localFont({ src: [{ path: "../../node_modules/@fontsource/marcellus/files/marcellus-latin-400-normal.woff2", weight: "400" }], variable: "--font-marcellus", display: "swap", preload: false });
export const manrope = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2", weight: "200 800" }], variable: "--font-manrope", display: "swap", preload: false });
export const jost = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/jost/files/jost-latin-wght-normal.woff2", weight: "100 900" }, { path: "../../node_modules/@fontsource-variable/jost/files/jost-latin-wght-italic.woff2", weight: "100 900", style: "italic" }], variable: "--font-jost", display: "swap", preload: false });
export const spaceGrotesk = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2", weight: "300 700" }], variable: "--font-space-grotesk", display: "swap", preload: false });
export const dmSans = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2", weight: "100 1000" }, { path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-italic.woff2", weight: "100 1000", style: "italic" }], variable: "--font-dm-sans", display: "swap", preload: false });
export const barlowCondensed = localFont({ src: [{ path: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2", weight: "600" }, { path: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2", weight: "700" }], variable: "--font-barlow-condensed", display: "swap", preload: false });

// Latin Extended companions (ā, ī, ś… in names like "Nayā Paramparā"). They contain only the
// extended glyphs and are listed FIRST in the theme stacks (without a generated fallback), so the
// browser takes ā from them and every basic Latin glyph from the main family. (No unicode-range:
// these files also carry space, "A" and nbsp, which pages render from them today; a range that
// excluded those would change text metrics, and one that included them would load them anyway.)
export const bodoniExt = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-ext-wght-normal.woff2", weight: "400 900" }], variable: "--font-bodoni-ext", display: "swap", preload: false, adjustFontFallback: false });
export const jostExt = localFont({ src: [{ path: "../../node_modules/@fontsource-variable/jost/files/jost-latin-ext-wght-normal.woff2", weight: "100 900" }], variable: "--font-jost-ext", display: "swap", preload: false, adjustFontFallback: false });

export const storefrontFontVariables = [cormorant, playfair, bodoni, bodoniExt, marcellus, manrope, jost, jostExt, spaceGrotesk, dmSans, barlowCondensed].map((f) => f.variable).join(" ");
