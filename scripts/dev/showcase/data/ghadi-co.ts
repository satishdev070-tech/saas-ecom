import type { ShowcaseSpec, ShowProduct } from "../types";

const CARE = "Wipe with a soft, dry cloth after wear. Keep away from strong magnets, perfume and harsh chemicals. Store in its box when not in use.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "9102", care: CARE, type: "accessory", brand: "Ghadi & Co", ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;
const tile = (kind: "category" | "collection", slugs: string[]) =>
  slugs.map((c) => ({ id: `$${kind}:${c}`, imagePath: kind === "category" ? `$catimg:${c}` : `$colimg:${c}`, label: "" }));
const LEATHER = "Wipe with a soft dry cloth. Keep away from water, perfume and direct heat. Condition the leather every few months and let it air out after wear.";
const WATCH_CARE = "Wipe the case and strap with a soft dry cloth after wear. Avoid hot showers and saunas even if the watch is water resistant, and keep it away from strong magnets. Have the gaskets checked every two years.";
const AUTO_CARE = "Wear daily or keep on a winder to stay running. Wind by hand 20–30 turns if it stops. Avoid strong magnets and hard knocks, and have it serviced every 4–5 years.";

const SOCIAL = [1, 3, 2, 8, 12, 0, 17, 6, 21];
const LOOKS = [7, 9, 12, 16, 0, 5];

const spec: ShowcaseSpec = {
  slug: "ghadi-co",
  name: "Ghadi & Co",
  industry: "watches",
  owner: "Rohan Mehra",
  theme: "chrono-noir",
  tagline: "Automatic, chronograph, everyday and pocket watches, with watch boxes and gentlemen's accessories",
  story: [
    "Ghadi & Co started at a single repair counter in Mumbai's Fort district, where my grandfather fixed pocket watches and wall clocks for forty years. I grew up oiling movements and changing straps after school, and learnt that a good watch is mostly honest engineering and a strap that fits.",
    "Today we design our own watches in Mumbai: sapphire or hardened mineral glass, stainless-steel cases, proven quartz and automatic movements, and water-resistance ratings we test ourselves. Every watch is regulated and checked at our counter before it ships, and we still change straps and batteries for free.",
  ],
  email: "hello@ghadico.test",
  phone: "+91 22 4971 2280",
  address: { line1: "14 Rampart Row, Kala Ghoda, Fort", city: "Mumbai", state: "Maharashtra", postal_code: "400001" },
  legalName: "Ghadi and Company Private Limited",
  seo: { title: "Ghadi & Co — Automatic, chronograph & analogue watches", description: "Automatic, chronograph and analogue watches designed in Mumbai, plus pocket watches, watch boxes, cufflinks, sunglasses, wallets and pens. 2-year warranty, free strap fitting." },
  announcement: ["2-year warranty on every watch", "Free strap sizing and fitting", "Free shipping on orders above ₹999"],
  categories: [
    { slug: "analogue", name: "Analogue Watches", description: "Everyday quartz watches with clean dials and leather, mesh or steel straps." },
    { slug: "automatic", name: "Automatic Watches", description: "Self-winding mechanical watches with display backs and real power reserve." },
    { slug: "chronograph", name: "Chronographs", description: "Stopwatch dials for drivers, pilots and anyone who likes to time things." },
    { slug: "pocket", name: "Pocket Watches", description: "Hunter and open-face pocket watches with chains and fobs." },
    { slug: "boxes", name: "Watch Boxes", description: "Boxes, rolls and winders to store, travel with and keep watches running." },
    { slug: "cufflinks", name: "Cufflinks", description: "Polished steel and silver cufflinks for weddings and the office." },
    { slug: "eyewear", name: "Sunglasses", description: "UV400 sunglasses with metal and acetate frames." },
    { slug: "leather", name: "Wallets", description: "Full-grain leather wallets and card holders." },
    { slug: "pens", name: "Pens", description: "Fountain and rollerball pens for the desk and the pocket." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "The watches and accessories our customers come back for." },
    { slug: "gift-edit", title: "The gift edit", description: "Boxed, engraved and ready to give: for weddings, birthdays and promotions." },
    { slug: "desk-to-dinner", title: "Desk to dinner", description: "Slim dress watches, cufflinks and pens for the office and after." },
    { slug: "weekend", title: "Weekend & sport", description: "Divers, chronographs and sunglasses for the road, the sea and the track." },
    { slug: "gifts-under-2999", title: "Under ₹2,999", description: "Everyday watches, wallets, pens and cufflinks that fit any budget." },
  ],
  menu: [
    { title: "Watches", to: "/collections/bestsellers", children: [{ title: "Automatic", to: "/categories/automatic" }, { title: "Chronographs", to: "/categories/chronograph" }, { title: "Analogue", to: "/categories/analogue" }] },
    { title: "Pocket Watches", to: "/categories/pocket" },
    { title: "Accessories", to: "/categories/cufflinks", children: [{ title: "Watch Boxes", to: "/categories/boxes" }, { title: "Cufflinks", to: "/categories/cufflinks" }, { title: "Sunglasses", to: "/categories/eyewear" }, { title: "Wallets", to: "/categories/leather" }, { title: "Pens", to: "/categories/pens" }] },
    { title: "The gift edit", to: "/collections/gift-edit" },
    { title: "Under ₹2,999", to: "/collections/gifts-under-2999" },
  ],
  faqs: [
    ["What is the difference between quartz and automatic?", "A quartz watch runs on a battery and keeps time to within a few seconds a month. An automatic is mechanical: a weighted rotor winds the mainspring as you move your wrist, and it keeps time to within roughly −10 to +20 seconds a day. Automatics need no battery but should be worn regularly or kept on a winder."],
    ["What does the water-resistance rating mean?", "3 ATM (30 m) handles splashes and rain only. 5 ATM (50 m) is fine for hand-washing and a quick swim. 10 ATM (100 m) and above suit swimming and snorkelling, and 20 ATM (200 m) suits recreational diving. Never press the pushers or crown under water."],
    ["Will the watch fit my wrist?", "Leather and nylon straps fit wrists from about 15 to 20 cm. Steel bracelets are sized for 19 cm and we remove links to your measurement for free before shipping: just add your wrist size in the order note."],
    ["What does the warranty cover?", "Every watch has a 2-year warranty against manufacturing defects in the movement and case. It doesn't cover glass breakage, straps, batteries, water damage from unscrewed crowns or normal wear."],
    ["Can I engrave a case back?", "Yes. Most of our watches have a flat steel case back that can be engraved with up to 30 characters for ₹499. Engraved watches can't be returned, so please check the spelling carefully."],
    ["How long does delivery take?", "Metro cities in 2–4 working days, the rest of India in 4–7. Every watch ships insured in its box. Orders above ₹999 ship free; cash on delivery is available up to ₹10,000."],
  ],
  shippingNote: "Free insured shipping on orders above ₹999, otherwise ₹79. Metro cities in 2–4 working days, the rest of India in 4–7. Cash on delivery up to ₹10,000. Every watch ships in its presentation box.",
  returnsNote: "Unworn watches and accessories with protective films and tags can be returned within 10 days of delivery. Engraved and resized items can't be returned. Anything that arrives faulty is repaired or replaced free under the 2-year warranty.",
  images: {
    hero: { q: "man wearing watch", pick: [0] },
    hero2: { q: "watch time", pick: [5] },
    story: { q: "vintage watch", pick: [5] },
    feature: { q: "pocket watch", pick: [14] },
    "feature-2": { q: "watch", pick: [3] },
    "promo-a": { q: "watch strap", pick: [1] },
    "promo-b": { q: "groom", pick: [1] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "HERO_ALT", eyebrow: "Designed in Mumbai", heading: "Time, well made", subheading: "Automatic and quartz watches with sapphire glass and a 2-year warranty.", ctaLabel: "Shop automatics", ctaHref: "/categories/automatic" },
          { imagePath: "$img:hero2", alt: "HERO2_ALT", eyebrow: "The gift edit", heading: "Gifts that keep ticking", subheading: "Watches, cufflinks and pens, boxed and ready to give.", ctaLabel: "Shop gifts", ctaHref: "/collections/gift-edit" },
        ],
      },
    ],
    marquee: ["Marquee", { items: [{ text: "2-year warranty" }, { text: "Free strap fitting" }, { text: "Sapphire & mineral glass" }, { text: "Insured shipping" }, { text: "Cash on delivery" }] }],
    categories: ["CategoryGrid", { eyebrow: "Browse", heading: "Shop by category", mode: "manual", items: tile("category", ["automatic", "analogue", "pocket", "boxes", "cufflinks", "eyewear", "leather", "pens"]) }],
    collections: ["CollectionGrid", { eyebrow: "Curated", heading: "Edits for every wrist", mode: "manual", items: tile("collection", ["desk-to-dinner", "weekend", "gift-edit"]) }],
    automatics: ["ProductGrid", { eyebrow: "Mechanical", heading: "The automatic edit", subheading: "Self-winding movements, display backs, no batteries.", source: "category", categoryId: "$category:automatic", viewAllHref: "/categories/automatic" }],
    sport: ["ProductGrid", { eyebrow: "Weekend & sport", heading: "Built for the road and the sea", subheading: "Divers, chronographs and sunglasses.", source: "collection", collectionId: "$collection:weekend", viewAllHref: "/collections/weekend" }],
    pocket: ["ProductCarousel", { eyebrow: "Old school", heading: "Pocket watches", subheading: "Hunter and open-face, for waistcoats, sherwanis and gifting.", source: "category", categoryId: "$category:pocket", viewAllHref: "/categories/pocket" }],
    accessories: ["ProductGrid", { eyebrow: "Beyond the wrist", heading: "Gentlemen's accessories", source: "collection", collectionId: "$collection:desk-to-dinner", viewAllHref: "/collections/desk-to-dinner" }],
    bestsellers: ["ProductCarousel", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    new: ["ProductGrid", { eyebrow: "Just in", heading: "New arrivals", source: "newest", viewAllHref: "/collections" }],
    deals: ["ProductGrid", { eyebrow: "Limited time", heading: "Today's offers", source: "sale", viewAllHref: "/collections" }],
    gifts: ["ProductCarousel", { eyebrow: "Add a little extra", heading: "Gifts under ₹2,999", subheading: "Watches, wallets, pens and cufflinks.", source: "collection", collectionId: "$collection:gifts-under-2999", viewAllHref: "/collections/gifts-under-2999" }],
    story: [
      "BrandStory",
      { eyebrow: "Since 1968", heading: "From a repair counter in Fort", body: "My grandfather opened a watch-repair counter on Rampart Row in 1968. Three generations later we design our own watches, but every one still passes across that counter: regulated, pressure-tested and checked by hand before it ships. And we still change straps and batteries for free.", imagePath: "$img:story", alt: "STORY_ALT", stats: [{ value: "1968", label: "Our first repair counter" }, { value: "2 years", label: "Warranty on every watch" }, { value: "100%", label: "Pressure-tested before shipping" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "FEATURE_ALT", eyebrow: "Inside the case", heading: "Every movement crosses our counter", body: "Before a watch ships, we open it up, check the gear train, regulate the balance wheel and pressure-test the case. An automatic's rotor winds the mainspring as your wrist moves; wear it for a day and it runs for around 40 hours off the wrist.", ctaLabel: "Shop automatics", ctaHref: "/categories/automatic" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "FEATURE2_ALT", eyebrow: "Fit guide", heading: "Find your case size", body: "Measure your wrist with a soft tape. Under 16 cm, a 36–38 mm case sits best; 16–18 cm suits 39–41 mm; above 18 cm, try 42 mm and up. The lugs should never overhang the edge of your wrist.", ctaLabel: "Shop analogue watches", ctaHref: "/categories/analogue" },
    ],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "PROMOA_ALT", heading: "Everyday watches", text: "Clean dials from ₹2,799, sized free.", ctaLabel: "Shop analogue", ctaHref: "/categories/analogue" },
          { imagePath: "$img:promo-b", alt: "PROMOB_ALT", heading: "Wedding season", text: "Cufflinks, pens and dress watches to gift.", ctaLabel: "Shop the gift edit", ctaHref: "/collections/gift-edit" },
        ],
      },
    ],
    social: ["SocialProof", { heading: "Ghadi & Co on the wrist", subheading: "Our watches, out in the world.", handle: "", posts: SOCIAL.map((i) => ({ imagePath: `$product:${i}`, alt: "", href: "" })), showProfile: false }],
    lookbook: ["Lookbook", { eyebrow: "Up close", heading: "Dials, cases and details", looks: LOOKS.map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    sale: ["SaleBanner", { eyebrow: "Festive sale", heading: "Up to 20% off automatics & chronographs", subheading: "Use code TICKTOCK for an extra 10% off orders above ₹4,999.", ctaLabel: "Shop the offers", ctaHref: "/collections", background: "#7a1022", textColor: "#fff8ec" }],
    brands: ["BrandStrip", { eyebrow: "House ranges", heading: "", items: ["Ghadi Automatic", "Ghadi Chrono", "Ghadi Everyday", "Ghadi Leather", "Ghadi Desk"].map((name) => ({ name, imagePath: "", href: "" })) }],
    trust: [
      "TrustBadges",
      {
        items: [
          { icon: "secure", title: "2-year warranty", text: "On every watch movement and case" },
          { icon: "return", title: "10-day returns", text: "On unworn watches and accessories" },
          { icon: "cod", title: "Cash on delivery", text: "Up to ₹10,000" },
          { icon: "truck", title: "Insured shipping", text: "Free on orders above ₹999" },
        ],
      },
    ],
    faq: ["FAQ", { heading: "Good to know", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "The Ghadi letter, once a month", subheading: "New releases, care tips and early access to sales. No spam.", buttonLabel: "Subscribe" }],
  },
  products: [
    // ---- Analogue (quartz)
    p({ title: "Teakwood Analogue Watch", category: "analogue", price: 3999, mrp: 4799, options: [["Case size", ["36 mm", "42 mm"]]], short: "A light, natural teak-wood case with a cream dial and a tan leather strap.", description: desc("Our lightest watch: the case is carved from solid teak and sealed with a natural oil finish, so every piece has its own grain. A cream dial with slim hands keeps it easy to read, and the tan leather strap softens with wear. Popular as a matching pair.", ["Solid teak case, hypoallergenic and very light", "Japanese quartz movement, battery included", "Tan vegetable-tanned leather strap"]), specs: [["Case size", "36 mm or 42 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "3 ATM (splash-proof)"], ["Strap", "Tan leather, 18 / 20 mm"], ["Glass", "Hardened mineral"], ["Case material", "Teak wood"]], care: "Keep the wooden case dry and away from perfume. Wipe with a soft dry cloth; a drop of olive oil once a year restores the finish.", tags: ["wood", "quartz", "gift"], collections: ["bestsellers", "gift-edit"], featured: true, weightGrams: 180, img: { q: "leather watch", pick: [2] } }),
    p({ title: "Rose Gold Link Bracelet Watch", category: "analogue", price: 4499, mrp: 5299, short: "A slim 34 mm rose-gold-tone watch with a white dial and a link bracelet.", description: desc("A slim, everyday dress watch in rose-gold-tone stainless steel. The white sunray dial has fine baton markers, and the five-link bracelet closes with a hidden butterfly clasp.", ["Rose-gold-tone PVD over stainless steel", "Hidden butterfly clasp", "Bracelet sized free for your wrist"]), specs: [["Case size", "34 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "5 ATM (50 m)"], ["Strap", "Rose-gold-tone link bracelet"], ["Glass", "Sapphire-coated mineral"], ["Thickness", "7.5 mm"]], care: WATCH_CARE, tags: ["rose-gold", "quartz", "dress"], collections: ["gift-edit", "desk-to-dinner"], weightGrams: 210, img: { q: "wrist watch", pick: [15] } }),
    p({ title: "Blush Leather Ladies Watch", category: "analogue", price: 2999, mrp: 3499, options: [["Strap", ["Blush|#e8c4b8", "Black|#1d1d1d"]]], short: "A 36 mm white-dial watch with a rose-gold-tone case and a blush leather strap.", description: desc("A clean white dial with slim rose-gold-tone hands and markers, a 36 mm case and a soft blush leather strap. Light enough to wear all day, simple enough to stack with bracelets.", ["Rose-gold-tone stainless-steel case", "Quick-release strap pins", "Soft blush Italian leather"]), specs: [["Case size", "36 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "3 ATM (splash-proof)"], ["Strap", "Blush or black leather, 18 mm"], ["Glass", "Hardened mineral"]], care: WATCH_CARE, tags: ["ladies", "quartz", "rose-gold"], collections: ["gift-edit"], weightGrams: 90, img: { q: "dress watch", pick: [1] } }),
    p({ title: "Matte Black Minimal Watch", category: "analogue", price: 2799, short: "A 40 mm matte black case, a black dial and a black leather strap.", description: desc("Black on black, with nothing extra: a matte IP-coated case, a black dial with thin silver hands and a soft black leather strap. Pairs with anything you own.", ["Matte black IP-coated steel case", "No numerals, no date: just time", "Black leather strap"]), specs: [["Case size", "40 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "3 ATM (splash-proof)"], ["Strap", "Black leather, 20 mm"], ["Glass", "Hardened mineral"]], care: WATCH_CARE, tags: ["black", "quartz", "minimal"], collections: ["gifts-under-2999", "bestsellers"], weightGrams: 100, img: { q: "watch", pick: [13] } }),
    p({ title: "Slate Dial Leather Watch", category: "analogue", price: 2799, mrp: 3299, short: "A thin, slate-grey dial dress watch on a black leather strap.", description: desc("Our simplest dress watch: a 40 mm polished case only 6.8 mm thin, a slate-grey dial with slim hands and a soft black leather strap. It slips under a shirt cuff.", ["Only 6.8 mm thin", "Polished stainless-steel case", "Genuine leather strap"]), specs: [["Case size", "40 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "3 ATM (splash-proof)"], ["Strap", "Black leather, 20 mm"], ["Glass", "Hardened mineral"], ["Thickness", "6.8 mm"]], care: WATCH_CARE, tags: ["dress", "quartz"], collections: ["gifts-under-2999", "desk-to-dinner"], weightGrams: 110, img: { q: "watch", pick: [8] } }),
    p({ title: "Black Dial Croc-Embossed Watch", category: "analogue", price: 3499, short: "A polished steel watch with a black dial and a croc-embossed leather strap.", description: desc("A polished 41 mm steel case, a deep black dial with a date window and a black croc-embossed leather strap: a sharp watch for the office and evenings out.", ["Polished 316L steel case", "Date window", "Croc-embossed calf leather strap"]), specs: [["Case size", "41 mm"], ["Movement", "Japanese quartz with date"], ["Water resistance", "5 ATM (50 m)"], ["Strap", "Black croc-embossed leather, 20 mm"], ["Glass", "Sapphire crystal"]], care: WATCH_CARE, tags: ["black", "quartz", "dress"], collections: ["desk-to-dinner"], weightGrams: 130, img: { q: "vintage watch", pick: [12] } }),
    // ---- Automatic
    p({ title: "Black Dial Bracelet Automatic", category: "automatic", price: 12999, mrp: 14999, short: "A 39 mm self-winding watch with a black dial, sapphire glass and a steel bracelet.", description: desc("Our everyday automatic: a 39 mm brushed-and-polished steel case with an exposed-screw bezel, a deep black dial and a solid-link bracelet. Wear it daily and it never needs a battery.", ["Self-winding automatic, 41-hour power reserve", "Display case back shows the rotor", "Solid-link bracelet, sized free"]), specs: [["Case size", "39 mm"], ["Movement", "Automatic, 21,600 bph, 41-hour reserve"], ["Water resistance", "10 ATM (100 m)"], ["Strap", "Stainless-steel bracelet, 20 mm"], ["Glass", "Sapphire crystal, anti-reflective"], ["Case back", "Exhibition (see-through)"]], care: AUTO_CARE, tags: ["automatic", "steel"], collections: ["bestsellers", "desk-to-dinner"], featured: true, weightGrams: 250, img: { q: "silver watch", pick: [4] } }),
    p({ title: "Two-Tone Date Automatic", category: "automatic", price: 13999, short: "A two-tone steel and gold-tone automatic with a champagne dial and date.", description: desc("A classic two-tone automatic: brushed steel with gold-tone centre links, a champagne dial and a date window at three. Dressy enough for a wedding, tough enough for every day.", ["Gold-tone PVD centre links", "Date window at 3 o'clock", "Screw-down case back"]), specs: [["Case size", "39 mm"], ["Movement", "Automatic with date, 40-hour reserve"], ["Water resistance", "5 ATM (50 m)"], ["Strap", "Two-tone steel bracelet, 20 mm"], ["Glass", "Sapphire crystal"]], care: AUTO_CARE, tags: ["automatic", "two-tone", "dress"], collections: ["gift-edit"], weightGrams: 240, img: { q: "gold watch", pick: [0] } }),
    p({ title: "Black Bezel Diver 200 m", category: "automatic", price: 16999, mrp: 18999, short: "A 42 mm automatic dive watch with a uni-directional bezel and 200 m water resistance.", description: desc("A proper tool watch: a uni-directional 120-click bezel for timing dives, a screw-down crown and generous lume on the hands and markers. Supplied on a black rubber strap.", ["Uni-directional 120-click bezel", "Screw-down crown", "Luminous hands and markers"]), specs: [["Case size", "42 mm"], ["Movement", "Automatic, 41-hour reserve"], ["Water resistance", "20 ATM (200 m)"], ["Strap", "Black rubber, 22 mm"], ["Glass", "Sapphire crystal"], ["Bezel", "Uni-directional, ceramic insert"]], care: "Rinse in fresh water after the sea or a pool and make sure the crown is screwed down before swimming. " + AUTO_CARE, tags: ["automatic", "diver", "sport"], collections: ["weekend", "bestsellers"], weightGrams: 280, img: { q: "wrist watch", pick: [12] } }),
    p({ title: "Vintage Cream Dial Automatic", category: "automatic", price: 10999, mrp: 12499, short: "A 38 mm vintage-style automatic with a cream dial and a black leather strap.", description: desc("A small, 1960s-style automatic: a 38 mm case, a warm cream dial with dot markers and a date, and a black leather strap. Wears beautifully on smaller wrists.", ["Self-winding automatic with date", "Domed crystal for a vintage look", "Black calf leather strap"]), specs: [["Case size", "38 mm"], ["Movement", "Automatic with date, 40-hour reserve"], ["Water resistance", "5 ATM (50 m)"], ["Strap", "Black leather, 19 mm"], ["Glass", "Domed sapphire crystal"]], care: AUTO_CARE, tags: ["automatic", "vintage"], collections: ["gift-edit", "desk-to-dinner"], weightGrams: 120, img: { q: "watch", pick: [2] } }),
    p({ title: "All-Black Automatic", category: "automatic", price: 11499, short: "A matte black 40 mm automatic with a black dial and black leather strap.", description: desc("A stealthy automatic: matte black case, black dial with tone-on-tone markers, black leather strap. Turn it over and the display back shows the movement at work.", ["Matte black IP-coated case", "Display case back", "Black leather strap"]), specs: [["Case size", "40 mm"], ["Movement", "Automatic, 41-hour reserve"], ["Water resistance", "5 ATM (50 m)"], ["Strap", "Black leather, 20 mm"], ["Glass", "Sapphire crystal"]], care: AUTO_CARE, tags: ["automatic", "black"], collections: ["weekend"], weightGrams: 130, img: { q: "timepiece", pick: [2] } }),
    // ---- Chronograph
    p({ title: "Gunmetal Chronograph", category: "chronograph", price: 6999, mrp: 8499, short: "A 43 mm gunmetal chronograph with a grey dial and a tan leather strap.", description: desc("A rugged chronograph with a matt gunmetal case, a grey dial with two sub-dials, a minute track on the flange and lume on the hands. The thick tan leather strap is hand-stitched.", ["Chronograph with 30-minute counter", "Matt gunmetal IP-coated case", "Hand-stitched tan leather strap"]), specs: [["Case size", "43 mm"], ["Movement", "Japanese quartz chronograph"], ["Water resistance", "10 ATM (100 m)"], ["Strap", "Tan leather, 22 mm"], ["Glass", "Hardened mineral"]], care: WATCH_CARE, tags: ["chronograph", "sport"], collections: ["weekend", "bestsellers"], featured: true, weightGrams: 160, img: { q: "leather watch", pick: [5] } }),
    // ---- Pocket watches
    p({ title: "Gold Hunter Pocket Watch", category: "pocket", price: 5499, mrp: 6499, short: "A gold-tone hunter-case pocket watch with Roman numerals and a chain.", description: desc("A spring-loaded hunter case opens to a white dial with Roman numerals and a small seconds sub-dial. Comes with a 35 cm chain and T-bar for a waistcoat or sherwani.", ["Spring-loaded hunter cover", "Small seconds sub-dial", "35 cm chain with T-bar"]), specs: [["Case size", "47 mm"], ["Movement", "Hand-wound mechanical, 36-hour reserve"], ["Water resistance", "Not water resistant"], ["Strap", "Gold-tone chain, 35 cm"], ["Glass", "Hardened mineral"]], care: "Wind once a day at the same time. Keep dry and store in its pouch.", tags: ["pocket", "gift", "wedding"], collections: ["gift-edit", "bestsellers"], weightGrams: 140, img: { q: "pocket watch", pick: [15] } }),
    p({ title: "Silver Open-Face Pocket Watch", category: "pocket", price: 3999, short: "A slim silver-tone open-face pocket watch with a grey dial and small seconds.", description: desc("A slim, art-deco-style open-face pocket watch: silver-tone case, grey dial with applied numerals and a small seconds sub-dial at six.", ["Slim 9 mm case", "Small seconds sub-dial", "Velvet pouch included"]), specs: [["Case size", "46 mm"], ["Movement", "Hand-wound mechanical, 36-hour reserve"], ["Water resistance", "Not water resistant"], ["Strap", "Sold separately"], ["Glass", "Hardened mineral"]], care: "Wind once a day at the same time. Keep dry and store in its pouch.", tags: ["pocket"], collections: ["gift-edit"], weightGrams: 110, img: { q: "pocket watch", pick: [11] } }),
    p({ title: "Steel Railway Pocket Watch", category: "pocket", price: 3499, short: "A steel open-face pocket watch with a white dial and a curb chain.", description: desc("A sturdy railway-style pocket watch with a bold white dial, Arabic numerals and a small seconds sub-dial, on a 30 cm steel curb chain.", ["Bold, easy-to-read dial", "Small seconds sub-dial", "30 cm steel curb chain"]), specs: [["Case size", "48 mm"], ["Movement", "Japanese quartz"], ["Water resistance", "Not water resistant"], ["Strap", "Steel curb chain, 30 cm"], ["Glass", "Hardened mineral"]], care: "Keep dry. We replace the battery free at our counter.", tags: ["pocket"], collections: ["gift-edit"], weightGrams: 120, img: { q: "watch", pick: [7] } }),
    // ---- Watch boxes
    p({ title: "Eight-Slot Glass-Top Watch Box", category: "boxes", price: 3499, mrp: 3999, short: "A black watch box with a glass lid and eight cushioned slots.", description: desc("Keep your collection dust-free and on show: eight removable cushions, a glass lid and a soft microfibre lining that won't scratch cases or glass. Watches not included.", ["Eight removable cushions", "Glass display lid with lock", "Microfibre lining"]), specs: [["Slots", "8"], ["Dimensions", "30 × 20 × 8 cm"], ["Material", "Faux leather, glass lid, microfibre lining"], ["Fits", "Cases up to 48 mm"]], care: "Dust with a soft cloth. Clean the glass with a dry microfibre cloth.", hsn: "4202", type: "other", tags: ["box", "storage", "gift"], collections: ["gift-edit"], weightGrams: 1400, img: { q: "luxury watch", pick: [0] } }),
    // ---- Cufflinks
    p({ title: "Pyramid Steel Cufflinks", category: "cufflinks", price: 1299, short: "Polished steel pyramid cufflinks for office shirts and weddings.", description: desc("Small, sharp pyramid cufflinks in polished stainless steel. Understated enough for the office, sharp enough for a sherwani or a suit.", ["Polished stainless steel", "Bullet-back fastening", "Comes in a gift box"]), specs: [["Material", "316L stainless steel"], ["Size", "12 × 12 mm"], ["Fastening", "Bullet back"]], care: "Wipe with a soft dry cloth and store in the box.", hsn: "7117", tags: ["cufflinks", "steel"], collections: ["desk-to-dinner", "gifts-under-2999"], weightGrams: 35, img: { q: "cufflinks", pick: [0] } }),
    // ---- Sunglasses
    p({ title: "Blue Mirror Aviator Sunglasses", category: "eyewear", price: 2499, mrp: 2999, short: "Gold-tone metal aviators with blue mirrored, polarised lenses.", description: desc("Classic teardrop aviators with a thin gold-tone metal frame and blue mirrored, polarised lenses that cut road and water glare. Supplied in a hard metal case.", ["Polarised lenses, UV400", "Adjustable nose pads", "Hard case and cleaning cloth"]), specs: [["Lens", "Polarised, blue mirror, UV400"], ["Frame", "Gold-tone metal"], ["Lens width", "58 mm"], ["Includes", "Hard case, microfibre cloth"]], care: "Clean lenses with the microfibre cloth only. Keep in the case when not in use.", hsn: "9004", tags: ["sunglasses", "aviator"], collections: ["weekend", "gifts-under-2999"], weightGrams: 60, img: { q: "sunglasses", pick: [6] } }),
    p({ title: "Round Mirror Sunglasses", category: "eyewear", price: 1999, short: "Round metal-frame sunglasses with silver mirrored lenses.", description: desc("Round, lightweight metal frames with silver mirrored lenses: a vintage shape that suits most faces. UV400 protection for Indian summers.", ["UV400 lenses", "Lightweight metal frame", "Spring hinges"]), specs: [["Lens", "Silver mirror, UV400"], ["Frame", "Gunmetal metal"], ["Lens width", "50 mm"], ["Includes", "Soft pouch"]], care: "Clean with the pouch or a microfibre cloth. Avoid leaving in a hot car.", hsn: "9004", tags: ["sunglasses", "round"], collections: ["weekend", "gifts-under-2999"], weightGrams: 35, img: { q: "sunglasses", pick: [13] } }),
    // ---- Wallets
    p({ title: "Bifold Leather Wallet", category: "leather", price: 1499, mrp: 1799, short: "A slim full-grain leather bifold with six card slots and a coin pocket.", description: desc("A slim bifold in full-grain leather that darkens beautifully with use: six card slots, two note sections and a snap coin pocket. RFID-blocking lining protects contactless cards.", ["Full-grain leather", "RFID-blocking lining", "Six card slots, coin pocket"]), specs: [["Material", "Full-grain leather"], ["Size", "11.5 × 9.5 cm (closed)"], ["Card slots", "6"], ["RFID blocking", "Yes"]], care: LEATHER, hsn: "4202", tags: ["wallet", "leather"], collections: ["gift-edit", "gifts-under-2999", "bestsellers"], weightGrams: 90, img: { q: "leather wallet", pick: [14] } }),
    p({ title: "Black Leather Key Wallet", category: "leather", price: 999, short: "A snap-close black leather key wallet with six hooks.", description: desc("Keeps keys from scratching your phone and tearing pockets: six steel hooks inside a soft black leather wallet with a two-snap closure.", ["Six steel key hooks", "Two-snap closure", "Soft pebbled leather"]), specs: [["Material", "Pebbled cowhide leather"], ["Size", "11 × 7 cm"], ["Hooks", "6, stainless steel"]], care: LEATHER, hsn: "4202", tags: ["wallet", "keys"], collections: ["gifts-under-2999"], weightGrams: 60, img: { q: "leather wallet", pick: [13] } }),
    // ---- Pens
    p({ title: "Navy Lacquer Fountain Pen", category: "pens", price: 2499, mrp: 2999, options: [["Nib", ["Fine", "Medium"]]], short: "A navy lacquer fountain pen with a gold-tone steel nib.", description: desc("A balanced, full-size fountain pen with a deep navy lacquer barrel and gold-tone trim. The steel nib writes smoothly from the first line and takes standard international cartridges or the converter included.", ["Gold-tone stainless-steel nib", "Cartridge and converter included", "Gift box"]), specs: [["Nib", "Stainless steel, fine or medium"], ["Filling", "Standard international cartridge / converter"], ["Length", "13.8 cm capped"], ["Material", "Lacquered brass, gold-tone trim"]], care: "Flush the nib with lukewarm water every few weeks. Store capped, nib up.", hsn: "9608", type: "other", tags: ["pen", "fountain", "gift"], collections: ["gift-edit", "desk-to-dinner", "gifts-under-2999"], weightGrams: 45, img: { q: "fountain pen", pick: [2] } }),
    p({ title: "Brushed Steel Ballpoint Pen", category: "pens", price: 1299, short: "A slim brushed-steel twist ballpoint with a black ink refill.", description: desc("A slim, weighted ballpoint in brushed stainless steel with a twist mechanism and a pocket clip. Takes standard G2 refills.", ["Twist mechanism", "Weighted brushed-steel barrel", "Standard G2 refill"]), specs: [["Ink", "Black, medium 1.0 mm"], ["Refill", "Standard G2"], ["Length", "13.5 cm"], ["Material", "Stainless steel"]], care: "Wipe with a soft cloth. Replace the refill when it runs dry.", hsn: "9608", type: "other", tags: ["pen", "ballpoint"], collections: ["desk-to-dinner", "gifts-under-2999"], weightGrams: 30, img: { q: "pen and notebook", pick: [5] } }),
  ],
};

export default spec;
