/**
 * Storefront "looks" shown in the interactive preview and the theme marketplace.
 * Aangan is the launch theme; the other looks are recipes of Aangan's own settings
 * (colours, heading font, heading case, button shape, card radius), which a seller can
 * reproduce in the theme editor without code. Font stacks mirror the theme engine's
 * allowlist (system/self-hosted stacks only, no web-font downloads; ADR-019).
 */

export const PREVIEW_FONT_STACKS = {
  "editorial-serif": '"Cormorant Garamond", "Playfair Display", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  "classic-serif": 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  didone: 'Didot, "Bodoni 72", "Bodoni MT", "Libre Bodoni", Georgia, serif',
  "modern-sans": 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "geometric-sans": 'Avenir, "Avenir Next", Montserrat, Corbel, "URW Gothic", "Century Gothic", sans-serif',
  "humanist-sans": 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
} as const;

export type PreviewFont = keyof typeof PREVIEW_FONT_STACKS;

export type LookColors = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** Text on accent-filled buttons. */
  onAccent: string;
  border: string;
  announcementBg: string;
  announcementText: string;
  sale: string;
};

export type ThemeLook = {
  key: string;
  name: string;
  /** Short positioning line for cards. */
  tagline: string;
  bestFor: string;
  /** "theme" = a shipped theme; "look" = a settings recipe on top of it. */
  kind: "theme" | "look";
  colors: LookColors;
  headingFont: PreviewFont;
  bodyFont: PreviewFont;
  headingCase: "normal" | "uppercase";
  buttonShape: "square" | "rounded" | "pill";
  cardRadius: "none" | "sm" | "md" | "lg";
};

export const THEME_LOOKS: ThemeLook[] = [
  {
    key: "aangan",
    name: "Aangan",
    tagline: "Editorial ivory and ink with madder-red accents",
    bestFor: "Ethnic wear & hand-block prints",
    kind: "theme",
    colors: {
      background: "#fbf8f3",
      surface: "#f1e9dd",
      text: "#1f1a17",
      muted: "#655a50",
      accent: "#9a3b26",
      onAccent: "#fbf8f3",
      border: "#e6ded3",
      announcementBg: "#1f1a17",
      announcementText: "#fbf8f3",
      sale: "#9f2a1c",
    },
    headingFont: "editorial-serif",
    bodyFont: "modern-sans",
    headingCase: "normal",
    buttonShape: "square",
    cardRadius: "none",
  },
  {
    key: "noor",
    name: "Noor",
    tagline: "Deep emerald, antique gold and high-contrast type",
    bestFor: "Festive, bridal & occasion wear",
    kind: "look",
    colors: {
      background: "#10231c",
      surface: "#173127",
      text: "#f4ecdc",
      muted: "#c8bea8",
      accent: "#d8ad5b",
      onAccent: "#10231c",
      border: "#2a4a3c",
      announcementBg: "#d8ad5b",
      announcementText: "#10231c",
      sale: "#f0b9a4",
    },
    headingFont: "didone",
    bodyFont: "modern-sans",
    headingCase: "normal",
    buttonShape: "pill",
    cardRadius: "sm",
  },
  {
    key: "sutra",
    name: "Sutra",
    tagline: "Monochrome, geometric and quietly confident",
    bestFor: "Minimal D2C & contemporary labels",
    kind: "look",
    colors: {
      background: "#ffffff",
      surface: "#f3f3f1",
      text: "#111111",
      muted: "#5c5c5c",
      accent: "#111111",
      onAccent: "#ffffff",
      border: "#e4e4e1",
      announcementBg: "#111111",
      announcementText: "#ffffff",
      sale: "#b3261e",
    },
    headingFont: "geometric-sans",
    bodyFont: "geometric-sans",
    headingCase: "uppercase",
    buttonShape: "square",
    cardRadius: "none",
  },
  {
    key: "mitti",
    name: "Mitti",
    tagline: "Earthy clay tones with warm, rounded details",
    bestFor: "Handloom, slow fashion & home textiles",
    kind: "look",
    colors: {
      background: "#efe6d8",
      surface: "#e4d7c3",
      text: "#3a2a1d",
      muted: "#65533f",
      accent: "#7a4520",
      onAccent: "#fdf8f0",
      border: "#d6c7b0",
      announcementBg: "#7a4520",
      announcementText: "#fdf8f0",
      sale: "#8f2d1a",
    },
    headingFont: "classic-serif",
    bodyFont: "humanist-sans",
    headingCase: "normal",
    buttonShape: "rounded",
    cardRadius: "md",
  },
  {
    key: "gulaal",
    name: "Gulaal",
    tagline: "Rani pink energy with playful, pill-shaped UI",
    bestFor: "Instagram-first & youth fashion",
    kind: "look",
    colors: {
      background: "#fff4ef",
      surface: "#ffe4d9",
      text: "#2b1320",
      muted: "#6a4654",
      accent: "#b0164f",
      onAccent: "#ffffff",
      border: "#f3cfc2",
      announcementBg: "#2b1320",
      announcementText: "#fff4ef",
      sale: "#b0164f",
    },
    headingFont: "geometric-sans",
    bodyFont: "modern-sans",
    headingCase: "normal",
    buttonShape: "pill",
    cardRadius: "lg",
  },
];

/** A deliberately generic "before" look for the before/after customisation demo. */
export const UNSTYLED_LOOK: ThemeLook = {
  key: "unstyled",
  name: "Default template",
  tagline: "A generic starter template",
  bestFor: "",
  kind: "look",
  colors: {
    background: "#ffffff",
    surface: "#eef0f3",
    text: "#1f2937",
    muted: "#4b5563",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    border: "#d1d5db",
    announcementBg: "#e5e7eb",
    announcementText: "#1f2937",
    sale: "#b91c1c",
  },
  headingFont: "modern-sans",
  bodyFont: "modern-sans",
  headingCase: "normal",
  buttonShape: "rounded",
  cardRadius: "sm",
};

export const DEFAULT_LOOK_KEY = "aangan";

export function findLook(key: string | null | undefined): ThemeLook {
  return THEME_LOOKS.find((l) => l.key === key) ?? (THEME_LOOKS[0] as ThemeLook);
}

const BUTTON_RADIUS = { square: "0px", rounded: "8px", pill: "999px" } as const;
const CARD_RADIUS = { none: "0px", sm: "4px", md: "10px", lg: "16px" } as const;

/** CSS custom properties consumed by the preview components (`--pv-*`). */
export function lookCssVariables(look: ThemeLook): Record<`--pv-${string}`, string> {
  const c = look.colors;
  return {
    "--pv-bg": c.background,
    "--pv-surface": c.surface,
    "--pv-text": c.text,
    "--pv-muted": c.muted,
    "--pv-accent": c.accent,
    "--pv-on-accent": c.onAccent,
    "--pv-border": c.border,
    "--pv-ann-bg": c.announcementBg,
    "--pv-ann-text": c.announcementText,
    "--pv-sale": c.sale,
    "--pv-heading": PREVIEW_FONT_STACKS[look.headingFont],
    "--pv-body": PREVIEW_FONT_STACKS[look.bodyFont],
    "--pv-heading-case": look.headingCase,
    "--pv-btn-radius": BUTTON_RADIUS[look.buttonShape],
    "--pv-card-radius": CARD_RADIUS[look.cardRadius],
  };
}

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new RangeError(`Expected #rrggbb, got ${hex}`);
  const int = Number.parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
