/**
 * Marketing copy for the public Build Brighten site, kept out of the components so it can be
 * reviewed in one place. Every capability described here was checked against the codebase:
 *
 *   payments   src/features/payments (Razorpay, Cashfree, PayU on the seller's own account) + COD
 *   shipping   src/features/shipping (manual rates, PIN code rules, Delhivery; Shiprocket only where
 *              the platform enables its feature flag, which is off by default)
 *   catalogue  variants, CSV import (catalog/server/import.ts), collections, size charts
 *   orders     orders, returns, refunds, GST invoices (store/[host]/orders/[id]/invoice)
 *   marketing  discounts, SEO settings, analytics, reviews
 *   domains    free subdomain + custom domains on plans that include them
 *   themes     theme marketplace (features/theme/marketplace), drafts, publish and rollback
 *
 * No testimonials, merchant counts or business results are claimed anywhere on the site.
 */

export const SECTION_IDS = {
  main: "main",
  benefits: "benefits",
  categories: "categories",
  themes: "themes",
  howItWorks: "how-it-works",
  demos: "demos",
  pricing: "pricing",
  faq: "faq",
} as const;

export type NavLink = { label: string; href: string };

export const SIGNUP_HREF = "/seller/register";
export const LOGIN_HREF = "/seller/login";
export const THEMES_HREF = "/themes";
export const PRICING_HREF = "/pricing";
export const HOW_IT_WORKS_HREF = "/how-it-works";
export const FEATURES_HREF = "/features";

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: FEATURES_HREF },
  { label: "Themes", href: THEMES_HREF },
  { label: "How It Works", href: HOW_IT_WORKS_HREF },
  { label: "Pricing", href: PRICING_HREF },
];

export const CTA_CREATE = "Create Your Store";
export const CTA_THEMES = "Explore Themes";

/** Sign-up URL that carries a plan and/or theme choice through registration and onboarding. */
export function signupHref(choice: { plan?: string | null; theme?: string | null } = {}): string {
  const qs = new URLSearchParams();
  if (choice.plan) qs.set("plan", choice.plan);
  if (choice.theme) qs.set("theme", choice.theme);
  return qs.size ? `${SIGNUP_HREF}?${qs}` : SIGNUP_HREF;
}

export const HERO = {
  eyebrow: "E-commerce for Indian businesses",
  headline: "Your brand. Your store. Your next big beginning.",
  body: "Create your online store, showcase your products, and manage your business with Build Brighten.",
};

export type Benefit = { key: BenefitKey; title: string; body: string };
export type BenefitKey = "storefront" | "catalogue" | "orders" | "payments" | "shipping" | "domains" | "seo";

export const BENEFITS: Benefit[] = [
  { key: "storefront", title: "A storefront that looks like you", body: "Pick a theme, then change colours, fonts and sections in a visual editor. Preview desktop and mobile before you publish." },
  { key: "catalogue", title: "Products and inventory", body: "Variants such as size and colour with their own price and stock, collections, size charts and CSV import." },
  { key: "orders", title: "Orders in one place", body: "Track every order from payment to delivery, handle returns and refunds, and issue GST invoices." },
  { key: "payments", title: "Payments on your account", body: "Connect your own Razorpay, Cashfree or PayU account for UPI, cards and netbanking, and offer cash on delivery." },
  { key: "shipping", title: "Shipping your way", body: "Set your own rates and PIN code rules, or connect a courier account such as Delhivery to book shipments." },
  { key: "domains", title: "Your own domain", body: "Every store gets a free web address. Connect your own domain on plans that include it, with HTTPS set up for you." },
  { key: "seo", title: "SEO and analytics", body: "Edit page titles and descriptions, get a sitemap automatically, and follow sales, orders and conversion over time." },
];

export type CategoryCard = { industry: string; label: string; body: string };

/** Business categories shown on the home page. `industry` matches features/stores/industries. */
export const CATEGORY_CARDS: CategoryCard[] = [
  { industry: "fashion", label: "Clothing", body: "Sizes, colours and size guides." },
  { industry: "jewellery", label: "Jewellery", body: "Detailed imagery and collections." },
  { industry: "beauty", label: "Beauty", body: "Shades, ingredients and bundles." },
  { industry: "furniture", label: "Home décor", body: "Rooms, materials and dimensions." },
  { industry: "gourmet", label: "Food & bakery", body: "Gifting boxes and local delivery." },
  { industry: "electronics", label: "Electronics", body: "Specs, models and accessories." },
  { industry: "handicrafts", label: "Gifts & handicrafts", body: "Handmade stories and gifting." },
  { industry: "general", label: "Everything else", body: "Multi-category catalogues." },
];

export type Step = { title: string; body: string };

/** Mirrors the onboarding flow in app/onboarding (account, business, theme, plan, checklist). */
export const HOW_IT_WORKS: Step[] = [
  { title: "Create an account", body: "Sign up with your email or Google and confirm your email address." },
  { title: "Add your business details", body: "Enter your business name and category, and choose your store's web address." },
  { title: "Choose a theme", body: "Pick a design for your category. It's saved as a draft, so nothing goes live yet." },
  { title: "Add products and set up", body: "Add products, connect payments and set shipping rates from your dashboard." },
  { title: "Publish and start selling", body: "Preview your store, then publish it when you're ready for customers." },
];

export type DemoRow = { key: "products" | "theme" | "orders" | "domain"; eyebrow: string; title: string; body: string; points: string[] };

export const DEMO_ROWS: DemoRow[] = [
  {
    key: "products",
    eyebrow: "Products",
    title: "Add a product in minutes",
    body: "Write a title and description, add photos, then set price and stock for each variant.",
    points: ["Variants with their own price, SKU and stock", "Collections that fill themselves by rules", "CSV import and export for your whole catalogue"],
  },
  {
    key: "theme",
    eyebrow: "Design",
    title: "Make the store yours without code",
    body: "Change colours, fonts and sections in the theme editor and preview every change before customers see it.",
    points: ["Reorder, add or hide sections", "Separate desktop and mobile visibility", "Every publish is saved, so you can roll back"],
  },
  {
    key: "orders",
    eyebrow: "Orders",
    title: "Run orders from one dashboard",
    body: "See what needs packing, update tracking, and handle returns and refunds against the original order.",
    points: ["Stock reserved at checkout, so the last piece isn't sold twice", "GST invoices issued from each order", "Cash on delivery with your own PIN code rules"],
  },
  {
    key: "domain",
    eyebrow: "Domain",
    title: "Your name on the door",
    body: "Start on a free store address and connect your own domain when you're ready.",
    points: ["Free yourstore address from day one", "Step-by-step DNS records for your own domain", "HTTPS certificates issued automatically"],
  },
];

export type Faq = { question: string; answer: string };

export function buildFaqs(rootDomain: string, trialDays = 0): Faq[] {
  return [
    {
      question: "How do I set up my store?",
      answer:
        "Create an account, enter your business name and category, choose your store address and pick a theme. Then add products, connect payments and set shipping from your dashboard. Your store stays in draft until you publish it.",
    },
    {
      question: "Do I need a developer or designer?",
      answer: "No. Themes are edited visually: you change colours, fonts and sections, and preview desktop and mobile before publishing.",
    },
    {
      question: "Can I change my theme later?",
      answer: "Yes. Applying a new theme creates a draft that keeps your own text, images and products. Your live store changes only when you publish, and earlier versions can be restored.",
    },
    {
      question: "Can I use my own domain?",
      answer: `Every store gets a free address at yourstore.${rootDomain}. On plans that include custom domains you can connect a domain you own by adding the DNS records shown in your dashboard; HTTPS is set up automatically once it's verified.`,
    },
    {
      question: "How do payments work?",
      answer:
        "Online payments go to your own Razorpay, Cashfree or PayU account, which you connect in settings, so customers can pay by UPI, cards and netbanking. You can also offer cash on delivery with your own order limits and PIN code rules. Payments only work after you've connected an account or turned on COD.",
    },
    {
      question: "How does shipping work?",
      answer: "Set your own shipping rates and PIN code rules for delivery and COD, or connect a Delhivery account to book shipments (Shiprocket is also supported where it is enabled for your account). Customers can check delivery for their PIN code before ordering.",
    },
    {
      question: "Which plans are available?",
      answer:
        trialDays > 0
          ? `Plans differ in product, staff, storage and custom-domain limits; see the pricing page for details. New stores start with a ${trialDays}-day free trial. Plans can't be bought online yet, so you won't be asked for card details when you sign up.`
          : "Plans differ in product, staff, storage and custom-domain limits; see the pricing page for details. Plans can't be bought online yet, so you won't be asked for card details when you sign up.",
    },
    {
      question: "Can my team help run the store?",
      answer: "Yes. Invite staff with roles such as owner, admin, manager or viewer. Each role only sees and changes what it's allowed to.",
    },
  ];
}

export const FOOTER_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: FEATURES_HREF },
      { label: "Themes", href: THEMES_HREF },
      { label: "How it works", href: HOW_IT_WORKS_HREF },
      { label: "Pricing", href: PRICING_HREF },
    ],
  },
  {
    title: "Sellers",
    links: [
      { label: "Create your store", href: SIGNUP_HREF },
      { label: "Log in", href: LOGIN_HREF },
      { label: "Reset password", href: "/seller/forgot-password" },
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
