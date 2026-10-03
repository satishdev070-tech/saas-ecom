import type { z } from "zod";

/**
 * Section registry contracts. A definition is PURE data + a zod schema (usable from the
 * client editor and from tests); renderers live in a separate server-only map keyed by the
 * same type (./renderers.tsx) so the editor bundle never pulls in server code.
 */

export const SECTION_TYPES = [
  "AnnouncementBar",
  "Header",
  "MegaMenu",
  "Hero",
  "PromoBanner",
  "CategoryGrid",
  "CollectionGrid",
  "ProductCarousel",
  "ProductGrid",
  "Bestseller",
  "NewArrivals",
  "SaleBanner",
  "EditorialImageText",
  "VideoBanner",
  "Lookbook",
  "BrandStory",
  "Testimonials",
  "Reviews",
  "SocialProof",
  "Newsletter",
  "FAQ",
  "TrustBadges",
  "Marquee",
  "BrandStrip",
  "VideoShop",
  "ProductSpotlight",
  "CompactProducts",
  "FeatureBand",
  "DecorDivider",
  "PageContent",
  "Footer",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Where a section may be placed. */
export const SECTION_GROUPS = ["header", "footer", "home", "collection", "product"] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];

/** Editor-side pickers are populated from the tenant's catalog/content. */
export type PickerKind = "collection" | "category" | "product" | "page" | "blogPost" | "menu";

type FieldBase = {
  key: string;
  label: string;
  help?: string;
  /** Only show this field when another field in the same object has one of these values. */
  showIf?: { key: string; equals: readonly (string | boolean)[] };
};

export type EditorField =
  | (FieldBase & { kind: "text"; maxLength: number; multiline?: boolean; placeholder?: string })
  | (FieldBase & { kind: "number"; min: number; max: number; step?: number })
  | (FieldBase & { kind: "select"; options: readonly { value: string; label: string }[] })
  | (FieldBase & { kind: "toggle" })
  | (FieldBase & { kind: "color" })
  | (FieldBase & { kind: "image" })
  | (FieldBase & { kind: "link"; placeholder?: string })
  | (FieldBase & { kind: "video" })
  | (FieldBase & { kind: "picker"; picker: PickerKind })
  | (FieldBase & { kind: "multiPicker"; picker: "product" | "collection" | "category"; max: number })
  | (FieldBase & { kind: "tags"; max: number; placeholder?: string })
  | (FieldBase & { kind: "list"; itemLabel: string; min?: number; max: number; fields: EditorField[] });

export type SectionDefinition<S extends z.ZodType = z.ZodType> = {
  type: SectionType;
  label: string;
  description: string;
  /** Groups this section can be added to. */
  groups: readonly SectionGroup[];
  /** At most one instance per group (e.g. Header, Footer). */
  singleton?: boolean;
  schema: S;
  fields: EditorField[];
};

export type SectionVisibility = { desktop: boolean; mobile: boolean };

export type SectionInstance<T = Record<string, unknown>> = {
  id: string;
  type: SectionType;
  settings: T;
  visibility: SectionVisibility;
};
