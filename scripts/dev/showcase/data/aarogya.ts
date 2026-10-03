import type { ShowcaseSpec, ShowProduct } from "../types";

const FSSAI = ["FSSAI licence", "Shown on pack"] as [string, string];
const MADE = ["Made in", "India"] as [string, string];
const NOTE = "This product is not intended to diagnose, treat, cure or prevent any disease. Consult a qualified practitioner if you are pregnant, nursing or on medication.";
const item = (x: Omit<ShowProduct, "hsn" | "weightGrams"> & { hsn?: string; weightGrams?: number }): ShowProduct => ({ hsn: "1211", weightGrams: 300, ...x });
const desc = (intro: string, points: string[], note = false) => `${intro}\n\n## Good to know\n${points.map((t) => `- ${t}`).join("\n")}${note ? `\n\n_${NOTE}_` : ""}`;
const FOOD_CARE = "Store in a cool, dry place in an airtight container, away from sunlight.";

const spec: ShowcaseSpec = {
  slug: "aarogya",
  name: "Aarogya Wellness",
  industry: "health",
  owner: "Kavitha Menon",
  theme: "ayurveda-heritage",
  tagline: "Everyday wellness, rooted in Indian tradition",
  story: [
    "Aarogya Wellness is a small wellness shop in Kozhikode, Kerala. We started with a handful of churnas and herbal teas blended from herbs bought directly from growers in the Western Ghats, and grew into a store for the simple things that make a calmer, more active day: honest pantry staples, yoga props, oils and sleep aids.",
    "We keep our labels short and our claims modest. Every food product carries its FSSAI licence and full ingredient list, and every herb is tested for purity by an accredited lab before it is packed.",
  ],
  email: "care@aarogyawellness.test",
  phone: "+91 495 276 4410",
  address: { line1: "14/220, Mavoor Road, near Arayidathupalam", city: "Kozhikode", state: "Kerala", postal_code: "673004" },
  legalName: "Aarogya Wellness Private Limited",
  seo: { title: "Aarogya Wellness — Ayurvedic herbs, herbal teas, yoga & self-care", description: "Ayurvedic churnas, herbal teas, everyday nutrition, yoga props, essential oils and sleep aids. Lab-tested herbs, FSSAI-licensed foods. Free shipping above ₹799." },
  announcement: ["Free shipping on orders above ₹799", "Every herb lab-tested for purity", "Cash on delivery across India"],
  categories: [
    { slug: "ayurveda", name: "Ayurveda & Herbs", description: "Churnas, powders and dried herbs from the Western Ghats." },
    { slug: "herbal-teas", name: "Herbal Teas", description: "Caffeine-light blends and single-herb infusions." },
    { slug: "nutrition", name: "Everyday Nutrition", description: "Oats, seeds, nuts and pantry staples." },
    { slug: "yoga", name: "Yoga & Fitness", description: "Mats, props and gear for home practice." },
    { slug: "self-care", name: "Aromatherapy & Self-care", description: "Essential oils, massage tools, bath and sleep." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "What our regulars reorder." },
    { slug: "morning-ritual", title: "Morning ritual", description: "Start the day slowly: warm drinks, oats and a stretch." },
    { slug: "home-practice", title: "Home yoga studio", description: "Everything for a calm practice corner at home." },
    { slug: "wind-down", title: "Wind down", description: "Teas, oils and sleep aids for a calmer evening.", tag: "sleep" },
  ],
  menu: [
    { title: "Ayurveda", to: "/categories/ayurveda" },
    { title: "Herbal Teas", to: "/categories/herbal-teas" },
    { title: "Nutrition", to: "/categories/nutrition" },
    { title: "Yoga", to: "/categories/yoga" },
    { title: "Self-care", to: "/categories/self-care" },
    { title: "Rituals", to: "/collections", children: [
      { title: "Morning ritual", to: "/collections/morning-ritual" },
      { title: "Home yoga studio", to: "/collections/home-practice" },
      { title: "Wind down", to: "/collections/wind-down" },
    ] },
  ],
  faqs: [
    ["Are your products medicines?", "No. Our herbs, teas and foods are sold as food and wellness products. They are not intended to diagnose, treat, cure or prevent any disease. If you have a health condition, are pregnant or take medication, please speak to your doctor first."],
    ["How do you test your herbs?", "Every batch is tested by an NABL-accredited lab for heavy metals, microbial load and identity before packing. Batch numbers are printed on every pack."],
    ["Do food products carry an FSSAI licence?", "Yes. Our licence number, ingredients, net weight and best-before date are printed on every food pack."],
    ["How long does delivery take?", "Kerala: 1–3 days. Metro cities: 3–5 days. Rest of India: 5–7 days. Shipping is free above ₹799."],
    ["Can I return an opened product?", "For hygiene reasons, opened foods, teas and oils can't be returned. Unused yoga gear and accessories can be returned within 7 days."],
    ["Is cash on delivery available?", "Yes, on orders up to ₹5,000 across most PIN codes."],
  ],
  shippingNote: "Free shipping above ₹799; ₹60 below that. Kerala 1–3 days, metros 3–5 days, rest of India 5–7 days.",
  returnsNote: "Unused yoga gear and accessories can be returned within 7 days. Opened foods, teas and oils can't be returned for hygiene reasons, but if anything arrives damaged we'll replace it — just send a photo within 48 hours.",
  images: {
    hero: { q: "yoga", pick: [5] },
    hero2: { q: "herbal tea", pick: [0] },
    hero3: { q: "herbs", pick: [0] },
    story: { q: "dried herbs", pick: [7] },
    feature: { q: "meditation", pick: [0] },
    "feature-2": { q: "spa", pick: [1] },
    "promo-a": { q: "yoga mat", pick: [3] },
    "promo-b": { q: "spa", pick: [2] },
    look1: { q: "yoga beach", pick: [2] },
    look2: { q: "stretching", pick: [6] },
    look3: { q: "wellness", pick: [2] },
    look4: { q: "yoga", pick: [3] },
    look5: { q: "meditation", pick: [4] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "Yoga by the sea", eyebrow: "Move a little every day", heading: "Everyday wellness, rooted in tradition", subheading: "Herbs, teas, yoga props and self-care for a calmer, more active day.", ctaLabel: "Shop wellness", ctaHref: "/collections/bestsellers" },
          { imagePath: "$img:hero2", alt: "A cup of herbal tea with fresh mint", eyebrow: "Herbal teas", heading: "Slow down with a warm cup", subheading: "Chamomile, hibiscus, tulsi and matcha, blended in Kerala.", ctaLabel: "Shop teas", ctaHref: "/categories/herbal-teas" },
          { imagePath: "$img:hero3", alt: "Herbs and spices with a mortar and pestle", eyebrow: "Lab-tested herbs", heading: "Honest herbs from the Western Ghats", subheading: "Every batch tested for purity before it is packed.", ctaLabel: "Shop Ayurveda", ctaHref: "/categories/ayurveda" },
        ],
      },
    ],
    categories: ["CategoryGrid", { heading: "Shop by category", mode: "manual", items: ["ayurveda", "herbal-teas", "nutrition", "yoga", "self-care"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    collections: ["CollectionGrid", { heading: "Shop by ritual", mode: "manual", items: ["morning-ritual", "home-practice", "wind-down"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", subheading: "What our regulars reorder.", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New in the shop", source: "newest", viewAllHref: "/collections" }],
    ayurveda: ["ProductGrid", { eyebrow: "From the Western Ghats", heading: "Ayurveda & herbs", source: "category", categoryId: "$category:ayurveda", viewAllHref: "/categories/ayurveda" }],
    teas: ["ProductCarousel", { heading: "Herbal teas", subheading: "Caffeine-light blends for any time of day.", source: "category", categoryId: "$category:herbal-teas", viewAllHref: "/categories/herbal-teas" }],
    nutrition: ["ProductGrid", { heading: "Everyday nutrition", subheading: "Seeds, nuts, granola and honey. Full labels, nothing hidden.", source: "category", categoryId: "$category:nutrition", viewAllHref: "/categories/nutrition" }],
    yoga: ["ProductCarousel", { eyebrow: "Yoga & meditation", heading: "Your home practice", source: "collection", collectionId: "$collection:home-practice", viewAllHref: "/collections/home-practice" }],
    "self-care": ["ProductGrid", { eyebrow: "Evening rituals", heading: "Aromatherapy & self-care", source: "category", categoryId: "$category:self-care", viewAllHref: "/categories/self-care" }],
    offers: ["ProductGrid", { eyebrow: "Save more", heading: "On offer this week", source: "sale", viewAllHref: "/collections/bestsellers" }],
    story: [
      "BrandStory",
      { eyebrow: "Where it comes from", heading: "Herbs we can trace to the farm", body: "We buy turmeric, cinnamon, tulsi and coconut directly from 40 grower families in Wayanad, Idukki and the Nilgiris. Every batch is tested by an accredited lab for purity before it is packed in Kozhikode, and the batch number on your pack tells you where it came from.", imagePath: "$img:story", alt: "Dried herbs on a table", stats: [{ value: "40", label: "Grower families" }, { value: "100%", label: "Batches lab-tested" }, { value: "2016", label: "Blending since" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A woman meditating by the sea", eyebrow: "Ten quiet minutes", heading: "A simple morning ritual", body: "Warm water or a cup of herbal tea, five minutes of stretching on your mat and five minutes of sitting still. It doesn't need to be more than that to make the day feel calmer.", ctaLabel: "Shop the morning ritual", ctaHref: "/collections/morning-ritual" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "Essential oil with small white flowers", eyebrow: "Wind down", heading: "An evening self-care ritual", body: "A few drops of essential oil in a warm bath, a slow self-massage with oil, a soft candle and an eye mask for sleep. Small rituals that help you switch off at the end of the day.", ctaLabel: "Shop self-care", ctaHref: "/categories/self-care" },
    ],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "A woman meditating on a yoga mat", heading: "Build a home practice", text: "Mats, blocks and props for a calm corner at home.", ctaLabel: "Shop yoga", ctaHref: "/collections/home-practice" },
          { imagePath: "$img:promo-b", alt: "Bath salts in a bowl", heading: "Bath & spa rituals", text: "Oils, stones and candles for slow evenings.", ctaLabel: "Shop self-care", ctaHref: "/categories/self-care" },
        ],
      },
    ],
    lookbook: [
      "Lookbook",
      {
        eyebrow: "Practice moments",
        heading: "Find your few minutes",
        looks: [
          { imagePath: "$img:look1", alt: "Yoga on the beach", caption: "Morning on the sand" },
          { imagePath: "$img:look2", alt: "Stretching by a window", caption: "Stretch by the window" },
          { imagePath: "$img:look4", alt: "A yoga pose outdoors", caption: "Balance practice" },
          { imagePath: "$img:look3", alt: "Preparing herbs at home", caption: "Blending at home" },
          { imagePath: "$img:look5", alt: "Meditating at sunset", caption: "Sit still at sunset" },
        ].map((l) => ({ ...l, productId: "" })),
        layout: "row",
      },
    ],
    sale: ["SaleBanner", { eyebrow: "This week", heading: "Save 15% on teas and herbs", subheading: "Use the code at checkout on orders above ₹999.", code: "CALM15", ctaLabel: "Shop teas", ctaHref: "/categories/herbal-teas", background: "#14532d", textColor: "#fefce8" }],
    trust: ["TrustBadges", { items: [{ icon: "leaf", title: "Lab-tested herbs", text: "Every batch checked for purity" }, { icon: "truck", title: "Free shipping", text: "On orders above ₹799" }, { icon: "cod", title: "Cash on delivery", text: "Up to ₹5,000" }, { icon: "india", title: "Made in Kerala", text: "Blended and packed in Kozhikode" }] }],
    faq: ["FAQ", { heading: "Questions about our products", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Notes for a calmer week", subheading: "A short monthly letter on seasonal teas, simple rituals and new arrivals. No spam.", buttonLabel: "Subscribe" }],
    marquee: ["Marquee", { items: [{ text: "Free shipping above ₹799" }, { text: "Lab-tested herbs" }, { text: "Cash on delivery" }, { text: "Code CALM15: 15% off teas" }] }],
  },
  products: [
    item({ title: "Whole Turmeric Fingers, 200 g", category: "ayurveda", price: 189, mrp: 220, short: "Sun-dried whole turmeric from Wayanad. Grind fresh for cooking or golden milk.", description: desc("Whole turmeric rhizomes, boiled and sun-dried the traditional way by grower families in Wayanad, then lab-tested for purity. Grinding small amounts fresh keeps the colour and aroma bright.", ["Single origin, single ingredient", "Grind in a mortar or spice grinder as needed", "Lab-tested for heavy metals and added colour"], true), specs: [["Net weight", "200 g"], ["Ingredients", "Whole turmeric (Curcuma longa)"], ["Origin", "Wayanad, Kerala"], ["Usage", "Grind ½ tsp into milk, curries or warm water"], ["Shelf life", "12 months"], FSSAI], care: FOOD_CARE, hsn: "0910", tags: ["ayurveda", "herbs", "turmeric"], collections: ["bestsellers", "morning-ritual"], featured: true, weightGrams: 250, img: { q: "turmeric", pick: [3, 4] } }),
    item({ title: "Ceylon Cinnamon Quills, 100 g", category: "ayurveda", price: 249, short: "Thin, soft-layered true cinnamon quills with a sweet, mild aroma.", description: desc("True cinnamon (Cinnamomum verum) from small farms in Idukki, hand-rolled into thin quills that break easily. Sweeter and milder than cassia.", ["True cinnamon, not cassia", "Brew in tea, simmer in milk or grind for baking"], true), specs: [["Net weight", "100 g"], ["Ingredients", "Cinnamon bark (Cinnamomum verum)"], ["Origin", "Idukki, Kerala"], ["Usage", "1 small quill per cup of tea or milk"], ["Shelf life", "18 months"], FSSAI], care: FOOD_CARE, hsn: "0906", tags: ["ayurveda", "herbs", "spices"], collections: ["morning-ritual"], weightGrams: 150, img: { q: "cinnamon", pick: [4, 3] } }),
    item({ title: "Wooden Mortar & Pestle (Kharal)", category: "ayurveda", price: 699, mrp: 849, short: "A turned sheesham-wood kharal for grinding herbs, spices and churnas at home.", description: desc("Turned from a single block of sheesham wood by woodworkers in Saharanpur and finished with food-safe coconut oil. Heavy enough to stay put while you grind.", ["Single block of sheesham wood", "Food-safe oil finish", "Holds about 1 cup"]), specs: [["Material", "Sheesham wood"], ["Size", "Bowl 11 cm wide × 9 cm high; pestle 15 cm"], ["Finish", "Food-safe coconut oil"], MADE], care: "Wash by hand with warm water and dry at once. Rub with a little oil once a month. Not dishwasher safe.", hsn: "4419", tags: ["ayurveda", "kitchen"], weightGrams: 800, img: { q: "mortar pestle", pick: [5, 1] } }),
    item({ title: "Virgin Coconut Oil, Cold-Pressed, 500 ml", category: "ayurveda", price: 349, mrp: 399, short: "Cold-pressed from fresh Kerala coconuts. For cooking, hair and abhyanga self-massage.", description: desc("Pressed from fresh coconut milk without heat, so it keeps a light, sweet coconut aroma. Turns solid below 24 °C, which is natural.", ["Cold-pressed, unrefined, unbleached", "Use for cooking, oil pulling or massage", "Glass jar"]), specs: [["Volume", "500 ml"], ["Ingredients", "100% virgin coconut oil"], ["Process", "Cold-pressed from fresh coconut milk"], ["Origin", "Kozhikode, Kerala"], ["Shelf life", "12 months"], FSSAI], care: "Store at room temperature. Solidifies below 24 °C; warm the jar in water to melt.", hsn: "1513", tags: ["ayurveda", "oil", "coconut"], collections: ["bestsellers"], weightGrams: 750, img: { q: "coconut oil", pick: [1, 0] } }),
    item({ title: "Chamomile Flower Tea, 50 g", category: "herbal-teas", price: 299, short: "Whole dried chamomile flowers for a gentle, honey-like evening cup.", description: desc("Whole chamomile flower heads, dried slowly in the shade so they stay golden. Naturally caffeine-free with a soft, apple-honey taste.", ["Whole flowers, nothing added", "Naturally caffeine-free", "About 25 cups per pack"], true), specs: [["Net weight", "50 g"], ["Ingredients", "Dried chamomile flowers (Matricaria chamomilla)"], ["Servings", "About 25 cups"], ["Usage", "2 g in 200 ml water just off the boil, steep 5 minutes"], ["Caffeine", "None"], FSSAI], care: FOOD_CARE, tags: ["tea", "sleep", "caffeine-free"], collections: ["wind-down", "bestsellers"], featured: true, weightGrams: 100, img: { q: "chamomile", pick: [0] } }),
    item({ title: "Hibiscus Petal Tea, 100 g", category: "herbal-teas", price: 249, short: "Tart, ruby-red hibiscus petals. Lovely hot, or iced with a little jaggery.", description: desc("Dried calyces of Hibiscus sabdariffa from farms in Karnataka, cut and sifted. Brews a deep red, cranberry-tart cup.", ["Single ingredient", "Naturally caffeine-free", "About 50 cups per pack"], true), specs: [["Net weight", "100 g"], ["Ingredients", "Dried hibiscus calyces (Hibiscus sabdariffa)"], ["Servings", "About 50 cups"], ["Usage", "2 g in 250 ml hot water, steep 5–7 minutes; or cold-brew overnight"], ["Caffeine", "None"], FSSAI], care: FOOD_CARE, tags: ["tea", "caffeine-free"], collections: ["morning-ritual"], weightGrams: 150, img: { q: "hibiscus tea", pick: [0, 1] } }),
    item({ title: "Ceremonial Matcha, 30 g", category: "herbal-teas", price: 649, mrp: 749, short: "Stone-ground, shade-grown green tea powder for a smooth, grassy bowl.", description: desc("Fine, bright-green powder from shade-grown first-flush leaves. Whisk with water for a traditional bowl or with milk for a latte.", ["Stone-ground, first flush", "Contains natural caffeine", "About 15 servings"]), specs: [["Net weight", "30 g"], ["Ingredients", "Green tea leaf powder"], ["Servings", "About 15 (2 g each)"], ["Usage", "Whisk 2 g with 70 ml water at 75 °C"], ["Caffeine", "Yes, about 60 mg per serving"], FSSAI], care: "Keep sealed in the fridge after opening and use within 6 weeks.", hsn: "0902", tags: ["tea", "matcha", "green-tea"], collections: ["morning-ritual"], weightGrams: 80, img: { q: "herbal powder", pick: [0] } }),
    item({ title: "Tulsi Lemongrass Tea, 100 g", category: "herbal-teas", price: 279, short: "Our house blend of holy basil, lemongrass and a little ginger.", description: desc("Krishna and Rama tulsi leaves blended with lemongrass and dried ginger, grown on partner farms in Wayanad. Bright, peppery and lemony.", ["Caffeine-free herbal blend", "About 50 cups per pack", "Blended in small batches in Kozhikode"], true), specs: [["Net weight", "100 g"], ["Ingredients", "Tulsi leaves (60%), lemongrass (30%), dried ginger (10%)"], ["Servings", "About 50 cups"], ["Usage", "2 g in 200 ml boiling water, steep 4–5 minutes"], ["Caffeine", "None"], FSSAI], care: FOOD_CARE, tags: ["tea", "tulsi", "caffeine-free"], collections: ["bestsellers", "morning-ritual"], weightGrams: 150, img: { q: "loose leaf tea", pick: [0, 2] } }),
    item({ title: "Glass Teapot with Infuser, 600 ml", category: "herbal-teas", price: 899, mrp: 1099, short: "Heat-resistant borosilicate teapot with a removable steel infuser.", description: desc("Watch your flowers and leaves open as they steep. Lift the infuser out when the tea is ready so it never turns bitter.", ["Borosilicate glass, stovetop-safe on low flame", "Removable stainless steel infuser", "Brews 3 cups"]), specs: [["Capacity", "600 ml"], ["Material", "Borosilicate glass, stainless steel infuser"], ["Dishwasher safe", "Yes (glass body)"]], care: "Wash by hand or in the top rack. Avoid sudden temperature changes.", hsn: "7013", tags: ["tea", "teaware"], collections: ["wind-down"], weightGrams: 700, img: { q: "tea infuser", pick: [2] } }),
    item({ title: "Chia Seeds, 250 g", category: "nutrition", price: 229, mrp: 260, short: "Black chia seeds for overnight puddings, smoothies and breakfast bowls.", description: desc("Cleaned, sorted chia seeds grown in Madhya Pradesh. Soak in milk or water for 20 minutes for a soft pudding texture.", ["Single ingredient", "Soak before eating", "Resealable pouch"]), specs: [["Net weight", "250 g"], ["Ingredients", "Chia seeds (Salvia hispanica)"], ["Servings", "About 16 (15 g each)"], ["Usage", "1 tbsp soaked in 100 ml milk or water"], ["Shelf life", "12 months"], FSSAI], care: FOOD_CARE, hsn: "1207", tags: ["seeds", "nutrition", "breakfast"], collections: ["morning-ritual", "bestsellers"], weightGrams: 280, img: { q: "chia seeds", pick: [0, 2] } }),
    item({ title: "Roasted Flax Seeds, 250 g", category: "nutrition", price: 169, short: "Lightly dry-roasted brown flax seeds with a nutty taste.", description: desc("Brown flax seeds from Rajasthan, dry-roasted in small batches. Grind just before use and sprinkle on rotis, curd or salads.", ["Dry-roasted, no oil or salt", "Grind fresh for best taste"]), specs: [["Net weight", "250 g"], ["Ingredients", "Roasted flax seeds"], ["Servings", "About 25 (10 g each)"], ["Usage", "1 tbsp ground, over food"], ["Shelf life", "6 months"], FSSAI], care: FOOD_CARE, hsn: "1204", tags: ["seeds", "nutrition"], weightGrams: 280, img: { q: "flax seeds", pick: [1, 0] } }),
    item({ title: "Millet & Nut Granola, 400 g", category: "nutrition", price: 399, mrp: 449, short: "Crunchy oats, ragi and almonds, baked with jaggery and coconut oil.", description: desc("Rolled oats and ragi flakes baked with almonds, pumpkin seeds, jaggery and cold-pressed coconut oil. Good with milk, curd or fruit.", ["Sweetened only with jaggery", "No palm oil, no preservatives", "Contains nuts and gluten"]), specs: [["Net weight", "400 g"], ["Ingredients", "Rolled oats, ragi flakes, almonds, pumpkin seeds, jaggery, coconut oil, cinnamon"], ["Servings", "About 10 (40 g each)"], ["Allergens", "Gluten, tree nuts"], ["Shelf life", "4 months"], FSSAI], care: FOOD_CARE, hsn: "1904", tags: ["breakfast", "nutrition", "granola"], collections: ["morning-ritual", "bestsellers"], featured: true, weightGrams: 450, img: { q: "granola", pick: [1, 3] } }),
    item({ title: "Raw Forest Honey, 500 g", category: "nutrition", price: 449, short: "Unheated multiflora honey from forest co-operatives in the Nilgiris.", description: desc("Collected by tribal honey-gatherer co-operatives, strained through cloth and never heated. Its colour and taste change with the season.", ["Raw, unpasteurised", "May crystallise in cool weather; that's natural", "Not for infants under one year"]), specs: [["Net weight", "500 g"], ["Ingredients", "Raw honey"], ["Source", "Nilgiri forests, Tamil Nadu"], ["Shelf life", "24 months"], FSSAI], care: "Store at room temperature with the lid closed. Use a dry spoon.", hsn: "0409", tags: ["honey", "nutrition"], collections: ["morning-ritual"], weightGrams: 700, img: { q: "honey jar", pick: [1, 0] } }),
    item({ title: "Whole Cashews W240, 250 g", category: "nutrition", price: 349, mrp: 399, short: "Large whole cashews from Kollam, unsalted and unroasted.", description: desc("Grade W240 whole cashews, processed in Kollam and packed in a nitrogen-flushed pouch to stay crisp.", ["Unsalted, unroasted", "Resealable pouch"]), specs: [["Net weight", "250 g"], ["Ingredients", "Cashew kernels"], ["Grade", "W240 (240 kernels per pound)"], ["Origin", "Kollam, Kerala"], ["Allergens", "Tree nuts"], FSSAI], care: FOOD_CARE, hsn: "0801", tags: ["nuts", "nutrition"], weightGrams: 300, img: { q: "cashew", pick: [4, 5] } }),
    item({ title: "Everyday Yoga Mat, 6 mm", category: "yoga", type: "accessory", price: 1299, mrp: 1599, options: [["Colour", ["Lotus Pink|#e8a0b8", "Sea Teal|#2a9d8f", "Slate|#4b5563"]]], short: "A cushioned, non-slip TPE mat for daily practice at home.", description: desc("6 mm of closed-cell TPE cushions knees and wrists while the textured surface grips on both sides. Light enough to carry to class.", ["Non-slip on both sides", "Free of PVC and latex", "Carry strap included"]), specs: [["Size", "183 × 61 cm"], ["Thickness", "6 mm"], ["Material", "TPE (thermoplastic elastomer)"], ["Weight", "900 g"], ["Includes", "Cotton carry strap"]], care: "Wipe with a damp cloth and mild soap; air-dry out of direct sun.", hsn: "9506", tags: ["yoga", "mat"], collections: ["home-practice", "bestsellers"], featured: true, weightGrams: 1100, img: { q: "yoga mat", pick: [4, 5] } }),
    item({ title: "Foam Yoga Blocks, Pair", category: "yoga", type: "accessory", price: 599, options: [["Colour", ["Lavender|#c4b5fd", "Sea Teal|#2a9d8f"]]], short: "Light, firm EVA blocks to support standing poses, stretches and seated practice.", description: desc("High-density EVA foam with bevelled edges. Use them flat, on the side or upright to bring the floor closer.", ["Sold as a pair", "Non-slip, sweat-resistant surface"]), specs: [["Size", "23 × 15 × 7.5 cm each"], ["Material", "High-density EVA foam"], ["Weight", "200 g each"], ["Pack", "2 blocks"]], care: "Wipe clean with a damp cloth.", hsn: "9506", tags: ["yoga", "props"], collections: ["home-practice"], weightGrams: 450, img: { q: "yoga block", pick: [1, 2] } }),
    item({ title: "Yoga Starter Kit: Mat & Two Blocks", category: "yoga", type: "accessory", price: 1699, mrp: 2198, short: "A 6 mm teal mat with two lavender blocks: everything to start practising at home.", description: desc("Our everyday mat paired with two foam blocks, at a lower price than buying them separately.", ["6 mm TPE mat with carry strap", "Two EVA foam blocks"]), specs: [["Includes", "1 mat (183 × 61 cm, 6 mm), 2 blocks (23 × 15 × 7.5 cm)"], ["Material", "TPE mat, EVA blocks"], ["Colour", "Sea teal mat, lavender blocks"]], care: "Wipe with a damp cloth and mild soap; air-dry out of direct sun.", hsn: "9506", tags: ["yoga", "kit", "gift"], collections: ["home-practice"], weightGrams: 1600, img: { q: "yoga block", pick: [0] } }),
    item({ title: "Pure Essential Oil, 15 ml", category: "self-care", price: 399, options: [["Scent", ["Lemongrass", "Lavender", "Eucalyptus"]]], short: "Steam-distilled single essential oils for diffusers and baths.", description: desc("Single-origin oils steam-distilled by small distillers in Kerala and Kashmir, bottled in amber glass with a dropper. For aroma use; dilute before applying to skin.", ["100% pure, single oil", "Amber glass with dropper", "Dilute in a carrier oil before skin use"]), specs: [["Volume", "15 ml"], ["Extraction", "Steam distillation"], ["Origin", "Lemongrass: Kerala · Lavender: Kashmir · Eucalyptus: Nilgiris"], ["Usage", "3–5 drops in a diffuser, or 5 drops in a warm bath"], ["Warning", "For external use only. Keep away from children and eyes."], MADE], care: "Store upright in a cool, dark place. Use within 2 years.", hsn: "3301", tags: ["aromatherapy", "essential-oil"], collections: ["wind-down", "bestsellers"], featured: true, weightGrams: 80, img: { q: "essential oil", pick: [0, 1] } }),
    item({ title: "Abhyanga Body Massage Oil, 200 ml", category: "self-care", price: 549, mrp: 649, short: "Sesame and coconut oil with vetiver and sandalwood, for a warm self-massage.", description: desc("A traditional-style body oil made by slowly infusing herbs in cold-pressed sesame and coconut oils. Warm a little in your palms and massage before a bath.", ["Cold-pressed base oils", "Gentle woody scent", "Patch test before first use"], true), specs: [["Volume", "200 ml"], ["Ingredients", "Sesame oil, coconut oil, vetiver, sandalwood oil, vitamin E"], ["Usage", "Warm 1–2 tbsp and massage 10 minutes before a bath"], ["Skin type", "All, patch test first"], MADE], care: "Store away from sunlight. Use within 12 months of opening.", hsn: "3304", tags: ["massage", "oil", "ayurveda"], collections: ["wind-down"], weightGrams: 300, img: { q: "massage oil", pick: [1] } }),
    item({ title: "Basalt Massage Stones, Set of 8", category: "self-care", price: 1199, short: "Smooth river-basalt stones for warm-stone massage at home.", description: desc("Hand-polished basalt that holds warmth well. Warm in hot water (not the microwave) and use with massage oil.", ["8 stones in three sizes", "Cotton storage pouch"]), specs: [["Material", "Natural basalt"], ["Pieces", "8 (2 large, 4 medium, 2 small)"], ["Usage", "Warm in water at 50–55 °C; test on your wrist first"]], care: "Wash with mild soap after use and dry fully. Oil lightly now and then.", hsn: "6802", tags: ["massage", "spa"], weightGrams: 2200, img: { q: "spa stones", pick: [0] } }),
    item({ title: "Satin Sleep Eye Mask", category: "self-care", type: "accessory", price: 449, options: [["Colour", ["Ivory|#f5f0e6", "Charcoal|#374151"]]], short: "A soft, padded satin eye mask that blocks out light for deeper rest.", description: desc("Smooth satin on both sides with a light cotton filling and a soft adjustable band that doesn't tug at hair.", ["Blocks out light", "Adjustable elastic band", "Washable"]), specs: [["Material", "Polyester satin, cotton filling"], ["Size", "21 × 9 cm"], ["Band", "Adjustable elastic"]], care: "Hand wash cold and dry flat.", hsn: "6307", tags: ["sleep"], collections: ["wind-down"], weightGrams: 60, img: { q: "sleep mask", pick: [1] } }),
    item({ title: "Soy Wax Candle, 180 g", category: "self-care", price: 599, options: [["Scent", ["Vetiver & Cedar", "Jasmine", "Lemongrass"]]], short: "A slow-burning soy candle with a cotton wick in a reusable tin.", description: desc("Hand-poured in Kochi from soy wax and essential oils, with a lead-free cotton wick. Burns for about 35 hours.", ["Soy wax, cotton wick", "About 35 hours burn time", "Reusable tin with lid"]), specs: [["Net weight", "180 g"], ["Wax", "Soy"], ["Wick", "Cotton, lead-free"], ["Burn time", "About 35 hours"], MADE], care: "Trim the wick to 5 mm before lighting. Never leave a burning candle unattended.", hsn: "3406", tags: ["aromatherapy", "candle", "gift"], collections: ["wind-down"], weightGrams: 300, img: { q: "candle", pick: [7] } }),
    item({ title: "Brass Singing Bowl, 12 cm", category: "self-care", price: 1499, mrp: 1799, short: "A hand-hammered bowl with a long, warm tone, for meditation and quiet moments.", description: desc("Hammered by hand from a bell-metal alloy in Moradabad. Strike gently or circle the rim with the wooden mallet for a sustained hum.", ["Hand-hammered bell metal", "Wooden mallet and cushion included"]), specs: [["Diameter", "12 cm"], ["Material", "Bell-metal alloy (brass)"], ["Includes", "Wooden mallet, cotton cushion"], MADE], care: "Wipe with a soft dry cloth. Polish occasionally with a little lemon and salt, then dry.", hsn: "8306", tags: ["meditation", "gift"], collections: ["home-practice"], weightGrams: 600, img: { q: "singing bowl", pick: [2, 1] } }),
    item({ title: "Hand-Rolled Incense Sticks, 40 sticks", category: "self-care", price: 199, options: [["Fragrance", ["Sandalwood", "Rose", "Vetiver"]]], short: "Masala incense rolled by hand on bamboo, with natural resins and oils.", description: desc("Rolled by a women's collective in Mysuru using charcoal-free masala paste, natural resins and essential oils. Each stick burns for about 40 minutes.", ["Charcoal-free masala incense", "About 40 minutes per stick", "Burn in a ventilated room"]), specs: [["Pack", "40 sticks"], ["Burn time", "About 40 minutes each"], ["Ingredients", "Wood powder, natural resins, essential oils, bamboo"], MADE], care: "Store in a dry place. Burn on a heat-proof holder away from curtains.", hsn: "3307", tags: ["meditation", "aromatherapy"], collections: ["home-practice"], weightGrams: 120, img: { q: "incense", pick: [1, 0] } }),
  ],
};

export default spec;
