import { z } from "zod";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/features/storefront/constants";
import { hexColor, imagePath, menuHandle, plainText, safeHref, socialUrl, uuidOrEmpty, videoUrl } from "../schema/primitives";
import type { EditorField, SectionDefinition, SectionType } from "./types";

/**
 * The section registry (definitions half). One entry per section type: label, allowed groups,
 * zod settings schema (every field defaulted, unknown keys stripped) and editor field metadata.
 * The storefront renderers are registered separately in ./renderers.tsx under the same keys.
 */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const txt = (max: number, def = "") => plainText(max).default(def);
const opts = <T extends string>(values: readonly T[], labels?: Partial<Record<T, string>>) =>
  values.map((v) => ({ value: v, label: labels?.[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/[_-]/g, " ") }));

// -----------------------------------------------------------------------------
// Shared setting groups
// -----------------------------------------------------------------------------
const TONES = ["light", "dark", "accent", "muted"] as const;

/** Heading looks: the theme heading font, a bold condensed display face, or italic. */
export const HEADING_STYLES = ["default", "condensed", "italic"] as const;
const headingFields = {
  eyebrow: txt(60),
  heading: txt(120),
  subheading: txt(300),
  /** Words after the heading in the accent colour and italics ("Woven to be *remembered.*"). Empty = none. */
  headingAccent: txt(60),
  headingStyle: z.enum(HEADING_STYLES).default("default"),
  /** Short note on the right of the heading row (desktop), e.g. "Every colour tells a story". */
  headingNote: txt(120),
};
const headingEditor: EditorField[] = [
  { kind: "text", key: "eyebrow", label: "Eyebrow", maxLength: 60, placeholder: "Small text above the heading" },
  { kind: "text", key: "heading", label: "Heading", maxLength: 120 },
  { kind: "text", key: "headingAccent", label: "Heading accent (italic, accent colour)", maxLength: 60, placeholder: "remembered." },
  { kind: "select", key: "headingStyle", label: "Heading style", options: [{ value: "default", label: "Theme heading font" }, { value: "condensed", label: "Bold condensed capitals" }, { value: "italic", label: "Italic" }] },
  { kind: "text", key: "subheading", label: "Subheading", maxLength: 300, multiline: true },
  { kind: "text", key: "headingNote", label: "Note beside the heading (optional)", maxLength: 120 },
];

export const PRODUCT_SOURCES = ["collection", "category", "products", "rules", "newest", "bestselling", "featured", "sale"] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];
const SOURCE_LABELS: Record<ProductSource, string> = {
  collection: "A collection",
  category: "A category",
  products: "Hand-picked products",
  rules: "Rules (tags, type, price)",
  newest: "Newest products",
  bestselling: "Best sellers",
  featured: "Featured products",
  sale: "Products on sale",
};

const productSourceFields = {
  source: z.enum(PRODUCT_SOURCES).default("newest"),
  collectionId: uuidOrEmpty.default(""),
  categoryId: uuidOrEmpty.default(""),
  productIds: z.array(uuid).max(24).default([]),
  ruleTags: z.array(plainText(40).pipe(z.string().min(1))).max(10).default([]),
  ruleProductTypes: z.array(z.enum(PRODUCT_TYPES)).max(PRODUCT_TYPES.length).default([]),
  ruleMaxPrice: z.coerce.number().int().min(0).max(1_000_000).default(0),
  ruleOnSale: z.boolean().default(false),
  limit: z.coerce.number().int().min(2).max(24).default(8),
  viewAllHref: safeHref.default(""),
};
function productSourceEditor(defaultLimitMax = 24): EditorField[] {
  return [
    { kind: "select", key: "source", label: "Products from", options: PRODUCT_SOURCES.map((v) => ({ value: v, label: SOURCE_LABELS[v] })) },
    { kind: "picker", key: "collectionId", label: "Collection", picker: "collection", showIf: { key: "source", equals: ["collection"] } },
    { kind: "picker", key: "categoryId", label: "Category", picker: "category", showIf: { key: "source", equals: ["category"] } },
    { kind: "multiPicker", key: "productIds", label: "Products", picker: "product", max: 24, showIf: { key: "source", equals: ["products"] } },
    { kind: "tags", key: "ruleTags", label: "Has any of these tags", max: 10, showIf: { key: "source", equals: ["rules"] } },
    {
      kind: "tags",
      key: "ruleProductTypes",
      label: "Product types",
      max: PRODUCT_TYPES.length,
      placeholder: PRODUCT_TYPES.join(", "),
      showIf: { key: "source", equals: ["rules"] },
      help: `Allowed: ${PRODUCT_TYPES.map((t) => PRODUCT_TYPE_LABELS[t]).join(", ")}`,
    },
    { kind: "number", key: "ruleMaxPrice", label: "Maximum price (₹, 0 = any)", min: 0, max: 1_000_000, step: 100, showIf: { key: "source", equals: ["rules"] } },
    { kind: "toggle", key: "ruleOnSale", label: "Only products on sale", showIf: { key: "source", equals: ["rules"] } },
    { kind: "number", key: "limit", label: "Number of products", min: 2, max: defaultLimitMax },
    { kind: "link", key: "viewAllHref", label: "“View all” link", placeholder: "/collections/new-arrivals" },
  ];
}

const ctaFields = { ctaLabel: txt(40), ctaHref: safeHref.default("") };
const ctaEditor: EditorField[] = [
  { kind: "text", key: "ctaLabel", label: "Button label", maxLength: 40 },
  { kind: "link", key: "ctaHref", label: "Button link", placeholder: "/collections/festive-edit" },
];

// -----------------------------------------------------------------------------
// Definitions
// -----------------------------------------------------------------------------
const announcementBar = {
  type: "AnnouncementBar",
  label: "Announcement bar",
  description: "Short messages above the header (offers, shipping, COD).",
  groups: ["header", "home"],
  schema: z.object({
    messages: z
      .array(z.object({ text: plainText(120).pipe(z.string().min(1, "Required")), href: safeHref.default("") }))
      .min(1)
      .max(5)
      .default([{ text: "Free shipping on orders above ₹1,499", href: "" }]),
    tone: z.enum(TONES).default("dark"),
    mode: z.enum(["static", "rotate"]).default("static"),
  }),
  fields: [
    {
      kind: "list",
      key: "messages",
      label: "Messages",
      itemLabel: "Message",
      min: 1,
      max: 5,
      fields: [
        { kind: "text", key: "text", label: "Text", maxLength: 120 },
        { kind: "link", key: "href", label: "Link (optional)" },
      ],
    },
    { kind: "select", key: "tone", label: "Colour", options: opts(TONES) },
    { kind: "select", key: "mode", label: "Display", options: [{ value: "static", label: "All messages in a row" }, { value: "rotate", label: "One at a time, with arrows" }] },
  ],
} satisfies SectionDefinition;

const header = {
  type: "Header",
  label: "Header",
  description: "Logo, navigation, search, account, wishlist and bag. Uses the global header settings.",
  groups: ["header"],
  singleton: true,
  schema: z.object({
    layout: z.enum(["logo-left", "logo-center", "logo-left-nav-center"]).default("logo-center"),
    showInlineMenu: z.boolean().default(false),
    menuStyle: z.enum(["bar", "drawer"]).default("bar"),
  }),
  fields: [
    { kind: "select", key: "layout", label: "Layout", options: opts(["logo-left", "logo-center", "logo-left-nav-center"] as const, { "logo-left": "Logo left", "logo-center": "Logo centred", "logo-left-nav-center": "Large logo left, menu centred (dropdown mega menu)" }) },
    { kind: "toggle", key: "showInlineMenu", label: "Show menu inside the header (desktop)", help: "Turn off when using a Mega menu section below the header." },
    { kind: "select", key: "menuStyle", label: "Desktop menu", options: [{ value: "bar", label: "Menu bar / mega menu" }, { value: "drawer", label: "Menu button (drawer) on every screen" }], help: "Drawer: a menu icon opens the full menu on desktop too, and the Mega menu section is hidden." },
  ],
} satisfies SectionDefinition;

const megaMenu = {
  type: "MegaMenu",
  label: "Mega menu",
  description: "Full-width desktop navigation with dropdown panels built from a menu.",
  groups: ["header"],
  singleton: true,
  schema: z.object({ menuHandle: menuHandle.default("main"), showImages: z.boolean().default(true), uppercase: z.boolean().default(true) }),
  fields: [
    { kind: "picker", key: "menuHandle", label: "Menu", picker: "menu" },
    { kind: "toggle", key: "showImages", label: "Show menu item images in dropdowns" },
    { kind: "toggle", key: "uppercase", label: "Uppercase labels" },
  ],
} satisfies SectionDefinition;

const heroSlide = z.object({
  imagePath: imagePath.default(""),
  mobileImagePath: imagePath.default(""),
  alt: txt(200),
  eyebrow: txt(60),
  heading: txt(120),
  /** Second heading line in italics (e.g. "a saree."). */
  headingAccent: txt(80),
  subheading: txt(240),
  ...ctaFields,
  align: z.enum(["left", "center", "right"]).default("left"),
  textTone: z.enum(["light", "dark"]).default("light"),
});
const hero = {
  type: "Hero",
  label: "Hero / slideshow",
  description: "Large editorial images with headline and call to action. Several slides become a swipeable carousel.",
  groups: ["home", "collection"],
  schema: z.object({
    slides: z.array(heroSlide).min(1).max(5).default([heroSlide.parse({ heading: "The festive edit", subheading: "Hand block printed in Jaipur", ctaLabel: "Shop now", ctaHref: "/collections" })]),
    height: z.enum(["medium", "large", "full", "banner"]).default("large"),
    overlay: z.coerce.number().int().min(0).max(80).default(25),
    /** Seconds per slide; 0 turns autoplay off. */
    autoplay: z.coerce.number().int().min(0).max(15).default(6),
    /** Numbered slide counter ("01 02 03") instead of dots, with optional corner captions. */
    counter: z.boolean().default(false),
    footnote: txt(60),
    scrollLabel: txt(40),
  }),
  fields: [
    {
      kind: "list",
      key: "slides",
      label: "Slides",
      itemLabel: "Slide",
      min: 1,
      max: 5,
      fields: [
        { kind: "image", key: "imagePath", label: "Image (desktop)" },
        { kind: "image", key: "mobileImagePath", label: "Image (mobile, optional)" },
        { kind: "text", key: "alt", label: "Image description (alt text)", maxLength: 200 },
        { kind: "text", key: "eyebrow", label: "Eyebrow", maxLength: 60 },
        { kind: "text", key: "heading", label: "Heading", maxLength: 120 },
        { kind: "text", key: "headingAccent", label: "Second line (italic, optional)", maxLength: 80 },
        { kind: "text", key: "subheading", label: "Subheading", maxLength: 240, multiline: true },
        ...ctaEditor,
        { kind: "select", key: "align", label: "Text position", options: opts(["left", "center", "right"] as const) },
        { kind: "select", key: "textTone", label: "Text colour", options: opts(["light", "dark"] as const) },
      ],
    },
    { kind: "select", key: "height", label: "Height", options: opts(["medium", "large", "full", "banner"] as const, { full: "Full screen", banner: "Banner image (2:1, never cropped)" }) },
    { kind: "number", key: "overlay", label: "Image darkening (%)", min: 0, max: 80, step: 5 },
    { kind: "number", key: "autoplay", label: "Autoplay (seconds per slide, 0 = off)", min: 0, max: 15 },
    { kind: "toggle", key: "counter", label: "Numbered slide counter (01 02 03)" },
    { kind: "text", key: "footnote", label: "Bottom-left caption", maxLength: 60, showIf: { key: "counter", equals: [true] } },
    { kind: "text", key: "scrollLabel", label: "Bottom-right caption (e.g. Scroll to discover)", maxLength: 40, showIf: { key: "counter", equals: [true] } },
  ],
} satisfies SectionDefinition;

const promoTile = z.object({ imagePath: imagePath.default(""), alt: txt(200), heading: txt(80), text: txt(160), ...ctaFields });
const promoBanner = {
  type: "PromoBanner",
  label: "Promo banner",
  description: "One to three image tiles promoting a collection or offer.",
  groups: ["header", "home", "collection", "product"],
  schema: z.object({
    tiles: z.array(promoTile).min(1).max(3).default([promoTile.parse({ heading: "Everyday cottons", ctaLabel: "Explore", ctaHref: "/collections" })]),
    aspect: z.enum(["wide", "square", "portrait", "banner"]).default("wide"),
  }),
  fields: [
    {
      kind: "list",
      key: "tiles",
      label: "Tiles",
      itemLabel: "Tile",
      min: 1,
      max: 3,
      fields: [
        { kind: "image", key: "imagePath", label: "Image" },
        { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
        { kind: "text", key: "heading", label: "Heading", maxLength: 80 },
        { kind: "text", key: "text", label: "Text", maxLength: 160 },
        ...ctaEditor,
      ],
    },
    { kind: "select", key: "aspect", label: "Tile shape", options: opts(["wide", "square", "portrait", "banner"] as const, { banner: "Banner (2:1)" }) },
  ],
} satisfies SectionDefinition;

const gridItem = z.object({ id: uuidOrEmpty.default(""), imagePath: imagePath.default(""), label: txt(60), subtitle: txt(80) });
const categoryGrid = {
  type: "CategoryGrid",
  label: "Category tiles",
  description: "Image tiles linking to categories. Automatic mode shows your top-level categories.",
  groups: ["home", "collection"],
  schema: z.object({
    ...headingFields,
    mode: z.enum(["auto", "manual"]).default("auto"),
    items: z.array(gridItem).max(12).default([]),
    limit: z.coerce.number().int().min(2).max(12).default(6),
    shape: z.enum(["portrait", "square", "circle", "arch"]).default("portrait"),
  }),
  fields: [
    ...headingEditor,
    { kind: "select", key: "mode", label: "Categories", options: [{ value: "auto", label: "Top-level categories" }, { value: "manual", label: "Choose categories" }] },
    {
      kind: "list",
      key: "items",
      label: "Tiles",
      itemLabel: "Tile",
      max: 12,
      showIf: { key: "mode", equals: ["manual"] },
      fields: [
        { kind: "picker", key: "id", label: "Category", picker: "category" },
        { kind: "image", key: "imagePath", label: "Image override (optional)" },
        { kind: "text", key: "label", label: "Label override (optional)", maxLength: 60 },
      ],
    },
    { kind: "number", key: "limit", label: "Maximum tiles", min: 2, max: 12 },
    { kind: "select", key: "shape", label: "Tile shape", options: opts(["portrait", "square", "circle", "arch"] as const, { arch: "Arch (rounded top)" }) },
  ],
} satisfies SectionDefinition;

const collectionGrid = {
  type: "CollectionGrid",
  label: "Collection / occasion grid",
  description: "Image tiles linking to collections, e.g. shop by occasion.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    mode: z.enum(["auto", "manual"]).default("auto"),
    items: z.array(gridItem).max(12).default([]),
    limit: z.coerce.number().int().min(2).max(12).default(4),
    columns: z.coerce.number().int().min(2).max(4).default(4),
    /** overlay: serif title and a small caps subtitle over the image. */
    variant: z.enum(["default", "overlay"]).default("default"),
  }),
  fields: [
    ...headingEditor,
    { kind: "select", key: "mode", label: "Collections", options: [{ value: "auto", label: "All collections (by position)" }, { value: "manual", label: "Choose collections" }] },
    {
      kind: "list",
      key: "items",
      label: "Tiles",
      itemLabel: "Tile",
      max: 12,
      showIf: { key: "mode", equals: ["manual"] },
      fields: [
        { kind: "picker", key: "id", label: "Collection", picker: "collection" },
        { kind: "image", key: "imagePath", label: "Image override (optional)" },
        { kind: "text", key: "label", label: "Label override (optional)", maxLength: 60 },
        { kind: "text", key: "subtitle", label: "Subtitle (overlay style)", maxLength: 80 },
      ],
    },
    { kind: "number", key: "limit", label: "Maximum tiles", min: 2, max: 12 },
    { kind: "number", key: "columns", label: "Columns (desktop)", min: 2, max: 4 },
    { kind: "select", key: "variant", label: "Caption style", options: [{ value: "default", label: "Title on a gradient" }, { value: "overlay", label: "Title and subtitle overlay" }] },
  ],
} satisfies SectionDefinition;

const productCarousel = {
  type: "ProductCarousel",
  label: "Product carousel",
  description: "A swipeable row of products from a collection, category, rules or a hand-picked list.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    ...productSourceFields,
    /** tilt: image cards at alternating angles with the title on the image, arrows below. */
    variant: z.enum(["cards", "tilt"]).default("cards"),
    dragLabel: txt(40, "Drag to explore"),
    /** tilt only: continuous slow auto-scroll (pauses on hover/focus/touch; off for reduced motion). */
    autoScroll: z.boolean().default(false),
  }),
  fields: [
    ...headingEditor,
    ...productSourceEditor(),
    { kind: "select", key: "variant", label: "Style", options: [{ value: "cards", label: "Product cards" }, { value: "tilt", label: "Tilted image cards" }] },
    { kind: "text", key: "dragLabel", label: "Label between the arrows", maxLength: 40, showIf: { key: "variant", equals: ["tilt"] } },
    { kind: "toggle", key: "autoScroll", label: "Scroll continuously", help: "Pauses on hover, focus and touch. Off for visitors who prefer reduced motion.", showIf: { key: "variant", equals: ["tilt"] } },
  ],
} satisfies SectionDefinition;

const productGrid = {
  type: "ProductGrid",
  label: "Product grid",
  description: "A grid of products, e.g. a featured collection.",
  groups: ["home", "collection", "product"],
  schema: z.object({ ...headingFields, ...productSourceFields, columns: z.coerce.number().int().min(2).max(6).default(4) }),
  fields: [...headingEditor, ...productSourceEditor(), { kind: "number", key: "columns", label: "Columns (desktop)", min: 2, max: 6 }],
} satisfies SectionDefinition;

const presetProducts = (type: SectionType, label: string, description: string, heading: string, layout: "carousel" | "grid") =>
  ({
    type,
    label,
    description,
    groups: ["home", "collection", "product"],
    schema: z.object({
      ...headingFields,
      heading: txt(120, heading),
      limit: z.coerce.number().int().min(2).max(24).default(8),
      layout: z.enum(["carousel", "grid"]).default(layout),
      viewAllHref: safeHref.default(""),
    }),
    fields: [
      ...headingEditor,
      { kind: "number", key: "limit", label: "Number of products", min: 2, max: 24 },
      { kind: "select", key: "layout", label: "Layout", options: opts(["carousel", "grid"] as const) },
      { kind: "link", key: "viewAllHref", label: "“View all” link" },
    ],
  }) satisfies SectionDefinition;

const bestseller = presetProducts("Bestseller", "Bestsellers", "Your best-selling products, updated automatically.", "Bestsellers", "grid");
const newArrivals = presetProducts("NewArrivals", "New arrivals", "The newest published products, updated automatically.", "New arrivals", "carousel");

const saleBanner = {
  type: "SaleBanner",
  label: "Sale banner",
  description: "A bold band announcing a sale, with an optional coupon code.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "The Summer Sale"),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .max(30)
      .regex(/^[A-Z0-9_-]*$/, "Letters, numbers, - and _ only")
      .default(""),
    endsText: txt(80),
    ...ctaFields,
    background: hexColor.default("#7a2e1f"),
    textColor: hexColor.default("#fbf8f3"),
  }),
  fields: [
    ...headingEditor,
    { kind: "text", key: "code", label: "Coupon code (optional)", maxLength: 30 },
    { kind: "text", key: "endsText", label: "Ends text (e.g. “Ends Sunday midnight”)", maxLength: 80 },
    ...ctaEditor,
    { kind: "color", key: "background", label: "Background" },
    { kind: "color", key: "textColor", label: "Text colour" },
  ],
} satisfies SectionDefinition;

const editorial = {
  type: "EditorialImageText",
  label: "Editorial image + text",
  description: "Large image beside a story. Can pull its text from a page or blog post.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    source: z.enum(["manual", "page", "blog"]).default("manual"),
    pageId: uuidOrEmpty.default(""),
    blogPostId: uuidOrEmpty.default(""),
    imagePath: imagePath.default(""),
    alt: txt(200),
    ...headingFields,
    body: txt(1200),
    ...ctaFields,
    imagePosition: z.enum(["left", "right"]).default("left"),
    tone: z.enum(TONES).default("light"),
    /** split: image beside text. fullbleed: text over a full-width image with a thumbnail strip. journal: condensed title, image, style note. */
    variant: z.enum(["split", "fullbleed", "journal"]).default("split"),
    thumbs: z.array(z.object({ imagePath: imagePath.default(""), alt: txt(200), href: safeHref.default("") })).max(8).default([]),
    showLogo: z.boolean().default(false),
    noteEyebrow: txt(60),
    noteHeading: txt(120),
  }),
  fields: [
    { kind: "select", key: "source", label: "Content", options: [{ value: "manual", label: "Write it here" }, { value: "page", label: "From a page" }, { value: "blog", label: "From a blog post" }] },
    { kind: "picker", key: "pageId", label: "Page", picker: "page", showIf: { key: "source", equals: ["page"] } },
    { kind: "picker", key: "blogPostId", label: "Blog post", picker: "blogPost", showIf: { key: "source", equals: ["blog"] } },
    { kind: "image", key: "imagePath", label: "Image" },
    { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
    ...headingEditor,
    { kind: "text", key: "body", label: "Text", maxLength: 1200, multiline: true, showIf: { key: "source", equals: ["manual"] } },
    ...ctaEditor,
    { kind: "select", key: "imagePosition", label: "Image position", options: opts(["left", "right"] as const) },
    { kind: "select", key: "tone", label: "Background", options: opts(TONES) },
    { kind: "select", key: "variant", label: "Layout", options: [{ value: "split", label: "Image beside text" }, { value: "fullbleed", label: "Full-width image with thumbnails" }, { value: "journal", label: "Journal (title, image, style note)" }] },
    {
      kind: "list",
      key: "thumbs",
      label: "Thumbnails",
      itemLabel: "Thumbnail",
      max: 8,
      showIf: { key: "variant", equals: ["fullbleed"] },
      fields: [
        { kind: "image", key: "imagePath", label: "Image" },
        { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
        { kind: "link", key: "href", label: "Link (optional)" },
      ],
    },
    { kind: "toggle", key: "showLogo", label: "Show the logo on the image", showIf: { key: "variant", equals: ["fullbleed"] } },
    { kind: "text", key: "noteEyebrow", label: "Style note label", maxLength: 60, showIf: { key: "variant", equals: ["journal"] } },
    { kind: "text", key: "noteHeading", label: "Style note heading", maxLength: 120, showIf: { key: "variant", equals: ["journal"] } },
  ],
} satisfies SectionDefinition;

const videoBanner = {
  type: "VideoBanner",
  label: "Video banner",
  description: "A YouTube or Vimeo film, or an uploaded MP4. No other embeds are allowed.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    videoUrl: videoUrl.default(""),
    posterPath: imagePath.default(""),
    autoplayMuted: z.boolean().default(true),
    ...ctaFields,
  }),
  fields: [
    ...headingEditor,
    { kind: "video", key: "videoUrl", label: "Video", help: "YouTube or Vimeo link, or upload an MP4 in Media and paste its path." },
    { kind: "image", key: "posterPath", label: "Cover image" },
    { kind: "toggle", key: "autoplayMuted", label: "Autoplay muted (MP4 only)" },
    ...ctaEditor,
  ],
} satisfies SectionDefinition;

const lookbook = {
  type: "Lookbook",
  label: "Lookbook",
  description: "An editorial image gallery; each look can link to a product.",
  groups: ["home", "collection"],
  schema: z.object({
    ...headingFields,
    looks: z
      .array(z.object({ imagePath: imagePath.default(""), alt: txt(200), caption: txt(120), productId: uuidOrEmpty.default("") }))
      .max(12)
      .default([]),
    layout: z.enum(["masonry", "row", "arches"]).default("masonry"),
  }),
  fields: [
    ...headingEditor,
    {
      kind: "list",
      key: "looks",
      label: "Looks",
      itemLabel: "Look",
      max: 12,
      fields: [
        { kind: "image", key: "imagePath", label: "Image" },
        { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
        { kind: "text", key: "caption", label: "Caption", maxLength: 120 },
        { kind: "picker", key: "productId", label: "Shop the look (product)", picker: "product" },
      ],
    },
    { kind: "select", key: "layout", label: "Layout", options: opts(["masonry", "row", "arches"] as const, { arches: "Arches beside the heading" }) },
  ],
} satisfies SectionDefinition;

const brandStory = {
  type: "BrandStory",
  label: "Brand story",
  description: "Who you are, with optional numbers (artisans, years, cities).",
  groups: ["home", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "Made by hand, in Jaipur"),
    body: txt(1500),
    imagePath: imagePath.default(""),
    alt: txt(200),
    stats: z.array(z.object({ value: plainText(12).pipe(z.string().min(1)), label: plainText(40).pipe(z.string().min(1)) })).max(4).default([]),
    ...ctaFields,
  }),
  fields: [
    ...headingEditor,
    { kind: "text", key: "body", label: "Story", maxLength: 1500, multiline: true },
    { kind: "image", key: "imagePath", label: "Image (optional)" },
    { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
    {
      kind: "list",
      key: "stats",
      label: "Numbers",
      itemLabel: "Number",
      max: 4,
      fields: [
        { kind: "text", key: "value", label: "Value (e.g. 120+)", maxLength: 12 },
        { kind: "text", key: "label", label: "Label (e.g. artisans)", maxLength: 40 },
      ],
    },
    ...ctaEditor,
  ],
} satisfies SectionDefinition;

const testimonials = {
  type: "Testimonials",
  label: "Testimonials",
  description: "Quotes from customers that you write in.",
  groups: ["home", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "Loved by our customers"),
    items: z
      .array(
        z.object({
          quote: plainText(400).pipe(z.string().min(1, "Required")),
          author: plainText(60).pipe(z.string().min(1, "Required")),
          location: txt(60),
          rating: z.coerce.number().int().min(0).max(5).default(5),
        }),
      )
      .max(8)
      .default([]),
  }),
  fields: [
    ...headingEditor,
    {
      kind: "list",
      key: "items",
      label: "Testimonials",
      itemLabel: "Testimonial",
      max: 8,
      fields: [
        { kind: "text", key: "quote", label: "Quote", maxLength: 400, multiline: true },
        { kind: "text", key: "author", label: "Name", maxLength: 60 },
        { kind: "text", key: "location", label: "City (optional)", maxLength: 60 },
        { kind: "number", key: "rating", label: "Stars (0 = hide)", min: 0, max: 5 },
      ],
    },
  ],
} satisfies SectionDefinition;

const reviews = {
  type: "Reviews",
  label: "Customer reviews",
  description: "Latest approved product reviews, pulled automatically.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "What customers say"),
    minRating: z.coerce.number().int().min(1).max(5).default(4),
    limit: z.coerce.number().int().min(2).max(12).default(6),
    showProduct: z.boolean().default(true),
  }),
  fields: [
    ...headingEditor,
    { kind: "number", key: "minRating", label: "Minimum stars", min: 1, max: 5 },
    { kind: "number", key: "limit", label: "Number of reviews", min: 2, max: 12 },
    { kind: "toggle", key: "showProduct", label: "Show product name" },
  ],
} satisfies SectionDefinition;

const socialProof = {
  type: "SocialProof",
  label: "Instagram / social",
  description: "Your Instagram posts and reels (images and MP4s you upload, linked to the post) with a profile header. No third-party scripts.",
  groups: ["home", "footer", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "#WearAangan"),
    handle: z
      .string()
      .trim()
      .max(31)
      .regex(/^@?[A-Za-z0-9._]*$/, "Letters, numbers, . and _ only")
      .default(""),
    profileUrl: socialUrl.default(""),
    posts: z.array(z.object({ imagePath: imagePath.default(""), videoUrl: videoUrl.default(""), alt: txt(200), href: socialUrl.default("") })).max(12).default([]),
    layout: z.enum(["mosaic", "grid", "strip"]).default("grid"),
    showProfile: z.boolean().default(true),
    /** greyscale: black-and-white tiles that turn to colour on hover. */
    filter: z.enum(["none", "greyscale"]).default("none"),
  }),
  fields: [
    ...headingEditor,
    { kind: "text", key: "handle", label: "Handle (e.g. @aangan)", maxLength: 31 },
    { kind: "link", key: "profileUrl", label: "Profile link", placeholder: "https://instagram.com/yourbrand" },
    {
      kind: "list",
      key: "posts",
      label: "Posts",
      itemLabel: "Post",
      max: 12,
      fields: [
        { kind: "image", key: "imagePath", label: "Image (or reel cover)" },
        { kind: "video", key: "videoUrl", label: "Reel video (optional MP4)", help: "Upload a reel as MP4 (≤ 10 MB) to show it as a playing reel." },
        { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
        { kind: "link", key: "href", label: "Post link (optional)" },
      ],
    },
    { kind: "select", key: "layout", label: "Layout", options: [{ value: "grid", label: "Grid" }, { value: "mosaic", label: "Mosaic (first post large)" }, { value: "strip", label: "One row (reel strip)" }] },
    { kind: "toggle", key: "showProfile", label: "Show profile header with Follow button" },
    { kind: "select", key: "filter", label: "Image colour", options: [{ value: "none", label: "Full colour" }, { value: "greyscale", label: "Black and white (colour on hover)" }] },
  ],
} satisfies SectionDefinition;

const newsletter = {
  type: "Newsletter",
  label: "Newsletter sign-up",
  description: "Email sign-up with marketing consent.",
  groups: ["home", "footer", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "Join the Aangan circle"),
    subheading: txt(300, "New prints, restocks and early access to sales. No spam."),
    buttonLabel: txt(30, "Subscribe"),
    tone: z.enum(TONES).default("muted"),
  }),
  fields: [...headingEditor, { kind: "text", key: "buttonLabel", label: "Button label", maxLength: 30 }, { kind: "select", key: "tone", label: "Background", options: opts(TONES) }],
} satisfies SectionDefinition;

const faq = {
  type: "FAQ",
  label: "FAQ",
  description: "Questions and answers — write them here or use your store FAQs.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    heading: txt(120, "Frequently asked questions"),
    source: z.enum(["store", "manual"]).default("store"),
    group: txt(60),
    items: z
      .array(z.object({ question: plainText(300).pipe(z.string().min(1, "Required")), answer: plainText(2000).pipe(z.string().min(1, "Required")) }))
      .max(20)
      .default([]),
    limit: z.coerce.number().int().min(1).max(30).default(8),
  }),
  fields: [
    ...headingEditor,
    { kind: "select", key: "source", label: "Questions", options: [{ value: "store", label: "Store FAQs" }, { value: "manual", label: "Write them here" }] },
    { kind: "text", key: "group", label: "Only this FAQ group (optional)", maxLength: 60, showIf: { key: "source", equals: ["store"] } },
    { kind: "number", key: "limit", label: "Maximum questions", min: 1, max: 30, showIf: { key: "source", equals: ["store"] } },
    {
      kind: "list",
      key: "items",
      label: "Questions",
      itemLabel: "Question",
      max: 20,
      showIf: { key: "source", equals: ["manual"] },
      fields: [
        { kind: "text", key: "question", label: "Question", maxLength: 300 },
        { kind: "text", key: "answer", label: "Answer", maxLength: 2000, multiline: true },
      ],
    },
  ],
} satisfies SectionDefinition;

export const TRUST_ICONS = ["truck", "return", "cod", "handmade", "secure", "india", "gift", "leaf", "sparkle"] as const;
const trustBadges = {
  type: "TrustBadges",
  label: "Trust strip",
  description: "Icons with short promises: shipping, returns, COD, handmade.",
  groups: ["home", "footer", "collection", "product"],
  schema: z.object({
    items: z
      .array(z.object({ icon: z.enum(TRUST_ICONS).default("truck"), title: plainText(40).pipe(z.string().min(1, "Required")), text: txt(100) }))
      .min(1)
      .max(6)
      .default([
        { icon: "truck", title: "Free shipping", text: "On orders above ₹1,499" },
        { icon: "cod", title: "Cash on delivery", text: "Across most PIN codes" },
        { icon: "return", title: "Easy returns", text: "7-day hassle-free returns" },
        { icon: "handmade", title: "Handcrafted", text: "Made by artisans in India" },
      ]),
    tone: z.enum(TONES).default("light"),
    layout: z.enum(["grid", "marquee", "line"]).default("grid"),
  }),
  fields: [
    {
      kind: "list",
      key: "items",
      label: "Promises",
      itemLabel: "Promise",
      min: 1,
      max: 6,
      fields: [
        { kind: "select", key: "icon", label: "Icon", options: opts(TRUST_ICONS, { cod: "Cash on delivery", india: "Made in India" }) },
        { kind: "text", key: "title", label: "Title", maxLength: 40 },
        { kind: "text", key: "text", label: "Text", maxLength: 100 },
      ],
    },
    { kind: "select", key: "tone", label: "Background", options: opts(TONES) },
    { kind: "select", key: "layout", label: "Layout", options: [{ value: "grid", label: "Grid" }, { value: "marquee", label: "Scrolling strip" }, { value: "line", label: "One quiet line" }] },
  ],
} satisfies SectionDefinition;

const marquee = {
  type: "Marquee",
  label: "Scrolling text",
  description: "A strip of text that scrolls continuously: offers, your brand name, a tagline.",
  groups: ["header", "home", "collection", "product", "footer"],
  schema: z.object({
    items: z.array(z.object({ text: plainText(80).pipe(z.string().min(1, "Required")) })).min(1).max(8).default([{ text: "New arrivals every week" }]),
    link: safeHref.default(""),
    size: z.enum(["small", "medium", "large"]).default("medium"),
    speed: z.enum(["slow", "normal", "fast"]).default("normal"),
    tone: z.enum(TONES).default("dark"),
    separator: z.enum(["dot", "star", "none", "sparkle"]).default("dot"),
    fontStyle: z.enum(["default", "italic-serif"]).default("default"),
  }),
  fields: [
    { kind: "list", key: "items", label: "Text", itemLabel: "Item", min: 1, max: 8, fields: [{ kind: "text", key: "text", label: "Text", maxLength: 80 }] },
    { kind: "link", key: "link", label: "Link (optional)" },
    { kind: "select", key: "size", label: "Text size", options: opts(["small", "medium", "large"] as const) },
    { kind: "select", key: "speed", label: "Speed", options: opts(["slow", "normal", "fast"] as const) },
    { kind: "select", key: "separator", label: "Separator", options: opts(["dot", "star", "none", "sparkle"] as const) },
    { kind: "select", key: "fontStyle", label: "Lettering", options: [{ value: "default", label: "Body font" }, { value: "italic-serif", label: "Italic heading font" }] },
    { kind: "select", key: "tone", label: "Colour", options: opts(TONES) },
  ],
} satisfies SectionDefinition;

const brandStrip = {
  type: "BrandStrip",
  label: "Brand strip",
  description: "Brands you stock or partners, as wordmarks or logos, in a row or a scrolling strip.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    items: z.array(z.object({ name: plainText(40).pipe(z.string().min(1, "Required")), imagePath: imagePath.default(""), href: safeHref.default("") })).min(1).max(16).default([{ name: "Your brand", imagePath: "", href: "" }]),
    layout: z.enum(["row", "marquee"]).default("row"),
    tone: z.enum(TONES).default("light"),
  }),
  fields: [
    ...headingEditor,
    {
      kind: "list",
      key: "items",
      label: "Brands",
      itemLabel: "Brand",
      min: 1,
      max: 16,
      fields: [
        { kind: "text", key: "name", label: "Name", maxLength: 40 },
        { kind: "image", key: "imagePath", label: "Logo (optional)" },
        { kind: "link", key: "href", label: "Link (optional)" },
      ],
    },
    { kind: "select", key: "layout", label: "Layout", options: [{ value: "row", label: "Row" }, { value: "marquee", label: "Scrolling strip" }] },
    { kind: "select", key: "tone", label: "Background", options: opts(TONES) },
  ],
} satisfies SectionDefinition;

const videoShopItem = z.object({ videoUrl: videoUrl.default(""), posterPath: imagePath.default(""), title: txt(60), productId: uuidOrEmpty.default("") });
const videoShop = {
  type: "VideoShop",
  label: "Shoppable videos",
  description: "Short vertical videos, as round stories or cards. Tapping one plays it with the linked product.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    layout: z.enum(["stories", "cards"]).default("cards"),
    items: z.array(videoShopItem).max(12).default([]),
  }),
  fields: [
    ...headingEditor,
    { kind: "select", key: "layout", label: "Style", options: [{ value: "stories", label: "Round stories" }, { value: "cards", label: "Vertical cards (9:16)" }] },
    {
      kind: "list",
      key: "items",
      label: "Videos",
      itemLabel: "Video",
      max: 12,
      fields: [
        { kind: "video", key: "videoUrl", label: "Video (MP4)", help: "Upload an MP4 (max 10 MB, vertical 9:16 works best) or paste a YouTube link." },
        { kind: "image", key: "posterPath", label: "Cover image" },
        { kind: "text", key: "title", label: "Title", maxLength: 60 },
        { kind: "picker", key: "productId", label: "Product to shop", picker: "product" },
      ],
    },
  ],
} satisfies SectionDefinition;


const spotlightLimit = { limit: z.coerce.number().int().min(1).max(8).default(3) };
const productSpotlight = {
  type: "ProductSpotlight",
  label: "Product spotlight",
  description: "A few chosen products, one at a time: thumbnails, a large image, title, price, swatches and an Add to bag button.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    ...productSourceFields,
    ...spotlightLimit,
    source: z.enum(PRODUCT_SOURCES).default("featured"),
    productEyebrow: txt(60, "The spotlight edit"),
    tagline: txt(80),
    swatchLabel: txt(40, "Choose your drape"),
    note: txt(120),
    buttonLabel: txt(30, "Add to bag"),
    buttonStyle: z.enum(["curved", "pill", "square"]).default("curved"),
    detailsLabel: txt(30, "View the details"),
  }),
  fields: [
    ...headingEditor,
    ...productSourceEditor(8),
    { kind: "text", key: "productEyebrow", label: "Label above the product title", maxLength: 60 },
    { kind: "text", key: "tagline", label: "Tagline beside the image (optional)", maxLength: 80 },
    { kind: "text", key: "swatchLabel", label: "Swatch label", maxLength: 40 },
    { kind: "text", key: "note", label: "Note under the swatches (optional)", maxLength: 120 },
    { kind: "text", key: "buttonLabel", label: "Button label", maxLength: 30 },
    { kind: "select", key: "buttonStyle", label: "Button style", options: [{ value: "curved", label: "Curved ribbon" }, { value: "pill", label: "Pill" }, { value: "square", label: "Theme button" }] },
    { kind: "text", key: "detailsLabel", label: "Details link label", maxLength: 30 },
  ],
} satisfies SectionDefinition;

const compactProducts = {
  type: "CompactProducts",
  label: "Compact product rows",
  description: "Small thumbnails with title, price and an Add to bag button, several per row.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    ...productSourceFields,
    limit: z.coerce.number().int().min(2).max(12).default(4),
    columns: z.coerce.number().int().min(1).max(4).default(4),
    buttonLabel: txt(30, "Add to bag"),
  }),
  fields: [
    ...headingEditor,
    ...productSourceEditor(12),
    { kind: "number", key: "columns", label: "Columns (desktop)", min: 1, max: 4 },
    { kind: "text", key: "buttonLabel", label: "Button label", maxLength: 30 },
  ],
} satisfies SectionDefinition;

const featureBand = {
  type: "FeatureBand",
  label: "Feature band",
  description: "A coloured band (optionally with wavy edges): a feature image with a story beside product cards.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    ...headingFields,
    ...productSourceFields,
    limit: z.coerce.number().int().min(2).max(8).default(4),
    imagePath: imagePath.default(""),
    alt: txt(200),
    featureEyebrow: txt(60),
    featureHeading: txt(80),
    featureAccent: txt(60),
    featureHref: safeHref.default(""),
    ...ctaFields,
    edge: z.enum(["wave", "straight"]).default("wave"),
    tone: z.enum(["deep", "dark", "accent"]).default("deep"),
  }),
  fields: [
    ...headingEditor,
    ...productSourceEditor(8),
    { kind: "image", key: "imagePath", label: "Feature image" },
    { kind: "text", key: "alt", label: "Image description", maxLength: 200 },
    { kind: "text", key: "featureEyebrow", label: "Feature eyebrow", maxLength: 60 },
    { kind: "text", key: "featureHeading", label: "Feature heading", maxLength: 80 },
    { kind: "text", key: "featureAccent", label: "Feature heading, italic line", maxLength: 60 },
    { kind: "link", key: "featureHref", label: "Feature link" },
    ...ctaEditor,
    { kind: "select", key: "edge", label: "Edges", options: [{ value: "wave", label: "Wavy" }, { value: "straight", label: "Straight" }] },
    { kind: "select", key: "tone", label: "Colour", options: [{ value: "deep", label: "Deep (darkened primary)" }, { value: "dark", label: "Primary" }, { value: "accent", label: "Secondary" }] },
  ],
} satisfies SectionDefinition;

const pageContent = {
  type: "PageContent",
  label: "Page content",
  description: "Where the page's own content (product grid, product details) appears. Sections above it show before the content.",
  groups: ["collection", "product"],
  singleton: true,
  schema: z.object({}),
  fields: [],
} satisfies SectionDefinition;

const footer = {
  type: "Footer",
  label: "Footer",
  description: "Menus, contact details, social links and policies.",
  groups: ["footer"],
  singleton: true,
  schema: z.object({
    menuHandles: z.array(menuHandle.pipe(z.string().min(2))).max(4).default(["footer"]),
    about: txt(400),
    showContact: z.boolean().default(true),
    showSocial: z.boolean().default(true),
    showPolicies: z.boolean().default(true),
    showPaymentNote: z.boolean().default(true),
    copyright: txt(120),
    tone: z.enum(["dark", "light", "muted"]).default("dark"),
    decor: z.enum(["none", "ethnic", "krishna"]).default("none"),
    showNewsletter: z.boolean().default(false),
    newsletterHeading: txt(80, "Join our family"),
    newsletterText: txt(160, "New arrivals, festive edits and early access to offers."),
  }),
  fields: [
    { kind: "tags", key: "menuHandles", label: "Menus (handles)", max: 4, placeholder: "footer" },
    { kind: "text", key: "about", label: "About text", maxLength: 400, multiline: true },
    { kind: "toggle", key: "showContact", label: "Show contact details" },
    { kind: "toggle", key: "showSocial", label: "Show social links" },
    { kind: "toggle", key: "showPolicies", label: "Show policy pages" },
    { kind: "toggle", key: "showPaymentNote", label: "Show “UPI, cards & COD accepted”" },
    { kind: "text", key: "copyright", label: "Copyright line (optional)", maxLength: 120 },
    { kind: "select", key: "tone", label: "Colour", options: opts(["dark", "light", "muted"] as const) },
    { kind: "select", key: "decor", label: "Decoration", options: [{ value: "none", label: "None" }, { value: "ethnic", label: "Ethnic (arches, block-print pattern, chhatri skyline)" }, { value: "krishna", label: "Krishna (peacock feathers, flute, kadamba vine)" }] },
    { kind: "toggle", key: "showNewsletter", label: "Show newsletter sign-up at the top" },
    { kind: "text", key: "newsletterHeading", label: "Newsletter heading", maxLength: 80 },
    { kind: "text", key: "newsletterText", label: "Newsletter text", maxLength: 160 },
  ],
} satisfies SectionDefinition;

/** Public-domain artworks bundled in public/illustrations/art (fixed list: no arbitrary URLs). */
export const DECOR_ARTWORKS = {
  "met-bower": {
    src: "/illustrations/art/met-krishna-radha-bower.webp",
    width: 599,
    height: 480,
    title: "Krishna and Radha in a Bower",
    credit: "Page from a dispersed Gita Govinda, Mewar, ca. 1665. The Metropolitan Museum of Art, public domain (CC0).",
  },
  "met-grove": {
    src: "/illustrations/art/met-radha-krishna-grove.webp",
    width: 437,
    height: 624,
    title: "Radha and Krishna Walk in a Flowering Grove",
    credit: "Kota, Rajasthan, ca. 1720. The Metropolitan Museum of Art, public domain (CC0).",
  },
} as const;
export type DecorArtwork = keyof typeof DECOR_ARTWORKS;

const decorDivider = {
  type: "DecorDivider",
  label: "Decorative divider",
  description: "A light line ornament between sections (flute, peacock feather, lotus, kadamba vine), optionally with a public-domain miniature painting.",
  groups: ["home", "collection", "product"],
  schema: z.object({
    motif: z.enum(["krishna", "bansuri", "peacock", "lotus", "kadamba"]).default("krishna"),
    /** divider: a centred ornament between sections. margins: faint feathers in the side margins (wide screens). */
    layout: z.enum(["divider", "margins"]).default("divider"),
    artwork: z.enum(["none", "met-bower", "met-grove"]).default("none"),
    heading: txt(80),
    text: txt(240),
  }),
  fields: [
    { kind: "select", key: "motif", label: "Motif", options: [{ value: "krishna", label: "Flute with peacock feathers" }, { value: "bansuri", label: "Flute (bansuri)" }, { value: "peacock", label: "Peacock feather" }, { value: "lotus", label: "Lotus" }, { value: "kadamba", label: "Kadamba vine" }] },
    { kind: "select", key: "layout", label: "Placement", options: [{ value: "divider", label: "Ornament between sections" }, { value: "margins", label: "Feathers in the page margins (wide screens)" }] },
    { kind: "select", key: "artwork", label: "Painting (public domain)", options: [{ value: "none", label: "None" }, { value: "met-bower", label: "Krishna and Radha in a Bower (The Met)" }, { value: "met-grove", label: "Radha and Krishna in a Grove (The Met)" }], showIf: { key: "layout", equals: ["divider"] } },
    { kind: "text", key: "heading", label: "Heading beside the painting", maxLength: 80, showIf: { key: "layout", equals: ["divider"] } },
    { kind: "text", key: "text", label: "Text beside the painting", maxLength: 240, multiline: true, showIf: { key: "layout", equals: ["divider"] } },
  ],
} satisfies SectionDefinition;

export const SECTION_DEFINITIONS = {
  AnnouncementBar: announcementBar,
  Header: header,
  MegaMenu: megaMenu,
  Hero: hero,
  PromoBanner: promoBanner,
  CategoryGrid: categoryGrid,
  CollectionGrid: collectionGrid,
  ProductCarousel: productCarousel,
  ProductGrid: productGrid,
  Bestseller: bestseller,
  NewArrivals: newArrivals,
  SaleBanner: saleBanner,
  EditorialImageText: editorial,
  VideoBanner: videoBanner,
  Lookbook: lookbook,
  BrandStory: brandStory,
  Testimonials: testimonials,
  Reviews: reviews,
  SocialProof: socialProof,
  Newsletter: newsletter,
  FAQ: faq,
  TrustBadges: trustBadges,
  Marquee: marquee,
  BrandStrip: brandStrip,
  VideoShop: videoShop,
  ProductSpotlight: productSpotlight,
  CompactProducts: compactProducts,
  FeatureBand: featureBand,
  DecorDivider: decorDivider,
  PageContent: pageContent,
  Footer: footer,
} as const satisfies Record<SectionType, SectionDefinition>;

export type SectionSettings<T extends SectionType> = z.infer<(typeof SECTION_DEFINITIONS)[T]["schema"]>;

export function getSectionDefinition(type: string): SectionDefinition | null {
  return Object.prototype.hasOwnProperty.call(SECTION_DEFINITIONS, type) ? (SECTION_DEFINITIONS as Record<string, SectionDefinition>)[type]! : null;
}

/** Default settings for a section type (every field defaulted). */
export function defaultSettings(type: SectionType): Record<string, unknown> {
  return SECTION_DEFINITIONS[type].schema.parse({}) as Record<string, unknown>;
}
