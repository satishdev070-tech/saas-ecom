import { z } from "zod";
import { hexColor, imagePath, menuHandle, plainText } from "./primitives";

/**
 * Global design tokens, header settings and product-card settings. Every field has a default
 * so a partial/older config is completed on parse. Values are enumerations or validated hex
 * colours: the CSS emitted from them (ThemeTokensStyle) cannot contain seller-controlled text.
 */

/** Font stacks allowlist (ADR-019: no web-font downloads at build; system/self-hosted stacks only). */
export const FONT_STACKS = {
  "editorial-serif": { label: "Cormorant Garamond (editorial serif)", stack: 'var(--font-cormorant), "Iowan Old Style", Palatino, Georgia, serif' },
  "classic-serif": { label: "Fraunces (soft serif)", stack: 'var(--font-fraunces), ui-serif, Georgia, serif' },
  didone: { label: "Bodoni Moda (high contrast)", stack: 'var(--font-bodoni-ext), var(--font-bodoni), Didot, "Bodoni 72", Georgia, serif' },
  playfair: { label: "Playfair Display (display serif)", stack: 'var(--font-playfair), Georgia, serif' },
  marcellus: { label: "Marcellus (classic capitals)", stack: 'var(--font-marcellus), "Trajan Pro", Georgia, serif' },
  "modern-sans": { label: "Inter (modern sans)", stack: 'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  "geometric-sans": { label: "Jost (geometric sans)", stack: 'var(--font-jost-ext), var(--font-jost), Avenir, "Century Gothic", sans-serif' },
  "humanist-sans": { label: "Manrope (humanist sans)", stack: 'var(--font-manrope), Seravek, Ubuntu, Calibri, sans-serif' },
  grotesk: { label: "Space Grotesk (bold grotesk)", stack: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif' },
  "dm-sans": { label: "DM Sans (clean sans)", stack: 'var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif' },
  condensed: { label: "Barlow Condensed (bold display)", stack: 'var(--font-barlow-condensed), "Arial Narrow", "Roboto Condensed", sans-serif' },
  mono: { label: "Monospace", stack: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace' },
} as const;
export type FontKey = keyof typeof FONT_STACKS;
export const FONT_KEYS = Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]];

export const BUTTON_SHAPES = ["square", "rounded", "pill"] as const;
export const BUTTON_VARIANTS = ["solid", "outline"] as const;
export const CARD_RADII = ["none", "sm", "md", "lg"] as const;
export const CONTAINER_WIDTHS = ["narrow", "default", "wide", "full"] as const;
export const SPACING_SCALES = ["compact", "comfortable", "airy"] as const;

export const tokensSchema = z.object({
  colors: z
    .object({
      primary: hexColor.default("#1f1a17"),
      secondary: hexColor.default("#7a2e1f"),
      accent: hexColor.default("#b4532a"),
      background: hexColor.default("#fbf8f3"),
      text: hexColor.default("#1f1a17"),
      border: hexColor.default("#e6ded3"),
      sale: hexColor.default("#9f2a1c"),
    })
    .prefault({}),
  headingFont: z.enum(FONT_KEYS).default("editorial-serif"),
  bodyFont: z.enum(FONT_KEYS).default("modern-sans"),
  headingCase: z.enum(["normal", "uppercase"]).default("normal"),
  buttonShape: z.enum(BUTTON_SHAPES).default("square"),
  buttonVariant: z.enum(BUTTON_VARIANTS).default("solid"),
  cardRadius: z.enum(CARD_RADII).default("none"),
  containerWidth: z.enum(CONTAINER_WIDTHS).default("wide"),
  spacing: z.enum(SPACING_SCALES).default("airy"),
  /** Alignment of section titles (eyebrow, heading, subheading). */
  sectionHeadingAlign: z.enum(["left", "center"]).default("left"),
  /** "refined": opt-in polish for the editorial sections (type scale, spacing, hover states). */
  finish: z.enum(["standard", "refined"]).default("standard"),
});
export type ThemeTokens = z.infer<typeof tokensSchema>;

export const headerSettingsSchema = z.object({
  logoPath: imagePath.default(""),
  logoAlt: plainText(120).default(""),
  logoMaxWidth: z.coerce.number().int().min(60).max(320).default(160),
  menuHandle: menuHandle.default("main"),
  showSearch: z.boolean().default(true),
  showAccount: z.boolean().default(true),
  showWishlist: z.boolean().default(true),
  showCart: z.boolean().default(true),
  sticky: z.boolean().default(true),
  /** How the main menu appears on small screens. */
  mobileMenu: z.enum(["drawer", "fullscreen"]).default("drawer"),
  /** Show the store name as text when no logo is uploaded. */
  showStoreName: z.boolean().default(true),
  /** Text wordmark shown instead of the logo image (layout "logo-left-nav-center" only). Empty = logo image. */
  wordmark: plainText(40).default(""),
  /** Small spaced uppercase line under the logo (layout "logo-left-nav-center" only), e.g. "By Ayushi Paliya". */
  logoTagline: plainText(60).default(""),
  /** Fixed app-style bottom navigation on phones (Home, Search, Wishlist, Bag, Account, Orders). */
  bottomNav: z.boolean().default(false),
});
export type HeaderSettings = z.infer<typeof headerSettingsSchema>;

export const IMAGE_RATIOS = { portrait: "3 / 4", tall: "2 / 3", square: "1 / 1", landscape: "4 / 3" } as const;
export type ImageRatio = keyof typeof IMAGE_RATIOS;

export const productCardSchema = z.object({
  imageRatio: z.enum(["portrait", "tall", "square", "landscape"]).default("tall"),
  secondImageOnHover: z.boolean().default(true),
  showBadges: z.boolean().default(true),
  badgeStyle: z.enum(["minimal", "filled", "pill"]).default("minimal"),
  showComparePrice: z.boolean().default(true),
  showDiscountPercent: z.boolean().default(true),
  showQuickAdd: z.boolean().default(false),
  showWishlist: z.boolean().default(true),
  showRating: z.boolean().default(false),
  textAlign: z.enum(["left", "center"]).default("left"),
  /** Brand line above the product title (turn off for single-brand stores). */
  showBrand: z.boolean().default(true),
  /** Available sizes as small chips under the price. */
  showSizes: z.boolean().default(false),
  /** Store-wide offer label on every card, e.g. "Buy 2 Get 1". */
  offerBadge: plainText(24).default(""),
});
export type ProductCardSettings = z.infer<typeof productCardSchema>;
