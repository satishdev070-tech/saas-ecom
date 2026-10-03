/** Shapes of the demo store definitions (DEV ONLY seed data for 10 distinct storefronts). */

export type Colors = { ground: string; ink: string; accent: string; leaf: string; altGround?: string; altPrint?: string; drapePrint?: string; drapeGround?: string };

export type ProductSpec = {
  title: string;
  type: "kurta" | "kurta_set" | "suit" | "co_ord_set" | "dress" | "saree" | "lehenga" | "top" | "shirt" | "bottom" | "dupatta" | "accessory" | "other";
  category: string;
  price: number;
  mrp?: number;
  /** apparel = XS–XXL, standard = S–XL, free = one size (no options). */
  sizes: "apparel" | "standard" | "free";
  colors?: { name: string; hex: string }[];
  fabric: string;
  work?: string;
  occasion: string[];
  tags: string[];
  featured?: boolean;
  short: string;
  description: string;
  /** Drawing: silhouette defaults by product type. */
  art: { print: string; colors: Colors; silhouette?: string };
  collections?: string[];
};

export type Hero = { eyebrow: string; heading: string; subheading: string; ctaLabel: string; ctaHref: string; textTone: "light" | "dark"; align: "left" | "center" };

export type StoreSpec = {
  slug: string;
  name: string;
  tagline: string;
  story: string;
  email: string;
  phone: string;
  address: { line1: string; city: string; state: string; postal_code: string };
  social: Record<string, string>;
  seo: { title: string; description: string };
  gstin?: string;
  legalName: string;
  /** Backdrop gradient for product shots + banner palette. */
  backdrop: [string, string];
  bannerBackdrop: [string, string];
  hero: Hero;
  announcement: string[];
  tokens: Record<string, unknown>;
  header: Record<string, unknown>;
  headerLayout: "logo-left" | "logo-center";
  productCard: Record<string, unknown>;
  footerTone: "dark" | "light" | "muted";
  /** Home template: [type, settings] pairs; image paths and ids are filled in by the generator. */
  home: [string, Record<string, unknown>][];
  categories: { slug: string; name: string; description: string }[];
  collections: { slug: string; title: string; description: string; rules?: { tag: string } }[];
  menu: { title: string; to?: string; highlight?: boolean; children?: { title: string; to: string }[] }[];
  faqs: [string, string][];
  testimonials: { quote: string; name: string; place: string }[];
  reviews: { product: number; rating: number; title: string; body: string; author: string }[];
  products: ProductSpec[];
  shippingNote: string;
  returnsNote: string;
};
