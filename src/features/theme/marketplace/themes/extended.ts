import type { IndustrySlug } from "@/features/stores/industries";
import type { HomeItem, MarketplaceTheme, ThemePreset, ThemeStyle } from "../types";

/**
 * Themes for the industries added on 2026-10-11 (migration 2700). Each industry gets five
 * structurally different themes built on five proven layout archetypes (the same compositions as
 * the pet and electronics sets), each with its own palette, type pairing and copy. They carry no
 * content slots: applying one re-uses the store's own sections of the same type, so they work for
 * stores without a showcase demo (demo: null → the marketplace shows the token mockup).
 */

const ADDED = "2026-10-11";

type Palette = [primary: string, secondary: string, accent: string, background: string, text: string, border: string, sale: string];
type Arch = "bold" | "premium" | "minimal" | "marketplace" | "conversion";
type Spec = { key: string; name: string; tagline: string; lead: string; bestFor: [string, string, string]; palette: Palette; heading?: string; body?: string };

const ARCH: Record<Arch, { style: ThemeStyle; heading: string; body: string; layout: string; features: string[]; build: (t: ThemePreset["tokens"]) => ThemePreset }> = {
  bold: {
    style: "bold",
    heading: "grotesk",
    body: "dm-sans",
    layout: "A scrolling offer strip, a big hero, round category bubbles, a product grid, square promo tiles, a social photo mosaic and a bestseller carousel.",
    features: ["Offer marquee", "Round category bubbles", "Photo mosaic", "Quick add"],
    build: (tokens) => ({
      tokens: { ...tokens, headingCase: "uppercase", buttonShape: "pill", buttonVariant: "solid", cardRadius: "lg", containerWidth: "wide", spacing: "comfortable", sectionHeadingAlign: "center" },
      header: { sticky: true, showStoreName: true, showWishlist: true },
      headerLayout: "logo-left",
      inlineMenu: true,
      menuStyle: "bar",
      announcementTone: "accent",
      announcementMode: "rotate",
      productCard: { imageRatio: "square", textAlign: "center", badgeStyle: "filled", showQuickAdd: true, showRating: false, showSizes: false, showBrand: false, secondImageOnHover: true },
      footerTone: "dark",
      hero: { align: "center", textTone: "light" },
      home: [
        ["Marquee", { size: "medium", speed: "normal", tone: "accent", separator: "star" }],
        ["Hero", { height: "large", overlay: 30, autoplay: 6 }],
        ["CategoryGrid", { mode: "manual", shape: "circle", limit: 6 }],
        ["ProductGrid", { limit: 8, columns: 4 }],
        ["PromoBanner", { aspect: "square" }],
        ["SocialProof", { layout: "mosaic", showProfile: false }],
        ["ProductCarousel", { limit: 10 }],
        ["Newsletter", { tone: "accent" }],
      ],
    }),
  },
  premium: {
    style: "premium",
    heading: "playfair",
    body: "humanist-sans",
    layout: "Centred logo, a full-screen hero, a brand story with numbers, curated collection tiles, a three-column edit, a dark editorial feature and a lookbook row.",
    features: ["Full-screen hero", "Brand story with stats", "Collection tiles", "Lookbook row"],
    build: (tokens) => ({
      tokens: { ...tokens, headingCase: "normal", buttonShape: "square", buttonVariant: "outline", cardRadius: "none", containerWidth: "default", spacing: "airy", sectionHeadingAlign: "center" },
      header: { sticky: false, showStoreName: true, showWishlist: true },
      headerLayout: "logo-center",
      inlineMenu: false,
      menuStyle: "bar",
      announcementTone: "dark",
      announcementMode: "static",
      productCard: { imageRatio: "portrait", textAlign: "center", badgeStyle: "minimal", showQuickAdd: false, showRating: false, showSizes: false, showBrand: false, secondImageOnHover: true },
      footerTone: "dark",
      hero: { align: "center", textTone: "light" },
      home: [
        ["Hero", { height: "full", overlay: 30, autoplay: 0 }],
        ["BrandStory", {}],
        ["CollectionGrid", { mode: "manual", columns: 3, limit: 3 }],
        ["ProductGrid", { limit: 6, columns: 3 }],
        ["EditorialImageText", { imagePosition: "right", tone: "dark" }],
        ["Lookbook", { layout: "row" }],
        ["Newsletter", { tone: "dark" }],
      ],
    }),
  },
  minimal: {
    style: "minimal",
    heading: "dm-sans",
    body: "dm-sans",
    layout: "A short hero, new arrivals first, an editorial note, a large two-column feature grid and an FAQ. Sharp cards, no badges and a light footer.",
    features: ["Short hero", "Two-column feature grid", "FAQ block", "Badge-free cards"],
    build: (tokens) => ({
      tokens: { ...tokens, headingCase: "normal", buttonShape: "rounded", buttonVariant: "solid", cardRadius: "none", containerWidth: "narrow", spacing: "airy", sectionHeadingAlign: "left" },
      header: { sticky: true, showStoreName: true, showWishlist: false },
      headerLayout: "logo-left",
      inlineMenu: true,
      menuStyle: "bar",
      announcementTone: "muted",
      announcementMode: "static",
      productCard: { imageRatio: "square", textAlign: "left", badgeStyle: "minimal", showBadges: false, showQuickAdd: false, showRating: false, showSizes: false, showBrand: false, secondImageOnHover: false },
      footerTone: "light",
      hero: { align: "left", textTone: "light" },
      home: [
        ["Hero", { height: "medium", overlay: 25, autoplay: 0 }],
        ["ProductGrid", { limit: 8, columns: 4 }],
        ["EditorialImageText", { imagePosition: "left", tone: "muted" }],
        ["ProductGrid", { limit: 4, columns: 2 }],
        ["FAQ", { limit: 6 }],
        ["Newsletter", { tone: "light" }],
      ],
    }),
  },
  marketplace: {
    style: "marketplace",
    heading: "modern-sans",
    body: "modern-sans",
    layout: "Full-width and compact: department tiles, five-column grids, a wide promo, a carousel, a scrolling brand strip and trust badges. Built for big catalogues and repeat shoppers.",
    features: ["Department tiles", "5-column grids", "Brand strip", "Trust badges"],
    build: (tokens) => ({
      tokens: { ...tokens, headingCase: "normal", buttonShape: "rounded", buttonVariant: "solid", cardRadius: "sm", containerWidth: "full", spacing: "compact", sectionHeadingAlign: "left" },
      header: { sticky: true, showStoreName: true, showWishlist: true },
      headerLayout: "logo-left",
      inlineMenu: false,
      menuStyle: "bar",
      announcementTone: "dark",
      announcementMode: "rotate",
      productCard: { imageRatio: "square", textAlign: "left", badgeStyle: "pill", showQuickAdd: true, showRating: false, showSizes: true, showBrand: true, secondImageOnHover: false },
      footerTone: "dark",
      hero: { align: "left", textTone: "light" },
      home: [
        ["Hero", { height: "medium", overlay: 30, autoplay: 5 }],
        ["CategoryGrid", { mode: "manual", shape: "square", limit: 6 }],
        ["ProductGrid", { limit: 10, columns: 5 }],
        ["PromoBanner", { aspect: "wide" }],
        ["ProductGrid", { limit: 10, columns: 5 }],
        ["ProductCarousel", { limit: 12 }],
        ["BrandStrip", { layout: "marquee", tone: "light" }],
        ["TrustBadges", { layout: "grid", tone: "muted" }],
      ],
      collection: [["TrustBadges", { layout: "marquee", tone: "muted" }], ["PageContent", {}]],
    }),
  },
  conversion: {
    style: "conversion",
    heading: "humanist-sans",
    body: "humanist-sans",
    layout: "Centred logo with a drawer menu, a coupon sale band up top, deal grids with discount pills, an add-on carousel, tall category cards and trust signals on every page.",
    features: ["Coupon sale band", "Discount pills", "Add-on carousel", "Trust strip on every page"],
    build: (tokens) => ({
      tokens: { ...tokens, headingCase: "normal", buttonShape: "square", buttonVariant: "solid", cardRadius: "md", containerWidth: "wide", spacing: "compact", sectionHeadingAlign: "center" },
      header: { sticky: true, showStoreName: true, showWishlist: true },
      headerLayout: "logo-center",
      inlineMenu: false,
      menuStyle: "drawer",
      announcementTone: "accent",
      announcementMode: "rotate",
      productCard: { imageRatio: "square", textAlign: "left", badgeStyle: "pill", showQuickAdd: true, showRating: false, showSizes: false, showBrand: false, secondImageOnHover: false },
      footerTone: "muted",
      hero: { align: "left", textTone: "light" },
      home: [
        ["Marquee", { size: "small", speed: "fast", tone: "dark", separator: "dot" }],
        ["SaleBanner", {}],
        ["ProductGrid", { limit: 8, columns: 4 }],
        ["Hero", { height: "medium", overlay: 35, autoplay: 5 }],
        ["ProductCarousel", { limit: 10 }],
        ["CategoryGrid", { mode: "manual", shape: "portrait", limit: 6 }],
        ["FAQ", { limit: 4 }],
        ["TrustBadges", { layout: "marquee", tone: "muted" }],
      ] satisfies HomeItem[],
      collection: [["PageContent", {}], ["TrustBadges", { layout: "marquee", tone: "muted" }]],
      product: [["PageContent", {}], ["ProductCarousel", { limit: 8 }], ["TrustBadges", { layout: "marquee", tone: "muted" }]],
    }),
  },
};

const ORDER: Arch[] = ["bold", "premium", "minimal", "marketplace", "conversion"];

function industry(slug: IndustrySlug, specs: [Spec, Spec, Spec, Spec, Spec]): MarketplaceTheme[] {
  return specs.map((s, i) => {
    const a = ARCH[ORDER[i]!];
    const [primary, secondary, accent, background, text, border, sale] = s.palette;
    const tokens = { colors: { primary, secondary, accent, background, text, border, sale }, headingFont: s.heading ?? a.heading, bodyFont: s.body ?? a.body };
    return {
      key: s.key,
      name: s.name,
      tagline: s.tagline,
      description: `${s.lead} ${a.layout}`,
      industry: slug,
      style: a.style,
      bestFor: [...s.bestFor],
      features: a.features,
      demo: null,
      version: "1.0.0",
      added: ADDED,
      preset: a.build(tokens),
    };
  });
}

export const EXTENDED_THEMES: MarketplaceTheme[] = [
  ...industry("eyewear", [
    { key: "frame-pop", name: "Frame Pop", tagline: "Bright frames, big attitude", lead: "Playful and colourful for fashion eyewear and sunglasses.", bestFor: ["Sunglasses", "Fashion frames", "Gen Z eyewear"], palette: ["#14213d", "#283d6b", "#fca311", "#fffaf0", "#14213d", "#efe3cc", "#e63946"] },
    { key: "optique-maison", name: "Optique Maison", tagline: "Handcrafted frames, quietly luxurious", lead: "A refined boutique look for acetate and titanium frames.", bestFor: ["Luxury frames", "Handmade acetate", "Optical boutiques"], palette: ["#1d1a17", "#4b4038", "#a8865b", "#f6f2ec", "#1d1a17", "#e2d8ca", "#9b3b2b"] },
    { key: "clear-sight", name: "Clear Sight", tagline: "Clean lines, easy choices", lead: "Minimal and calm, so every frame shape is easy to compare.", bestFor: ["Prescription glasses", "Blue-light glasses", "D2C eyewear"], palette: ["#0f2430", "#3e5866", "#4aa3c7", "#ffffff", "#0f2430", "#e6edf1", "#c94a3a"], heading: "geometric-sans" },
    { key: "lens-bazaar", name: "Lens Bazaar", tagline: "Every frame, lens and brand", lead: "A dense catalogue layout for multi-brand optical stores.", bestFor: ["Multi-brand optical", "Contact lenses", "Large catalogues"], palette: ["#0b3954", "#087e8b", "#ffd166", "#f2f6f9", "#0b2233", "#d9e4ec", "#d7263d"] },
    { key: "shade-sale", name: "Shade Sale", tagline: "Buy one, get one, every week", lead: "Offer-led for value eyewear with BOGO deals and add-on cases.", bestFor: ["BOGO offers", "Value sunglasses", "Festive sales"], palette: ["#3a0ca3", "#4361ee", "#4cc9f0", "#ffffff", "#1b1340", "#e4e1f5", "#f72585"] },
  ]),
  ...industry("fragrances", [
    { key: "scent-riot", name: "Scent Riot", tagline: "Loud notes, louder colours", lead: "A bold look for young perfume and body-mist brands.", bestFor: ["Body mists", "Deodorants", "Gift sets"], palette: ["#2b0a3d", "#5c1a7a", "#ff6f91", "#fff6fa", "#2b0a3d", "#f3dbe6", "#e0245e"] },
    { key: "oud-atelier", name: "Oud Atelier", tagline: "Dark, smoky, opulent", lead: "Gilded and dramatic for attars, oud and niche perfumery.", bestFor: ["Attar & oud", "Niche perfumery", "Luxury gifting"], palette: ["#1a120b", "#3c2a21", "#c9a227", "#f7f1e8", "#1a120b", "#e5d9c3", "#8c2f1b"] },
    { key: "white-musk", name: "White Musk", tagline: "Airy, clean and modern", lead: "Minimal and white for clean, modern fragrance labels.", bestFor: ["Clean fragrances", "Unisex scents", "Small collections"], palette: ["#222222", "#666666", "#b8a99a", "#ffffff", "#222222", "#eeeeee", "#b5452f"], heading: "didone" },
    { key: "perfume-hall", name: "Perfume Hall", tagline: "Every house, every note", lead: "A big-catalogue layout for multi-brand perfume retailers.", bestFor: ["Multi-brand perfumes", "Testers & minis", "Large catalogues"], palette: ["#102a43", "#334e68", "#d4a373", "#f5f7fa", "#102a43", "#dde3ea", "#c0392b"] },
    { key: "mist-deals", name: "Mist Deals", tagline: "Combos, minis and fast checkout", lead: "Conversion-first for combo packs and discovery sets.", bestFor: ["Combo packs", "Discovery sets", "Sale events"], palette: ["#5a189a", "#7b2cbf", "#2ec4b6", "#ffffff", "#240046", "#ece4f5", "#ef476f"] },
  ]),
  ...industry("home-decor", [
    { key: "nook-and-colour", name: "Nook & Colour", tagline: "Happy homes, bold accents", lead: "A cheerful look for cushions, vases and colourful decor.", bestFor: ["Cushions & throws", "Colourful decor", "Gifting"], palette: ["#264653", "#2a9d8f", "#e9c46a", "#fffbf2", "#1d3540", "#efe4cc", "#e76f51"] },
    { key: "brass-and-linen", name: "Brass & Linen", tagline: "Warm, crafted, collected", lead: "Editorial and premium for lighting, brassware and statement pieces.", bestFor: ["Lighting", "Brass decor", "Designer homes"], palette: ["#2e2a24", "#5e5346", "#b08d57", "#f8f4ec", "#2e2a24", "#e6dccb", "#a0432c"] },
    { key: "quiet-shelf", name: "Quiet Shelf", tagline: "Fewer things, chosen well", lead: "Minimal and gallery-like for considered objects.", bestFor: ["Ceramics", "Minimal decor", "Small studios"], palette: ["#1f1f1f", "#5c5c5c", "#9c8f80", "#fcfcfa", "#1f1f1f", "#ebe9e4", "#b5452f"], heading: "editorial-serif" },
    { key: "decor-depot", name: "Decor Depot", tagline: "Every room, one store", lead: "A dense department-store layout for big decor catalogues.", bestFor: ["Wall art & clocks", "Lighting & lamps", "Large catalogues"], palette: ["#1b3a4b", "#065a82", "#f4a259", "#f4f6f8", "#13293d", "#dce3e9", "#d1495b"] },
    { key: "festive-home", name: "Festive Home", tagline: "Diwali-ready, offer-ready", lead: "Offer-led for festive decor, diyas and lights.", bestFor: ["Diyas & lights", "Festive decor", "Seasonal sales"], palette: ["#7f1d1d", "#b91c1c", "#f59e0b", "#fffaf0", "#3b0d0d", "#f3e1c7", "#dc2626"] },
  ]),
  ...industry("kitchen", [
    { key: "spice-rack", name: "Spice Rack", tagline: "Colourful cookware, happy kitchens", lead: "Bright and playful for cookware and kitchen tools.", bestFor: ["Cookware", "Kitchen tools", "Gift sets"], palette: ["#3d405b", "#5f6283", "#f2cc8f", "#fffcf5", "#2b2d42", "#efe6d3", "#e07a5f"] },
    { key: "copper-and-clay", name: "Copper & Clay", tagline: "Traditional cookware, beautifully told", lead: "Premium and story-led for copper, brass, cast iron and clay.", bestFor: ["Copper & brass", "Cast iron", "Heritage cookware"], palette: ["#3b2418", "#6b4226", "#c27c4a", "#faf4ec", "#3b2418", "#ecdcc8", "#a33b20"] },
    { key: "white-plate", name: "White Plate", tagline: "Clean tableware, clear choices", lead: "Minimal and bright for dinnerware and serveware.", bestFor: ["Dinnerware", "Serveware", "D2C tableware"], palette: ["#202a2f", "#566870", "#86a8b5", "#ffffff", "#202a2f", "#e9eef0", "#c8553d"], heading: "geometric-sans" },
    { key: "kitchen-mart", name: "Kitchen Mart", tagline: "Everything for the kitchen", lead: "A big-catalogue layout for appliances, storage and tools.", bestFor: ["Small appliances", "Storage", "Large catalogues"], palette: ["#14342b", "#1f5c48", "#f6bd60", "#f3f7f5", "#0f241e", "#d8e5df", "#d64933"] },
    { key: "combo-kitchen", name: "Combo Kitchen", tagline: "Sets, combos and daily deals", lead: "Offer-led for cookware sets and kitchen combos.", bestFor: ["Cookware sets", "Combos", "Sale events"], palette: ["#9a031e", "#c1121f", "#fb8b24", "#ffffff", "#3d0a10", "#f5e1df", "#e36414"] },
  ]),
  ...industry("home-textiles", [
    { key: "print-pillow", name: "Print Pillow", tagline: "Block prints and bright beds", lead: "Pattern-forward for printed bedsheets, quilts and cushions.", bestFor: ["Printed bedsheets", "Quilts & dohars", "Cushion covers"], palette: ["#1e3a5f", "#3d5a80", "#ee964b", "#fffaf3", "#1e3a5f", "#efe2cf", "#d1495b"] },
    { key: "handloom-house", name: "Handloom House", tagline: "Woven, slow and luxurious", lead: "A premium story-led look for handloom linens and throws.", bestFor: ["Handloom linen", "Throws", "Luxury bedding"], palette: ["#2f2a25", "#5a5047", "#a68a64", "#f7f3ed", "#2f2a25", "#e4dacb", "#94412c"], heading: "marcellus" },
    { key: "soft-cotton", name: "Soft Cotton", tagline: "Plain, calm and easy", lead: "Minimal for solid-colour cotton bedding and towels.", bestFor: ["Solid bedsheets", "Towels", "D2C bedding"], palette: ["#283845", "#5d7385", "#a3c4bc", "#ffffff", "#283845", "#e8eef0", "#c2553f"], heading: "humanist-sans" },
    { key: "furnish-mart", name: "Furnish Mart", tagline: "Curtains to carpets", lead: "A dense department layout for curtains, rugs, mats and linen.", bestFor: ["Curtains", "Rugs & mats", "Large catalogues"], palette: ["#22333b", "#3e5c76", "#eab676", "#f4f6f7", "#1a262c", "#dbe2e6", "#c44536"] },
    { key: "linen-loot", name: "Linen Loot", tagline: "Sets, sales and free shipping", lead: "Conversion-first for bedding sets and seasonal sales.", bestFor: ["Bedding sets", "Seasonal sales", "Value brands"], palette: ["#5f0f40", "#9a031e", "#0f8b8d", "#ffffff", "#2b0a1d", "#f2e1ea", "#e36414"] },
  ]),
  ...industry("toys", [
    { key: "toy-box", name: "Toy Box", tagline: "Colour, giggles and play", lead: "Bright and bouncy for toys and games.", bestFor: ["Toys", "Board games", "Gifting"], palette: ["#1d3557", "#457b9d", "#ffb703", "#fffdf5", "#1d3557", "#f1e7cf", "#e63946"] },
    { key: "wooden-wonder", name: "Wooden Wonder", tagline: "Heirloom toys, slow play", lead: "Premium and warm for wooden, Montessori and handmade toys.", bestFor: ["Wooden toys", "Montessori", "Handmade toys"], palette: ["#3a2e22", "#6b5844", "#c08b5c", "#faf6ef", "#3a2e22", "#e9dfcf", "#a5482f"], heading: "classic-serif" },
    { key: "little-blocks", name: "Little Blocks", tagline: "Simple, safe and learning-first", lead: "Minimal and clear for STEM kits and learning toys.", bestFor: ["STEM kits", "Learning toys", "Puzzles"], palette: ["#1b2a41", "#324a5f", "#7fb7be", "#ffffff", "#1b2a41", "#e5ecef", "#d1495b"], heading: "geometric-sans" },
    { key: "toy-town", name: "Toy Town", tagline: "Every age, every aisle", lead: "A big-catalogue layout by age and category.", bestFor: ["Multi-brand toys", "Shop by age", "Large catalogues"], palette: ["#0d3b66", "#1d6fa3", "#f4d35e", "#f3f7fb", "#0b2545", "#d8e3ee", "#ee964b"] },
    { key: "party-pack", name: "Party Pack", tagline: "Return gifts and party deals", lead: "Offer-led for return gifts, party packs and combos.", bestFor: ["Return gifts", "Party packs", "Festive sales"], palette: ["#6a00f4", "#8b2fc9", "#00b4d8", "#ffffff", "#2a0a4a", "#ebe1f7", "#f72585"] },
  ]),
  ...industry("gifts", [
    { key: "gift-burst", name: "Gift Burst", tagline: "Surprise in every box", lead: "Joyful and bold for gift shops and hampers.", bestFor: ["Gift hampers", "Surprise boxes", "Occasion gifts"], palette: ["#3d0c45", "#6a1b7a", "#ff8fab", "#fff7fa", "#3d0c45", "#f3dce6", "#d7263d"] },
    { key: "keepsake-studio", name: "Keepsake Studio", tagline: "Personal, crafted, treasured", lead: "Premium and story-led for personalised keepsakes.", bestFor: ["Engraved gifts", "Keepsakes", "Wedding gifting"], palette: ["#2b2622", "#55493f", "#c2a27a", "#f9f5ef", "#2b2622", "#e7ddcf", "#9c3d2a"], heading: "didone" },
    { key: "name-tag", name: "Name Tag", tagline: "Make it yours, simply", lead: "Minimal and clear for personalised products made to order.", bestFor: ["Personalised mugs & frames", "Custom prints", "Made to order"], palette: ["#1e2d3b", "#4b6274", "#e0a458", "#ffffff", "#1e2d3b", "#e8edf1", "#c0392b"], heading: "humanist-sans" },
    { key: "gift-galaxy", name: "Gift Galaxy", tagline: "A gift for everyone", lead: "A big-catalogue layout by occasion, recipient and budget.", bestFor: ["Shop by occasion", "Corporate gifting", "Large catalogues"], palette: ["#14213d", "#22356f", "#e5989b", "#f5f6fa", "#10182e", "#dde1ec", "#e63946"] },
    { key: "rakhi-rush", name: "Rakhi Rush", tagline: "Festive gifting, delivered fast", lead: "Offer-led for festival gifting with same-day and combo offers.", bestFor: ["Rakhi & Diwali gifting", "Combos", "Express delivery"], palette: ["#b5179e", "#7209b7", "#ffbe0b", "#ffffff", "#3a0b3d", "#f2dff0", "#f3722c"] },
  ]),
  ...industry("plants", [
    { key: "leaf-party", name: "Leaf Party", tagline: "Plant joy for small spaces", lead: "Fresh and bold for indoor plants and planters.", bestFor: ["Indoor plants", "Planters", "Plant gifting"], palette: ["#1b4332", "#2d6a4f", "#ffd166", "#f9fbf4", "#1b4332", "#e3ecd9", "#e76f51"] },
    { key: "greenhouse-journal", name: "Greenhouse Journal", tagline: "Rare plants, told beautifully", lead: "Editorial and premium for rare plants and designer planters.", bestFor: ["Rare plants", "Designer planters", "Bonsai"], palette: ["#22311f", "#425a3c", "#a3b18a", "#f6f5ef", "#22311f", "#dfe2d2", "#9b4a2c"], heading: "editorial-serif" },
    { key: "potted", name: "Potted", tagline: "Simple care, happy plants", lead: "Minimal with a care-guide FAQ for first-time plant parents.", bestFor: ["Beginner plants", "Succulents", "Plant care"], palette: ["#283618", "#606c38", "#dda15e", "#fefae0", "#283618", "#ece6c8", "#bc6c25"] },
    { key: "garden-store", name: "Garden Store", tagline: "Seeds to tools", lead: "A big-catalogue layout for seeds, soil, tools and pots.", bestFor: ["Seeds & soil", "Garden tools", "Large catalogues"], palette: ["#0b3d2e", "#16634a", "#f2c14e", "#f2f7f4", "#0a2a20", "#d5e5dc", "#d1495b"] },
    { key: "plant-sale", name: "Plant Sale", tagline: "Combos, minis and free pots", lead: "Offer-led for plant combos and seasonal sales.", bestFor: ["Plant combos", "Free-pot offers", "Seasonal sales"], palette: ["#005f73", "#0a9396", "#94d2bd", "#ffffff", "#012a32", "#dcefec", "#ee9b00"] },
  ]),
  ...industry("pooja", [
    { key: "mandir-bright", name: "Mandir Bright", tagline: "Colourful, festive, devotional", lead: "Vibrant and festive for pooja essentials and decor.", bestFor: ["Pooja thalis", "Festival kits", "Rangoli & decor"], palette: ["#7a1f00", "#a33a00", "#ffb703", "#fffaf0", "#3d1300", "#f3e2c3", "#d00000"] },
    { key: "sacred-brass", name: "Sacred Brass", tagline: "Idols and brass, with reverence", lead: "Premium and calm for brass idols, lamps and temple decor.", bestFor: ["Brass idols", "Diyas & lamps", "Temple decor"], palette: ["#2a1d10", "#4f3a22", "#c9a227", "#f8f2e6", "#2a1d10", "#e8dcc2", "#9c2c1b"], heading: "marcellus" },
    { key: "pure-puja", name: "Pure Puja", tagline: "Simple, pure, everyday", lead: "Minimal for daily essentials like agarbatti, dhoop and ghee diyas.", bestFor: ["Agarbatti & dhoop", "Daily essentials", "Subscriptions"], palette: ["#3b2a1a", "#6e5235", "#e09f3e", "#fffdf8", "#3b2a1a", "#f0e6d6", "#9e2a2b"], heading: "humanist-sans" },
    { key: "spiritual-bazaar", name: "Spiritual Bazaar", tagline: "Every ritual, every festival", lead: "A big-catalogue layout by deity, ritual and festival.", bestFor: ["Shop by festival", "Rudraksha & malas", "Large catalogues"], palette: ["#4a0e0e", "#7a1e1e", "#f4a259", "#faf6f1", "#2e0808", "#eadbcf", "#c1121f"] },
    { key: "festival-kit", name: "Festival Kit", tagline: "Complete kits, delivered on time", lead: "Offer-led for festival kits with delivery-date promises.", bestFor: ["Diwali & Navratri kits", "Combos", "Express delivery"], palette: ["#9d0208", "#dc2f02", "#ffba08", "#ffffff", "#370617", "#f8e1d4", "#e85d04"] },
  ]),
  ...industry("tools", [
    { key: "torque", name: "Torque", tagline: "Tough tools, bold look", lead: "High-contrast and punchy for power tools and accessories.", bestFor: ["Power tools", "Accessories", "DIY brands"], palette: ["#111111", "#333333", "#ffc300", "#fafafa", "#111111", "#e5e5e5", "#d62828"] },
    { key: "craftsman-co", name: "Craftsman Co.", tagline: "Built to last a lifetime", lead: "Premium and story-led for professional hand tools.", bestFor: ["Hand tools", "Woodworking", "Professional kits"], palette: ["#2b2d2f", "#4a4e52", "#b5835a", "#f5f3ef", "#2b2d2f", "#e1ddd5", "#a63d2a"], heading: "classic-serif" },
    { key: "spec-sheet", name: "Spec Sheet", tagline: "Specs first, no noise", lead: "Minimal and specification-led for technical buyers.", bestFor: ["Measuring tools", "Fasteners", "Technical buyers"], palette: ["#1c2833", "#566573", "#5dade2", "#ffffff", "#1c2833", "#e5e8ea", "#cb4335"], heading: "geometric-sans" },
    { key: "hardware-hub", name: "Hardware Hub", tagline: "Every part, in stock", lead: "A dense catalogue layout for hardware, electricals and plumbing.", bestFor: ["Hardware & sanitary", "Electricals", "B2B & trade"], palette: ["#003049", "#0b5e8a", "#fcbf49", "#f2f5f8", "#00202f", "#d7e0e8", "#d62828"] },
    { key: "tool-deals", name: "Tool Deals", tagline: "Kits, combos and bulk prices", lead: "Offer-led for tool kits and bulk discounts.", bestFor: ["Tool kits", "Bulk offers", "Sale events"], palette: ["#e85d04", "#f48c06", "#1d3557", "#ffffff", "#2b1406", "#f6e2d3", "#d00000"] },
  ]),
  ...industry("music", [
    { key: "amp-up", name: "Amp Up", tagline: "Loud, bright and on stage", lead: "Bold for guitars, keyboards and gear for young musicians.", bestFor: ["Guitars", "Keyboards", "Beginner gear"], palette: ["#10002b", "#240046", "#ff9e00", "#fbf8ff", "#10002b", "#e6def3", "#ff006e"] },
    { key: "raga-house", name: "Raga House", tagline: "Classical instruments, crafted", lead: "Premium and story-led for sitars, tablas, harmoniums and veenas.", bestFor: ["Indian classical", "Handcrafted instruments", "Collectors"], palette: ["#2d1b12", "#5b3a29", "#c8963e", "#faf5ec", "#2d1b12", "#e9dcc6", "#9b2c1d"], heading: "marcellus" },
    { key: "studio-white", name: "Studio White", tagline: "Clean gear for clean sound", lead: "Minimal for studio, audio and recording gear.", bestFor: ["Studio gear", "Microphones", "Audio interfaces"], palette: ["#1b1b1e", "#4f4f56", "#7f7fd5", "#ffffff", "#1b1b1e", "#e7e7ea", "#d1495b"], heading: "geometric-sans" },
    { key: "music-mart", name: "Music Mart", tagline: "Strings to drums to DJ", lead: "A big-catalogue layout for multi-brand music stores.", bestFor: ["Multi-brand", "Accessories & strings", "Large catalogues"], palette: ["#03045e", "#0353a4", "#ffd60a", "#f3f5fa", "#020238", "#d9deee", "#e63946"] },
    { key: "gig-deals", name: "Gig Deals", tagline: "Starter kits and combos", lead: "Offer-led for beginner kits and accessory bundles.", bestFor: ["Starter kits", "Bundles", "Festive offers"], palette: ["#6a040f", "#9d0208", "#48cae4", "#ffffff", "#2c0306", "#f3dfe0", "#f48c06"] },
  ]),
  ...industry("art", [
    { key: "canvas-pop", name: "Canvas Pop", tagline: "Colourful art for every wall", lead: "Vibrant and bold for prints, posters and wall art.", bestFor: ["Posters & prints", "Wall art", "Young collectors"], palette: ["#22223b", "#4a4e69", "#f2a65a", "#fffaf3", "#22223b", "#ece3d4", "#e63946"] },
    { key: "gallery-noir", name: "Gallery Noir", tagline: "Original works, gallery presentation", lead: "Dark and premium for original paintings and limited editions.", bestFor: ["Original paintings", "Limited editions", "Artists' studios"], palette: ["#121212", "#2e2e2e", "#bfa181", "#f5f2ed", "#121212", "#dedad3", "#a13d2d"], heading: "didone" },
    { key: "white-wall", name: "White Wall", tagline: "Let the work speak", lead: "Gallery-white and minimal for an artist's own shop.", bestFor: ["Artist portfolios", "Prints on demand", "Ceramics & sculpture"], palette: ["#1a1a1a", "#555555", "#8c7b6b", "#ffffff", "#1a1a1a", "#ececec", "#b5452f"], heading: "editorial-serif" },
    { key: "art-supply-co", name: "Art Supply Co.", tagline: "Paints, paper and every brush", lead: "A big-catalogue layout for art and craft supplies.", bestFor: ["Art supplies", "Craft materials", "Large catalogues"], palette: ["#073b4c", "#118ab2", "#ffd166", "#f4f8fa", "#052a36", "#d5e6ec", "#ef476f"] },
    { key: "print-drop", name: "Print Drop", tagline: "Limited drops, fast checkout", lead: "Offer-led for limited print drops and bundles.", bestFor: ["Print drops", "Bundles", "Collectibles"], palette: ["#540d6e", "#7b1fa2", "#3bceac", "#ffffff", "#22052c", "#ecdff1", "#ee4266"] },
  ]),
  ...industry("beverages", [
    { key: "chai-pop", name: "Chai Pop", tagline: "Masala, colour and character", lead: "Bold and happy for flavoured teas and instant mixes.", bestFor: ["Flavoured chai", "Instant mixes", "Gift tins"], palette: ["#3c1518", "#69140e", "#f2a541", "#fff8ef", "#3c1518", "#f0e0cc", "#d00000"] },
    { key: "estate-reserve", name: "Estate Reserve", tagline: "Single estate, slow sipped", lead: "Premium and story-led for single-estate tea and specialty coffee.", bestFor: ["Single-estate tea", "Specialty coffee", "Gifting"], palette: ["#1f2a1c", "#3d4f36", "#b89b5e", "#f7f4ec", "#1f2a1c", "#e2ddcc", "#8f3b25"], heading: "playfair" },
    { key: "pour-over", name: "Pour Over", tagline: "Clean, precise, coffee-first", lead: "Minimal with brew guides for coffee roasters.", bestFor: ["Coffee roasters", "Brew gear", "Subscriptions"], palette: ["#2b2118", "#5c4a3d", "#c08552", "#fffdf9", "#2b2118", "#eee6dc", "#a4372b"], heading: "dm-sans" },
    { key: "sip-store", name: "Sip Store", tagline: "Tea, coffee, juices and more", lead: "A big-catalogue layout for multi-brand beverages.", bestFor: ["Multi-brand beverages", "Health drinks", "Large catalogues"], palette: ["#14213d", "#264a7a", "#fca311", "#f4f6fa", "#0d1528", "#d9dfeb", "#e63946"] },
    { key: "brew-deals", name: "Brew Deals", tagline: "Subscribe and save", lead: "Offer-led for packs, combos and subscribe-and-save.", bestFor: ["Combo packs", "Subscribe & save", "Sale events"], palette: ["#6f1d1b", "#99582a", "#43aa8b", "#ffffff", "#2d0c0b", "#f1e3da", "#bb3e03"] },
  ]),
  ...industry("sweets", [
    { key: "mithai-mela", name: "Mithai Mela", tagline: "Sweet, bright and festive", lead: "Joyful and bold for mithai shops and festive boxes.", bestFor: ["Mithai", "Festive boxes", "Gifting"], palette: ["#5a0001", "#8d0801", "#ffb30f", "#fffaf0", "#3a0000", "#f4e2c4", "#d00000"] },
    { key: "royal-halwai", name: "Royal Halwai", tagline: "Heritage recipes since forever", lead: "Premium and story-led for heritage sweet houses.", bestFor: ["Heritage sweet houses", "Dry-fruit sweets", "Premium gifting"], palette: ["#2c1a0e", "#55361d", "#d4a017", "#faf4e6", "#2c1a0e", "#ebdcbd", "#9c2a1c"], heading: "marcellus" },
    { key: "snack-shelf", name: "Snack Shelf", tagline: "Crunchy, clean, simple", lead: "Minimal for namkeen, chips and healthy snacks.", bestFor: ["Namkeen", "Healthy snacks", "D2C snack brands"], palette: ["#283618", "#4f6228", "#f4a261", "#fffdf6", "#283618", "#ece8d6", "#d1495b"], heading: "geometric-sans" },
    { key: "namkeen-bazaar", name: "Namkeen Bazaar", tagline: "Every snack from every region", lead: "A big-catalogue layout for regional snacks and sweets.", bestFor: ["Regional snacks", "Multi-brand", "Large catalogues"], palette: ["#7f4f24", "#936639", "#ffd166", "#f8f5f0", "#3d2610", "#e7dccb", "#d62828"] },
    { key: "sweet-deals", name: "Sweet Deals", tagline: "Combos, boxes and free delivery", lead: "Offer-led for combo boxes and festive sales.", bestFor: ["Combo boxes", "Festive sales", "Corporate orders"], palette: ["#c9184a", "#a4133c", "#ffb703", "#ffffff", "#4c0519", "#f6dde4", "#ff4d6d"] },
  ]),
  ...industry("mobile-accessories", [
    { key: "case-crush", name: "Case Crush", tagline: "Covers with character", lead: "Bold and trendy for phone covers and skins.", bestFor: ["Phone covers", "Skins", "Gen Z buyers"], palette: ["#0d1b2a", "#1b263b", "#00f5d4", "#f7f9fb", "#0d1b2a", "#dfe6ec", "#f15bb5"] },
    { key: "carbon-leather", name: "Carbon & Leather", tagline: "Premium protection", lead: "Premium for leather cases, MagSafe and desk accessories.", bestFor: ["Leather cases", "MagSafe", "Desk setups"], palette: ["#1c1c1c", "#3a3a3a", "#a67c52", "#f4f2ef", "#1c1c1c", "#dddad5", "#9e3b2c"], heading: "didone" },
    { key: "plug-play", name: "Plug & Play", tagline: "The right cable, simply", lead: "Minimal and spec-led for chargers, cables and adapters.", bestFor: ["Chargers & cables", "Adapters", "Power banks"], palette: ["#14213d", "#3f4e6b", "#4ea8de", "#ffffff", "#14213d", "#e5e9f0", "#e63946"], heading: "dm-sans" },
    { key: "gadget-galli", name: "Gadget Galli", tagline: "Every accessory, every model", lead: "A dense catalogue by phone model and accessory type.", bestFor: ["Shop by model", "Laptop accessories", "Large catalogues"], palette: ["#03071e", "#1d3557", "#ffba08", "#f2f4f8", "#03071e", "#d7dce6", "#dc2f02"] },
    { key: "flash-accessories", name: "Flash Accessories", tagline: "Deals under ₹499", lead: "Offer-led for flash sales and add-on accessories.", bestFor: ["Flash sales", "Budget accessories", "Combos"], palette: ["#3a0ca3", "#480ca8", "#06d6a0", "#ffffff", "#1a0549", "#e3dcf4", "#f72585"] },
  ]),
  ...industry("ayurveda", [
    { key: "tulsi-tone", name: "Tulsi Tone", tagline: "Fresh, green and friendly", lead: "Bright and friendly for herbal teas, juices and daily wellness.", bestFor: ["Herbal teas", "Juices", "Daily wellness"], palette: ["#2d4a22", "#4f772d", "#ecb22e", "#fbfdf6", "#1f3317", "#e3ebd5", "#c0392b"] },
    { key: "vaidya-house", name: "Vaidya House", tagline: "Classical formulations, told with care", lead: "Premium and story-led for classical Ayurvedic brands.", bestFor: ["Classical formulations", "Ayurvedic oils", "Heritage brands"], palette: ["#2b2414", "#544628", "#b8963e", "#f8f4e8", "#2b2414", "#e6dcc0", "#8f3a1f"], heading: "marcellus" },
    { key: "herb-and-root", name: "Herb & Root", tagline: "Pure, simple, transparent", lead: "Minimal with an ingredient FAQ for clean herbal brands.", bestFor: ["Herbal powders", "Clean labels", "D2C brands"], palette: ["#283d3b", "#4d6a67", "#c4a35a", "#fffef9", "#283d3b", "#e9ebe4", "#b5452f"], heading: "humanist-sans" },
    { key: "wellness-bazaar", name: "Wellness Bazaar", tagline: "Every herb, every need", lead: "A big-catalogue layout by health concern and brand.", bestFor: ["Shop by concern", "Multi-brand", "Large catalogues"], palette: ["#1b4332", "#2d6a4f", "#f9c74f", "#f3f8f5", "#10291f", "#d6e6dc", "#d62828"] },
    { key: "immunity-kit", name: "Immunity Kit", tagline: "Kits, combos and refills", lead: "Offer-led for wellness kits and monthly refills.", bestFor: ["Wellness kits", "Refills", "Seasonal offers"], palette: ["#386641", "#6a994e", "#f2e8cf", "#ffffff", "#1c3320", "#e2ecd9", "#bc4749"] },
  ]),
];
