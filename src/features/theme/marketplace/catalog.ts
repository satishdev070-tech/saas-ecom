import presets from "./presets.json";
import type { MarketplaceTheme, ThemePreset } from "./types";
import { ELECTRONICS_THEMES } from "./themes/electronics";
import { BEAUTY_THEMES } from "./themes/beauty";
import { FURNITURE_THEMES } from "./themes/furniture";
import { GROCERY_THEMES } from "./themes/grocery";
import { FASHION_THEMES } from "./themes/fashion";
import { JEWELLERY_THEMES } from "./themes/jewellery";
import { FOOTWEAR_THEMES } from "./themes/footwear";
import { HEALTH_THEMES } from "./themes/health";
import { SPORTS_THEMES } from "./themes/sports";
import { KIDS_THEMES } from "./themes/kids";
import { BOOKS_THEMES } from "./themes/books";
import { PETS_THEMES } from "./themes/pets";
import { AUTOMOTIVE_THEMES } from "./themes/automotive";
import { SMART_HOME_THEMES } from "./themes/smart-home";
import { BAGS_THEMES } from "./themes/bags";
import { WATCHES_THEMES } from "./themes/watches";
import { ORGANIC_THEMES } from "./themes/organic";
import { GOURMET_THEMES } from "./themes/gourmet";
import { GENERAL_THEMES } from "./themes/general";

export type { HomeItem, MarketplaceTheme, ThemePreset, ThemeStyle } from "./types";

/**
 * Theme marketplace catalogue. Each theme is a preset (design tokens, header, product card, page
 * composition with per-section style settings) for one industry. Presets carry NO content:
 * applying one keeps the store's own text, images and product picks. Industry theme sets live
 * in ./themes/<industry>.ts; the original ethnic-fashion themes are below.
 */

const P = presets as unknown as Record<string, ThemePreset>;

const ORIGINAL_THEMES: MarketplaceTheme[] = [
  {
    key: "heritage-kashmir", name: "Heritage Kashmir", tagline: "Slow, story-led and warm", industry: "fashion", style: "heritage", demo: "chinar", version: "1.0.0", added: "2026-09-26",
    description: "Full-bleed hero, a maker story with stats and an editorial craft section. Serif headings, generous spacing and centred tall product cards for shawls and heirloom pieces.",
    bestFor: ["Shawls & pashmina", "Handloom", "Heritage brands"], features: ["Full-screen hero", "Brand story with stats", "Editorial image + text", "Testimonials"], preset: P.chinar!,
  },
  {
    key: "jaipur-craft", name: "Jaipur Craft", tagline: "Block prints, colour and pattern", industry: "fashion", style: "heritage", demo: "pinkcity", version: "1.0.0", added: "2026-09-26",
    description: "Pattern-forward layout for printed cottons with category tiles up front and a busy, cheerful grid.",
    bestFor: ["Block print", "Cotton kurtas", "Home & lifestyle"], features: ["Category tiles", "Collection spotlight", "Promo tiles"], preset: P.pinkcity!,
  },
  {
    key: "contemporary-ethnic", name: "Contemporary Ethnic", tagline: "Bright, modern Indian", industry: "fashion", style: "modern", demo: "gulaabrang", version: "1.0.0", added: "2026-09-26",
    description: "Pink-and-marigold palette, carousel product rails and bold section headings for a young ethnic-wear label.",
    bestFor: ["Kurta sets", "Festive capsules", "Young ethnic labels"], features: ["Product carousels", "Countdown-ready promos", "Instagram strip"], preset: P.gulaabrang!,
  },
  {
    key: "earth-artisan", name: "Earth & Artisan", tagline: "Natural, textured, handmade", industry: "handicrafts", style: "heritage", demo: "mitti", version: "1.0.0", added: "2026-09-26",
    description: "Earthy neutrals, inline navigation and a calm layout that lets natural fabrics and dyes carry the page.",
    bestFor: ["Natural dyes", "Khadi & organic", "Sustainable brands"], features: ["Inline menu", "Muted tones", "Story blocks"], preset: P.mitti!,
  },
  {
    key: "color-pop", name: "Color Pop", tagline: "Loud, playful, high-energy", industry: "fashion", style: "bold", demo: "rangeela", version: "1.0.0", added: "2026-09-26",
    description: "Saturated colours, uppercase display type and tight spacing for fast-moving catalogues and sales.",
    bestFor: ["Fusion wear", "Sale-led stores", "Gen Z audiences"], features: ["Accent announcement bar", "Dense product grids", "Quick add"], preset: P.rangeela!,
  },
  {
    key: "contemporary-feminine", name: "Contemporary Feminine", tagline: "Soft, graceful, celebratory", industry: "fashion", style: "modern", demo: "noor", version: "1.0.0", added: "2026-09-26",
    description: "Soft palette, centred logo and rounded details for kurta sets, suits and celebration wear.",
    bestFor: ["Suits & kurta sets", "Occasion capsules", "Womenswear"], features: ["Centred header", "Shop-by-occasion tiles", "Reviews"], preset: P.noor!,
  },
  {
    key: "occasion-luxury", name: "Occasion Luxury", tagline: "Bridal drama, dark and gilded", industry: "fashion", style: "luxury", demo: "vivaah", version: "1.0.0", added: "2026-09-26",
    description: "Dark, gilded palette with large imagery and lookbook sections for bridal and occasion couture.",
    bestFor: ["Bridal", "Lehengas", "Couture"], features: ["Lookbook", "Large hero", "Appointment-friendly CTAs"], preset: P.vivaah!,
  },
  {
    key: "minimal-d2c", name: "Minimal D2C", tagline: "Quiet, fast, product-first", industry: "fashion", style: "minimal", demo: "studioneel", version: "1.0.0", added: "2026-09-26",
    description: "White space, a single accent and inline navigation. Built for small catalogues of considered basics.",
    bestFor: ["Basics", "Menswear & unisex", "D2C labels"], features: ["Inline menu", "Clean product grid", "Light footer"], preset: P.studioneel!,
  },
  {
    key: "social-fashion", name: "Social Fashion", tagline: "Drops, hype and UGC", industry: "fashion", style: "bold", demo: "desidrip", version: "1.0.0", added: "2026-09-26",
    description: "Dark streetwear look with drop collections, social proof and a price-point rail.",
    bestFor: ["Streetwear", "Weekly drops", "Instagram-first brands"], features: ["Social proof strip", "Drop collections", "Uppercase type"], preset: P.desidrip!,
  },
  {
    key: "luxury-indian", name: "Luxury Indian", tagline: "Understated luxury craft", industry: "fashion", style: "luxury", demo: "anaya", version: "1.0.0", added: "2026-09-26",
    description: "Ivory ground, refined serif type and slow editorial pacing for high-value handwoven pieces.",
    bestFor: ["Handwoven sarees", "Luxury ensembles", "Ateliers"], features: ["Editorial pacing", "Centred logo", "Minimal badges"], preset: P.anaya!,
  },
  {
    key: "jaipur-boutique", name: "Jaipur Boutique", tagline: "Clean, fast, offer-led ethnic wear", industry: "fashion", style: "conversion", demo: "kaya-studio", version: "1.0.0", added: "2026-09-26",
    description: "A bright, conversion-focused layout for large ethnic-wear catalogues: rotating offer bar, drawer menu with a centred logo, slideshow, round category stories, shoppable videos, carousels with size chips and green discount pills, a big scrolling brand strip and a scrolling trust strip on every page.",
    bestFor: ["Kurta sets & co-ords", "Offer-led D2C", "Large catalogues"],
    features: ["Rotating announcement bar", "Drawer menu", "Shoppable videos", "Size chips on cards", "Scrolling brand & trust strips", "Centred uppercase titles"],
    preset: P.jaipurboutique!,
  },
];

export const MARKETPLACE_THEMES: readonly MarketplaceTheme[] = [...FASHION_THEMES, ...ORIGINAL_THEMES, ...ELECTRONICS_THEMES, ...BEAUTY_THEMES, ...FURNITURE_THEMES, ...GROCERY_THEMES, ...JEWELLERY_THEMES, ...FOOTWEAR_THEMES, ...HEALTH_THEMES, ...SPORTS_THEMES, ...KIDS_THEMES, ...BOOKS_THEMES, ...PETS_THEMES, ...AUTOMOTIVE_THEMES, ...SMART_HOME_THEMES, ...BAGS_THEMES, ...WATCHES_THEMES, ...ORGANIC_THEMES, ...GOURMET_THEMES, ...GENERAL_THEMES];

export function findMarketplaceTheme(key: string): MarketplaceTheme | null {
  return MARKETPLACE_THEMES.find((t) => t.key === key) ?? null;
}
