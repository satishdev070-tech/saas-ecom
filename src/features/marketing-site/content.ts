/**
 * Marketing copy and demo data, kept out of the components so sections stay
 * presentational and copy can be reviewed in one place. Everything here describes
 * capabilities that exist in the platform schema (variants, size charts, PIN code rules,
 * GST invoices, discounts, custom domains...). Store names, products and numbers shown
 * in previews are fictional demo content and are labelled as such on the page.
 */

export const SECTION_IDS = {
  main: "main",
  preview: "preview",
  proof: "proof",
  themes: "themes",
  builder: "builder",
  dashboard: "dashboard",
  features: "features",
  fashion: "fashion",
  howItWorks: "how-it-works",
  gallery: "gallery",
  pricing: "pricing",
  faq: "faq",
} as const;

export type NavLink = { label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: "/features" },
  { label: "Themes", href: `/#${SECTION_IDS.themes}` },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: `/#${SECTION_IDS.faq}` },
];

export const SIGNUP_HREF = "/seller/register";
export const LOGIN_HREF = "/seller/login";

export const HERO = {
  eyebrow: "E-commerce for Indian fashion brands",
  headline: ["Your Fashion Brand.", "Your Store.", "Your Growth Engine."] as const,
  subheadline:
    "Launch a premium online store, manage every sale from one dashboard, and give your brand the digital storefront it deserves.",
  primaryCta: "Start Building",
  secondaryCta: "Explore Themes",
  assurances: ["Free trial on every plan", "UPI, cards & cash on delivery", "GST-ready invoices"],
};

export const ANNOUNCEMENT = {
  label: "New",
  message: "Aangan, our editorial theme for Indian fashion labels, is live.",
  cta: "See the theme",
};

// ---------------------------------------------------------------------------------------
// Demo catalogue (fictional). Used by the storefront previews.
// ---------------------------------------------------------------------------------------

export type GarmentKind = "kurta" | "anarkali" | "saree" | "lehenga" | "jhumka" | "potli" | "shirt";

export type PlateArt = {
  garment: GarmentKind;
  /** Backdrop colour of the "studio" plate. */
  backdrop: string;
  /** Main garment colour. */
  ink: string;
  /** Embroidery / print / border colour. */
  detail: string;
};

export type DemoProduct = {
  id: string;
  name: string;
  category: string;
  /** Rupees, as a seller would type it. */
  price: number;
  compareAt?: number;
  badge?: string;
  swatches: string[];
  art: PlateArt;
  /** Second image revealed on hover. */
  hoverArt: PlateArt;
};

export const DEMO_STORE = {
  name: "Kesar Studio",
  domain: "kesarstudio.in",
  menu: ["New in", "Kurtas", "Sarees", "Lehengas", "Jewellery"],
  announcement: "Free shipping above ₹1,499 · Cash on delivery available",
  heroEyebrow: "Festive ’26",
  heroTitle: "The Festive Edit",
  heroBody: "Hand block-printed cottons and zari silks, made in small batches for the season.",
  heroCta: "Shop the edit",
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "gulnar-kurta",
    name: "Gulnar block-print kurta",
    category: "Kurtas",
    price: 2490,
    compareAt: 3190,
    badge: "New",
    swatches: ["#a4452b", "#2f3e6b", "#c9a227"],
    art: { garment: "kurta", backdrop: "#e9dfd0", ink: "#a4452b", detail: "#f3e3c3" },
    hoverArt: { garment: "kurta", backdrop: "#dcd3c4", ink: "#2f3e6b", detail: "#e8dcc2" },
  },
  {
    id: "neelambari-anarkali",
    name: "Neelambari anarkali set",
    category: "Sets",
    price: 4890,
    swatches: ["#2f3e6b", "#1f5a4a"],
    art: { garment: "anarkali", backdrop: "#d9dde6", ink: "#2f3e6b", detail: "#d8b25a" },
    hoverArt: { garment: "anarkali", backdrop: "#d5e0da", ink: "#1f5a4a", detail: "#e3c77d" },
  },
  {
    id: "rani-banarasi",
    name: "Rani Banarasi silk saree",
    category: "Sarees",
    price: 8900,
    compareAt: 10500,
    badge: "Bestseller",
    swatches: ["#b83a6a", "#5a2440"],
    art: { garment: "saree", backdrop: "#f0dcd4", ink: "#b83a6a", detail: "#d9a93f" },
    hoverArt: { garment: "saree", backdrop: "#eadbd9", ink: "#5a2440", detail: "#d9a93f" },
  },
  {
    id: "chandbali-jhumka",
    name: "Chandbali jhumkas",
    category: "Jewellery",
    price: 1290,
    swatches: ["#c9a227", "#b8b8b8"],
    art: { garment: "jhumka", backdrop: "#3b2533", ink: "#d4ac45", detail: "#f1e2b3" },
    hoverArt: { garment: "jhumka", backdrop: "#2f3a33", ink: "#cfcfcf", detail: "#ffffff" },
  },
  {
    id: "zari-lehenga",
    name: "Zari border lehenga",
    category: "Lehengas",
    price: 18500,
    swatches: ["#1f5a4a", "#9a3b26"],
    art: { garment: "lehenga", backdrop: "#f3ecdf", ink: "#1f5a4a", detail: "#d8b25a" },
    hoverArt: { garment: "lehenga", backdrop: "#efe2d6", ink: "#9a3b26", detail: "#e8c77a" },
  },
  {
    id: "mirror-potli",
    name: "Mirror-work potli",
    category: "Accessories",
    price: 990,
    compareAt: 1290,
    swatches: ["#d99a2b", "#b83a6a"],
    art: { garment: "potli", backdrop: "#dfe3d6", ink: "#d99a2b", detail: "#fff6dc" },
    hoverArt: { garment: "potli", backdrop: "#f0dcd4", ink: "#b83a6a", detail: "#fff6dc" },
  },
  {
    id: "linen-coord",
    name: "Linen co-ord shirt",
    category: "Co-ords",
    price: 2190,
    swatches: ["#9aa58a", "#efe6d6", "#1f1a17"],
    art: { garment: "shirt", backdrop: "#ece6dc", ink: "#8f9b7e", detail: "#f5f1ea" },
    hoverArt: { garment: "shirt", backdrop: "#e3e3de", ink: "#e9e1d2", detail: "#8a7f70" },
  },
];

export function demoProduct(id: string): DemoProduct {
  const product = DEMO_PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown demo product ${id}`);
  return product;
}

// ---------------------------------------------------------------------------------------
// Social proof (illustrative)
// ---------------------------------------------------------------------------------------

/** Fictional demo storefront names, set in different type to show range. Labelled on page. */
export const DEMO_BRANDS: { name: string; style: "serif" | "sans" | "caps" | "italic" }[] = [
  { name: "Kesar Studio", style: "serif" },
  { name: "INDIGO LOOM", style: "caps" },
  { name: "māti", style: "italic" },
  { name: "House of Noor", style: "serif" },
  { name: "SUTRA", style: "caps" },
  { name: "Gulaal", style: "sans" },
  { name: "Chandbali & Co.", style: "italic" },
  { name: "Threadwise", style: "sans" },
];

export type SampleMetric = { value: number; decimals?: number; prefix?: string; suffix?: string; label: string };

/** Illustrative sample-store metrics. Rendered with an explicit "illustrative" disclaimer. */
export const SAMPLE_METRICS: SampleMetric[] = [
  { value: 18.4, decimals: 1, prefix: "₹", suffix: "L", label: "sales in the first festive season" },
  { value: 2140, label: "orders managed from one dashboard" },
  { value: 41, suffix: "%", label: "of orders from repeat customers" },
  { value: 72, suffix: "%", label: "of checkouts completed on mobile" },
];

// ---------------------------------------------------------------------------------------
// Problem -> solution
// ---------------------------------------------------------------------------------------

export const PROBLEM_SOLUTIONS: { problem: string; solution: string }[] = [
  {
    problem: "Orders buried in Instagram DMs and WhatsApp chats.",
    solution: "A branded store with real checkout, so every order lands in one dashboard.",
  },
  {
    problem: "Stock tracked in a spreadsheet that is always a day behind.",
    solution: "Live inventory for every size and colour, reserved the moment a customer checks out.",
  },
  {
    problem: "A template that makes your label look like everyone else’s.",
    solution: "Editorial themes and design settings you control, without touching code.",
  },
  {
    problem: "Cash-on-delivery orders to PIN codes you cannot actually serve.",
    solution: "PIN code rules that decide delivery, COD and extra days before an order is placed.",
  },
  {
    problem: "GST invoices typed up by hand at the end of the month.",
    solution: "Invoices with your GSTIN and HSN codes issued from each order.",
  },
];

// ---------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------

export const BUILDER_SECTIONS = ["Announcement bar", "Header", "Hero", "New arrivals", "Editorial story", "Bestsellers", "Shop by occasion", "Reviews", "Newsletter", "Footer"];

export const BUILDER_POINTS = [
  { title: "23 sections, your order", body: "Hero, lookbook, bestsellers, reviews, FAQs and more. Add, remove and reorder them freely." },
  { title: "Desktop and mobile, separately", body: "Show a section on desktop only, mobile only, or both, and preview each before it goes live." },
  { title: "Drafts, publish and rollback", body: "Edit a draft while your store stays live. Every publish is versioned, so you can roll back in one click." },
];

// ---------------------------------------------------------------------------------------
// Feature rows
// ---------------------------------------------------------------------------------------

export type FeatureRowCopy = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
};

export const FEATURE_ROWS: FeatureRowCopy[] = [
  {
    id: "catalog",
    eyebrow: "Catalogue",
    title: "A catalogue that understands fashion",
    body: "Model products the way you actually sell them: one style, many sizes and colours, each with its own stock, price and images.",
    points: [
      "Variants by size and colour with per-variant SKU and price",
      "Fabric, occasion, work and pattern as filterable attributes",
      "Collections that fill themselves by rules, such as “all cotton under ₹3,000”",
      "CSV import and export for the whole catalogue",
    ],
  },
  {
    id: "orders",
    eyebrow: "Orders & inventory",
    title: "Orders and stock, always in step",
    body: "From payment to doorstep, every order has a clear status, and stock moves with it automatically.",
    points: [
      "Stock reserved at checkout, so you never oversell the last piece",
      "Multiple stock locations with a full movement history",
      "Packing, shipping and tracking updates in one timeline",
      "Returns, exchanges and refunds recorded against the order",
    ],
  },
  {
    id: "marketing",
    eyebrow: "Marketing & coupons",
    title: "Campaigns that still feel like your brand",
    body: "Run a festive sale, reward loyal customers or clear last season, with offers you control down to the collection.",
    points: [
      "Percentage, flat, free-shipping and buy-X-get-Y offers",
      "Codes or automatic discounts, with schedules and usage limits",
      "Minimum order values and per-customer limits",
      "Announcement bar, journal and newsletter sign-ups built in",
    ],
  },
  {
    id: "analytics",
    eyebrow: "Analytics",
    title: "Know what sells, in which size",
    body: "Sales, orders and conversion in plain numbers, so decisions about the next drop come from data rather than guesswork.",
    points: [
      "Revenue, orders and average order value over any period",
      "A funnel from product views to completed orders",
      "Top products and variants at a glance",
      "CSV exports on plans that include them",
    ],
  },
  {
    id: "domain",
    eyebrow: "Custom domain",
    title: "Your name on the door",
    body: "Start on a free store address and move to your own domain when you are ready, with HTTPS handled for you.",
    points: [
      "A free subdomain the moment you sign up",
      "Connect your own domain with a single DNS record",
      "Automatic SSL certificates and status checks",
      "Your customers see your brand, not ours",
    ],
  },
  {
    id: "mobile",
    eyebrow: "Mobile commerce",
    title: "Made for the phone in your customer’s hand",
    body: "Most fashion discovery happens on a phone. Every theme is designed mobile-first, right through to checkout.",
    points: [
      "Thumb-friendly size selectors and a sticky add-to-bag",
      "UPI, cards and netbanking through your Razorpay account",
      "Delivery and COD check by PIN code on the product page",
      "Wishlists and saved addresses for returning customers",
    ],
  },
];

// ---------------------------------------------------------------------------------------
// Fashion-specific
// ---------------------------------------------------------------------------------------

export type FashionFeatureKey = "sizes" | "colours" | "fabrics" | "sizeGuide" | "cod" | "pincode" | "gst" | "returns";

export const FASHION_FEATURES: { key: FashionFeatureKey; title: string; body: string }[] = [
  { key: "sizes", title: "Sizes that make sense", body: "XS to 3XL, free size or custom sizing, each with its own stock. Sold-out sizes stay visible but can’t be ordered." },
  { key: "colours", title: "Colour swatches", body: "Real colour swatches on product cards and pages, with images that switch to the colour a customer picks." },
  { key: "fabrics", title: "Fabric & craft details", body: "Fabric, work, occasion and pattern as structured attributes that power filters and collections." },
  { key: "sizeGuide", title: "Size guides", body: "Create size charts once and attach them to any product, so customers order the right fit the first time." },
  { key: "cod", title: "Cash on delivery", body: "Offer COD where it makes sense, with minimum and maximum order values, an optional fee and PIN code rules." },
  { key: "pincode", title: "PIN code checks", body: "Customers check delivery and COD availability for their PIN code before they order." },
  { key: "gst", title: "GST invoices", body: "Invoices with your GSTIN, HSN codes and tax breakdown, issued from each order." },
  { key: "returns", title: "Returns & exchanges", body: "Customers raise returns from their account; you approve, receive and refund in a few clicks." },
];

// ---------------------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------------------

export const HOW_IT_WORKS: { title: string; body: string }[] = [
  { title: "Create your store", body: "Sign up, name your label and get a store address immediately." },
  { title: "Add your collection", body: "Add products one by one or import a CSV, with sizes, colours, fabrics and size guides." },
  { title: "Choose your look", body: "Start from Aangan, set your colours, type and sections, then preview on desktop and mobile." },
  { title: "Publish and sell", body: "Go live, take UPI, card and COD orders, and ship them from your dashboard." },
];

// ---------------------------------------------------------------------------------------
// Theme gallery (page templates)
// ---------------------------------------------------------------------------------------

export const GALLERY_PAGES: { key: "home" | "collection" | "product" | "sizeGuide" | "cart" | "journal"; title: string; body: string }[] = [
  { key: "home", title: "Home", body: "Editorial hero, curated edits and bestsellers." },
  { key: "collection", title: "Collection", body: "Filters for size, colour, fabric and price." },
  { key: "product", title: "Product", body: "Tall imagery, size selector and delivery check." },
  { key: "sizeGuide", title: "Size guide", body: "Chart in inches and centimetres, per product." },
  { key: "cart", title: "Bag & checkout", body: "Offers, delivery estimate and COD in one flow." },
  { key: "journal", title: "Journal", body: "Lookbooks and stories behind each collection." },
];

// ---------------------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------------------

export type Faq = { question: string; answer: string };

export function buildFaqs(rootDomain: string): Faq[] {
  return [
    {
      question: "Do I need a developer or designer to launch?",
      answer:
        "No. You choose a theme, set your colours, fonts and sections in the theme editor, and add products from your dashboard. Everything is point-and-click, and you can preview on desktop and mobile before publishing.",
    },
    {
      question: "Can I use my own domain?",
      answer: `Every store gets a free address at yourbrand.${rootDomain} from day one. On plans that include custom domains you can connect your own domain with a DNS record, and HTTPS certificates are issued automatically.`,
    },
    {
      question: "Which payment methods can my customers use?",
      answer:
        "Online payments run through your own Razorpay account, so customers can pay with UPI, cards and netbanking. Cash on delivery is built in, and you decide the PIN codes, order values and any COD fee it applies to.",
    },
    {
      question: "How do shipping and PIN code checks work?",
      answer:
        "You set shipping rates and PIN code rules for delivery, COD availability and extra delivery days. Customers can check their PIN code on the product page, and the same rules are enforced at checkout.",
    },
    {
      question: "Do you generate GST invoices?",
      answer:
        "Yes. Add your GSTIN in settings and HSN codes on your products, and invoices with the tax breakdown are issued from each order.",
    },
    {
      question: "Can I bring my existing catalogue?",
      answer:
        "Yes. Import products from a CSV file, including variants, prices and stock, and export your catalogue whenever you need to. Your products, customers and orders always belong to you.",
    },
    {
      question: "Can my team help run the store?",
      answer:
        "Yes. Invite staff with roles such as owner, admin, manager, staff or viewer. Each role only sees and changes what it is allowed to, and sensitive actions are recorded in an audit log.",
    },
    {
      question: "Is there a free trial?",
      answer: "Yes. Every plan starts with a free trial, so you can build your store, add products and preview everything before you choose a plan.",
    },
  ];
}

// ---------------------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------------------

export const FOOTER_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Themes", href: `/#${SECTION_IDS.themes}` },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: `/#${SECTION_IDS.howItWorks}` },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Start your store", href: SIGNUP_HREF },
      { label: "Log in", href: LOGIN_HREF },
      { label: "FAQ", href: `/#${SECTION_IDS.faq}` },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
    ],
  },
];

export const BUILT_FOR = ["Ethnic wear labels", "Boutiques", "D2C fashion brands", "Jewellery & accessories", "Manufacturers going direct", "Instagram-first sellers"];
