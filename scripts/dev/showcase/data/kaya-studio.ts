import type { ShowcaseSpec, ShowProduct } from "../types";

const WASH = "Machine wash cold on a gentle cycle with similar colours. Do not bleach. Dry in shade; warm iron on the reverse.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "6204", care: WASH, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;
const SIZES = ["XS", "S", "M", "L", "XL"];
const MEN = ["S", "M", "L", "XL", "XXL"];

const spec: ShowcaseSpec = {
  slug: "kaya-studio",
  name: "Kaya Studio",
  industry: "fashion",
  owner: "Ananya Rao",
  theme: "runway-editorial",
  tagline: "Easy, well-cut everyday clothes, made in Bengaluru",
  story: [
    "Kaya Studio started in 2019 as a two-person cutting table in Ashok Nagar, Bengaluru. Today we design and make everyday clothes for women and men: easy dresses, shirts that get better with every wash, honest denim and a few warm layers for travel and air-conditioned offices.",
    "We cut in small batches with two partner workshops in Bengaluru and Tiruppur, use mostly natural fibres, and publish the fabric, fit and care details of every piece, so you know exactly what you're buying.",
    "Free size exchanges, free shipping above ₹1,499 and a real person on the other end of our email: that's the whole promise.",
  ],
  email: "hello@kayastudio.test",
  phone: "+91 80 4718 2290",
  address: { line1: "2nd Floor, 14 Wood Street, Ashok Nagar", city: "Bengaluru", state: "Karnataka", postal_code: "560025" },
  legalName: "Kaya Studio Apparel LLP",
  seo: { title: "Kaya Studio — Everyday clothes, made in Bengaluru", description: "Dresses, cotton shirts, denim, outerwear and accessories for women and men. Small-batch, natural fibres, free size exchanges." },
  announcement: ["Free shipping above ₹1,499", "Free size exchanges within 15 days", "New: the monsoon edit is here"],
  categories: [
    { slug: "dresses", name: "Dresses", description: "Midi, maxi, knit and shirt dresses." },
    { slug: "tops-shirts", name: "Tops & Shirts", description: "Shirts, tees and knits for every day." },
    { slug: "bottoms", name: "Bottoms", description: "Denim, trousers and skirts." },
    { slug: "outerwear", name: "Outerwear", description: "Jackets and coats for travel and cooler evenings." },
    { slug: "accessories", name: "Accessories", description: "Bags, shoes, sunglasses, scarves and jewellery." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "The pieces our customers reorder most." },
    { slug: "new-in", title: "New in", description: "Just landed: this season's newest styles." },
    { slug: "menswear", title: "Menswear", description: "Shirts, tees and layers for men.", tag: "menswear" },
    { slug: "workwear", title: "Workwear", description: "Easy pieces for the office and video calls.", tag: "workwear" },
    { slug: "weekend", title: "Weekend", description: "Relaxed clothes for days off.", tag: "weekend" },
    { slug: "under-2499", title: "Under ₹2,499", description: "Everyday favourites at easy prices.", tag: "under-2499" },
  ],
  menu: [
    { title: "New in", to: "/collections/new-in" },
    { title: "Dresses", to: "/categories/dresses" },
    { title: "Tops & Shirts", to: "/categories/tops-shirts" },
    { title: "Bottoms", to: "/categories/bottoms" },
    { title: "Outerwear", to: "/categories/outerwear" },
    { title: "Accessories", to: "/categories/accessories" },
    { title: "Menswear", to: "/collections/menswear" },
  ],
  faqs: [
    ["How do I find my size?", "Every product page lists the fit (relaxed, regular or slim) and the model's size. If you're between sizes, size down for relaxed fits and up for slim fits. You can also write to us with your measurements."],
    ["Can I exchange for a different size?", "Yes, size exchanges are free within 15 days of delivery. Start one from your order page and we'll pick up the old piece when we drop off the new one."],
    ["How long does delivery take?", "Metro cities get orders in 2–4 working days, the rest of India in 4–7. Orders placed before 2 pm ship the same day."],
    ["Do you offer cash on delivery?", "Yes, on orders up to ₹10,000, for a ₹49 handling fee."],
    ["What fabrics do you use?", "Mostly cotton, viscose and denim, with wool blends for coats. The exact composition is on every product page."],
    ["Will it shrink?", "Our cotton and denim are pre-washed, so they won't shrink more than 1–2%. Wash cold and dry in shade to keep the colour."],
  ],
  shippingNote: "Free shipping on orders above ₹1,499; ₹79 below that. Metro cities 2–4 working days, rest of India 4–7. Orders placed before 2 pm ship the same day.",
  returnsNote: "Free size exchanges within 15 days of delivery. Unworn pieces with tags can be returned within 15 days for a refund to the original payment method (a ₹99 pickup fee applies). Earrings and sale items are exchange-only.",
  images: {
    hero: { q: "woman fashion", pick: [4] },
    hero2: { q: "man fashion", pick: [13] },
    feature: { q: "fashion model", pick: [7] },
    story: { q: "fabric", pick: [0] },
    "promo-a": { q: "summer dress", pick: [7] },
    "promo-b": { q: "denim", pick: [1] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A woman in a patterned jacket among tall grass", eyebrow: "The monsoon edit", heading: "Clothes for real days", subheading: "Easy dresses, good shirts and honest denim, cut in small batches in Bengaluru.", ctaLabel: "Shop new in", ctaHref: "/collections/new-in" },
          { imagePath: "$img:hero2", alt: "A man in a knitted beanie and dark jacket", eyebrow: "Layers", heading: "Ready for cooler days", subheading: "Coats, jackets and knits for travel, monsoon and winter, from XS to XXL.", ctaLabel: "Shop outerwear", ctaHref: "/categories/outerwear" },
        ],
      },
    ],
    categories: ["CategoryGrid", { heading: "Shop by category", mode: "manual", items: ["dresses", "tops-shirts", "bottoms", "outerwear", "accessories"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    collections: ["CollectionGrid", { eyebrow: "Edits", heading: "Shop the edit", mode: "manual", items: ["menswear", "workwear", "weekend", "under-2499"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New arrivals", source: "collection", collectionId: "$collection:new-in", viewAllHref: "/collections/new-in" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", subheading: "The pieces our customers reorder most.", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    dresses: ["ProductCarousel", { eyebrow: "Dresses", heading: "One-and-done dressing", source: "category", categoryId: "$category:dresses", viewAllHref: "/categories/dresses" }],
    outerwear: ["ProductCarousel", { eyebrow: "Layers", heading: "Jackets & coats", source: "category", categoryId: "$category:outerwear", viewAllHref: "/categories/outerwear" }],
    story: [
      "BrandStory",
      { eyebrow: "How we make it", heading: "Small batches, natural fibres", body: "We cut every style in runs of a few hundred pieces with two partner workshops in Bengaluru and Tiruppur, mostly in cotton, denim and wool blends. Fewer pieces means less waste, and it lets us fix a fit the moment you tell us something's off.", imagePath: "$img:story", alt: "A sewing machine stitching fabric", stats: [{ value: "2", label: "Partner workshops" }, { value: "85%", label: "Natural fibres" }, { value: "15 days", label: "Free size exchanges" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A woman in a hat and long cardigan in a bright studio", eyebrow: "Styling notes", heading: "Build a week from ten pieces", body: "Two shirts, one good pair of jeans, a skirt, a dress, a knit and a jacket: most of our customers start with the same few pieces and mix them all week. Everything in the collection is cut to work together.", ctaLabel: "Shop best sellers", ctaHref: "/collections/bestsellers" },
    ],
    lookbook: ["Lookbook", { eyebrow: "Lookbook", heading: "How they wear it", looks: [1, 4, 7, 13, 15, 21].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "Two women in floral summer dresses", heading: "Dresses for warm days", text: "Florals, maxis and shirt dresses.", ctaLabel: "Shop dresses", ctaHref: "/categories/dresses" },
          { imagePath: "$img:promo-b", alt: "Denim hanging on a rail", heading: "Denim, done right", text: "Jeans and jackets that wear in, not out.", ctaLabel: "Shop bottoms", ctaHref: "/categories/bottoms" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "End of season", heading: "Up to 30% off outerwear", subheading: "Prices already reduced on selected jackets and coats.", ctaLabel: "Shop the offer", ctaHref: "/categories/outerwear", background: "#1c1c1c", textColor: "#f5f1ea" }],
    social: ["SocialProof", { heading: "Worn by you", subheading: "Pieces from the collection, photographed as they are.", handle: "", posts: [0, 2, 3, 5, 6, 9, 10, 11, 16].map((i) => ({ imagePath: `$product:${i}`, alt: "", href: "" })), showProfile: false }],
    trust: ["TrustBadges", { items: [{ icon: "truck", title: "Free shipping", text: "On orders above ₹1,499" }, { icon: "return", title: "Free size exchanges", text: "Within 15 days" }, { icon: "india", title: "Made in India", text: "In Bengaluru and Tiruppur" }, { icon: "secure", title: "Secure checkout", text: "UPI, cards and COD" }] }],
    faq: ["FAQ", { heading: "Good to know", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "First look at new drops", subheading: "New styles, restocks and the occasional styling note. Twice a month, no spam.", buttonLabel: "Subscribe" }],
    marquee: ["Marquee", { items: [{ text: "Free shipping above ₹1,499" }, { text: "Free size exchanges" }, { text: "Made in Bengaluru" }, { text: "Natural fibres" }] }],
  },
  products: [
    // ---------------------------------------------------------------- dresses
    p({ title: "Mira Floral Midi Dress", category: "dresses", type: "dress", price: 3290, mrp: 3890, options: [["Colour", ["Navy floral|#1f2a44"]], ["Size", SIZES]], short: "A navy ditsy-floral midi in soft cotton-viscose, with a gathered waist and pockets.", description: desc("Our best-selling dress: a tiny white-and-pink floral on deep navy, in a soft cotton-viscose that drapes without clinging. The gathered waist and cap sleeves make it an easy one-piece outfit, and yes, it has pockets.", ["Soft cotton-viscose, fully lined bodice", "Gathered waist, side pockets", "Model is 5'6\" and wears S"]), specs: [["Fabric", "60% cotton, 40% viscose"], ["Fit", "Regular through the bodice, relaxed skirt"], ["Length", "Midi, 116 cm (size S)"], ["Neckline", "Round"], ["Sleeves", "Cap"], ["Made in", "Bengaluru, India"]], tags: ["dress", "weekend"], collections: ["bestsellers"], featured: true, weightGrams: 360, img: { q: "dress", pick: [0] } }),
    p({ title: "Gulmohar Flowy Maxi Dress", category: "dresses", type: "dress", price: 3690, options: [["Colour", ["Rose|#e4b7b5"]], ["Size", SIZES]], short: "A floaty full-length georgette dress with long, sheer sleeves.", description: desc("Yards of light georgette that move beautifully when you walk. Lined to mid-thigh, with a tie at the neck and elasticated cuffs. Made for weddings in the afternoon and dinners outdoors.", ["Soft georgette, lined", "Keyhole neck with tie", "Elasticated cuffs"]), specs: [["Fabric", "Polyester georgette, cotton-blend lining"], ["Fit", "Relaxed, flared"], ["Length", "Maxi, 140 cm (size S)"], ["Sleeves", "Long, sheer"]], care: "Hand wash cold or gentle machine wash in a laundry bag. Dry in shade. Cool iron.", tags: ["dress", "occasion"], collections: ["bestsellers"], featured: true, weightGrams: 420, img: { q: "dress", pick: [6] } }),
    p({ title: "Aria Button-Front Shirt Dress", category: "dresses", type: "dress", price: 2990, options: [["Colour", ["Mocha|#8a6a53"]], ["Size", SIZES]], short: "A sleeveless, belted cotton-twill shirt dress with a full, swingy skirt.", description: desc("A shirt dress that works as hard as you do: mid-weight cotton twill, a self-fabric belt and a full skirt that twirls. Smart enough for the office, easy enough for Saturday.", ["Cotton twill, 180 GSM", "Self-fabric belt", "Button-through front, side pockets"]), specs: [["Fabric", "100% cotton twill"], ["Fit", "Regular, belted"], ["Length", "Knee, 104 cm (size S)"], ["Collar", "Classic shirt collar"], ["Sleeves", "Sleeveless"]], tags: ["dress", "workwear"], collections: ["new-in"], weightGrams: 420, img: { q: "woman dress", pick: [3] } }),
    p({ title: "Tara Ribbed Knit Dress", category: "dresses", type: "dress", price: 2490, mrp: 2990, options: [["Colour", ["Cream|#ece2cf"]], ["Size", SIZES]], short: "A long-sleeved, figure-skimming rib-knit dress in soft cotton blend.", description: desc("A stretchy rib-knit dress that's comfortable enough for a long flight and neat enough for dinner. Wear it alone or layer a jacket over it.", ["Soft cotton-blend rib knit", "Long sleeves, crew neck", "Stretches with you"]), specs: [["Fabric", "95% cotton, 5% elastane rib"], ["Fit", "Slim"], ["Length", "Above knee, 92 cm (size S)"], ["Neckline", "Crew"]], care: "Gentle machine wash cold. Dry flat in shade. Do not hang.", hsn: "6104", tags: ["dress", "knit", "under-2499"], collections: ["new-in"], weightGrams: 340, img: { q: "black dress", pick: [14] } }),

    // ---------------------------------------------------------------- tops & shirts
    p({ title: "Oversized Poplin Shirt", category: "tops-shirts", type: "shirt", price: 1990, mrp: 2390, options: [["Colour", ["White|#f7f5f0"]], ["Size", SIZES]], short: "A roomy, dropped-shoulder shirt in crisp cotton poplin.", description: desc("The shirt you'll wear with everything: oversized through the body, dropped shoulders and a curved hem that looks good tucked or loose.", ["Crisp cotton poplin", "Dropped shoulders, curved hem", "Pearl-finish buttons"]), specs: [["Fabric", "100% cotton poplin, 120 GSM"], ["Fit", "Oversized"], ["Length", "74 cm (size S)"], ["Collar", "Classic"]], hsn: "6206", tags: ["shirt", "workwear", "under-2499"], collections: ["bestsellers"], featured: true, weightGrams: 240, img: { q: "shirt", pick: [13] } }),
    p({ title: "Men's Chambray Shirt", category: "tops-shirts", type: "shirt", price: 2190, options: [["Colour", ["Light indigo|#9fb7d3"]], ["Size", MEN]], short: "A soft, washed chambray shirt with two chest pockets.", description: desc("A light, breathable chambray that looks like denim and feels like a well-worn cotton shirt. Wear it buttoned for work or open over a tee.", ["Washed cotton chambray", "Two button-flap chest pockets", "Back yoke, curved hem"]), specs: [["Fabric", "100% cotton chambray, 130 GSM"], ["Fit", "Regular"], ["Length", "78 cm (size M)"], ["Collar", "Classic"]], hsn: "6205", tags: ["shirt", "menswear", "workwear", "under-2499"], collections: ["bestsellers"], weightGrams: 280, img: { q: "man shirt", pick: [10] } }),
    p({ title: "Checked Flannel Shirt", category: "tops-shirts", type: "shirt", price: 2290, options: [["Colour", ["Red check|#9b2d2b"]], ["Size", ["XS", "S", "M", "L", "XL", "XXL"]]], short: "A brushed-cotton check shirt that doubles as a light jacket.", description: desc("Brushed on both sides for a soft, warm handle. Cut unisex, so it works as a shirt or as an open overshirt on cooler evenings.", ["Brushed cotton flannel", "Unisex, relaxed cut", "Two chest pockets"]), specs: [["Fabric", "100% cotton flannel, 170 GSM"], ["Fit", "Relaxed, unisex"], ["Length", "76 cm (size M)"]], hsn: "6205", tags: ["shirt", "menswear", "weekend", "under-2499"], collections: ["new-in"], weightGrams: 360, img: { q: "shirt", pick: [12, 5] } }),
    p({ title: "Striped Cotton Knit Sweater", category: "tops-shirts", type: "top", price: 2690, options: [["Colour", ["Cocoa stripe|#5a3a33"]], ["Size", SIZES]], short: "A relaxed striped knit for air-conditioned offices and hill-station trips.", description: desc("Knitted from breathable cotton, so it's warm enough for a flight or an AC office without being too much for Indian weather.", ["Breathable cotton knit", "Ribbed cuffs and hem", "Relaxed crew neck"]), specs: [["Fabric", "100% cotton knit"], ["Fit", "Relaxed"], ["Length", "62 cm (size S)"], ["Neckline", "Crew"]], care: "Hand wash cold or gentle machine wash. Dry flat in shade. Do not hang.", hsn: "6110", tags: ["knit", "workwear"], collections: ["new-in"], weightGrams: 420, img: { q: "sweater", pick: [10] } }),
    p({ title: "Men's Everyday Cotton Tee", category: "tops-shirts", type: "top", price: 990, options: [["Colour", ["White|#f7f5f0"]], ["Size", MEN]], short: "A heavyweight organic-cotton T-shirt that keeps its shape.", description: desc("Our everyday tee in 200 GSM organic cotton jersey: thick enough not to go see-through, soft enough to live in.", ["200 GSM organic cotton", "Rib neckband that doesn't stretch out", "Pre-shrunk"]), specs: [["Fabric", "100% organic cotton jersey, 200 GSM"], ["Fit", "Regular"], ["Length", "72 cm (size M)"], ["Neckline", "Crew"]], hsn: "6109", tags: ["tee", "menswear", "weekend", "under-2499"], collections: ["bestsellers"], weightGrams: 220, img: { q: "man shirt", pick: [4] } }),

    // ---------------------------------------------------------------- bottoms
    p({ title: "Distressed Relaxed Jeans", category: "bottoms", type: "bottom", price: 2890, mrp: 3290, options: [["Wash", ["Mid blue|#5f7fa6"]], ["Size", ["26", "28", "30", "32", "34"]]], short: "A relaxed, mid-rise jean with worn-in knees and a cropped hem.", description: desc("A relaxed jean with a lived-in look from day one: soft rigid cotton, gentle distressing at the knee and an ankle-grazing length that shows off boots and sneakers.", ["Soft rigid cotton denim, 11 oz", "Relaxed leg, cropped at the ankle", "Distressing is reinforced from inside"]), specs: [["Fabric", "100% cotton denim, 11 oz"], ["Fit", "Mid rise, relaxed leg"], ["Inseam", "27\" (69 cm)"], ["Closure", "Zip fly"]], care: "Wash inside out, cold, with dark colours. Line dry. Wash less, keep the colour longer.", hsn: "6204", tags: ["denim", "weekend"], collections: ["bestsellers"], featured: true, weightGrams: 620, img: { q: "jeans", pick: [5] } }),
    p({ title: "High-Waist Pencil Skirt", category: "bottoms", type: "bottom", price: 2190, options: [["Colour", ["Black|#161616"]], ["Size", SIZES]], short: "A clean, high-waisted pencil skirt in stretch ponte.", description: desc("A simple black skirt that goes with every top you own: high-waisted and straight, in a thick stretch ponte that holds its shape, with a concealed back zip and walking vent.", ["Thick stretch ponte, lined", "High waist, concealed back zip", "Back walking vent"]), specs: [["Fabric", "Viscose-nylon ponte with elastane, lined"], ["Fit", "High waist, straight"], ["Length", "Knee, 62 cm"]], tags: ["skirt", "workwear", "under-2499"], collections: ["new-in"], weightGrams: 300, img: { q: "skirt", pick: [7] } }),
    p({ title: "A-Line Mini Skirt", category: "bottoms", type: "bottom", price: 1690, options: [["Colour", ["Wine|#7b1f2c"]], ["Size", SIZES]], short: "A short, swingy A-line skirt in soft cotton twill.", description: desc("A playful A-line mini with an elasticated back waist, in a deep wine red that works with denim, white shirts and knits.", ["Cotton twill", "Elasticated back waist", "Shorts lining"]), specs: [["Fabric", "100% cotton twill"], ["Fit", "Regular, A-line"], ["Length", "Mini, 42 cm"]], tags: ["skirt", "weekend", "under-2499"], collections: ["new-in"], weightGrams: 240, img: { q: "skirt", pick: [5] } }),
    p({ title: "Hooded Cotton Anorak", category: "outerwear", price: 3790, options: [["Colour", ["Olive|#5e6142"]], ["Size", SIZES]], short: "A half-zip, hooded anorak in water-repellent waxed cotton.", description: desc("Made for hill-station weekends and drizzly walks: a pull-on anorak in water-repellent cotton with a big kangaroo pocket and a drawcord hood.", ["Water-repellent waxed cotton", "Half zip, drawcord hood", "Kangaroo pocket with press studs"]), specs: [["Fabric", "100% cotton, wax finish"], ["Fit", "Relaxed"], ["Length", "72 cm (size S)"]], care: "Spot clean with a damp cloth. Do not machine wash or tumble dry.", hsn: "6202", tags: ["jacket", "weekend"], collections: ["new-in"], weightGrams: 780, img: { q: "trousers", pick: [3] } }),

    // ---------------------------------------------------------------- outerwear
    p({ title: "Classic Denim Jacket", category: "outerwear", price: 3490, mrp: 3990, options: [["Wash", ["Light blue|#a7bfd9"]], ["Size", SIZES]], short: "A timeless light-wash trucker jacket in sturdy cotton denim.", description: desc("The jacket that goes with everything: a classic trucker cut in 12 oz denim that softens beautifully with wear.", ["12 oz cotton denim", "Chest flap pockets, side welt pockets", "Adjustable button waist tabs"]), specs: [["Fabric", "100% cotton denim, 12 oz"], ["Fit", "Regular"], ["Length", "58 cm (size S)"]], care: "Wash inside out, cold. Line dry.", hsn: "6202", tags: ["jacket", "denim", "weekend"], collections: ["bestsellers"], featured: true, weightGrams: 800, img: { q: "denim jacket", pick: [1] } }),
    p({ title: "Hooded Wool-Blend Coat", category: "outerwear", price: 6990, mrp: 8490, options: [["Colour", ["Navy|#1f2c44"]], ["Size", SIZES]], short: "A warm, hooded wool-blend coat for winter travel.", description: desc("For Delhi winters and trips abroad: a hip-length coat in a warm wool blend, fully lined, with a deep hood and room to layer over a knit.", ["Wool blend, fully lined", "Deep hood, concealed zip and press-stud front", "Two deep welt pockets"]), specs: [["Fabric", "60% wool, 40% polyester; viscose lining"], ["Fit", "Regular, room to layer"], ["Length", "82 cm (size S)"]], care: "Dry clean only. Store on a wide hanger.", hsn: "6202", tags: ["coat", "winter"], weightGrams: 1400, img: { q: "coat", pick: [10] } }),
    p({ title: "Men's Wool-Blend Overcoat", category: "outerwear", price: 7490, mrp: 8990, options: [["Colour", ["Stone grey|#9d978c"]], ["Size", MEN]], short: "A relaxed, unstructured overcoat to throw over a knit or a shirt.", description: desc("Unstructured shoulders and a soft wool blend make this the easiest coat you'll own. Long enough to cover a blazer, light enough to carry.", ["Soft wool blend, half-lined", "Notch lapels, three-button front", "Two patch pockets, one inside pocket"]), specs: [["Fabric", "55% wool, 45% polyester"], ["Fit", "Relaxed"], ["Length", "98 cm (size M)"]], care: "Dry clean only. Store on a wide hanger.", hsn: "6201", tags: ["coat", "menswear", "winter", "workwear"], weightGrams: 1500, img: { q: "man jacket", pick: [12] } }),
    p({ title: "Packable Monsoon Rain Jacket", category: "outerwear", price: 2990, options: [["Colour", ["Sunflower|#f2c230", "Black|#161616"]], ["Size", ["XS", "S", "M", "L", "XL", "XXL"]]], short: "A lightweight waterproof hooded jacket that packs into its own pocket.", description: desc("For Mumbai and Bengaluru monsoons: a fully waterproof shell with taped seams and a peaked hood, light enough to live in your bag until the clouds open.", ["Waterproof to 5,000 mm, taped seams", "Peaked, adjustable hood", "Packs into its chest pocket"]), specs: [["Fabric", "Recycled polyester with PU coating"], ["Fit", "Relaxed, unisex"], ["Length", "74 cm (size M)"], ["Waterproofing", "5,000 mm"]], care: "Hand wash cold. Hang to dry. Do not iron or tumble dry.", hsn: "6201", tags: ["jacket", "weekend"], collections: ["new-in"], weightGrams: 320, img: { q: "jacket", pick: [1] } }),

    // ---------------------------------------------------------------- accessories
    p({ title: "Leather Weekender Bag", category: "accessories", type: "accessory", price: 6490, mrp: 7490, options: [["Colour", ["Tan|#8b5a33"]]], short: "A roomy vegetable-tanned leather holdall for short trips.", description: desc("Big enough for three days away, with a zip top, two front pockets and a detachable shoulder strap. The leather darkens beautifully with use.", ["Vegetable-tanned leather", "Detachable, padded shoulder strap", "Inner zip pocket"]), specs: [["Material", "Vegetable-tanned leather, cotton lining"], ["Dimensions", "W 50 × H 28 × D 24 cm"], ["Capacity", "32 litres"], ["Made in", "Kanpur, India"]], care: "Wipe with a dry cloth. Condition every few months. Keep away from rain.", hsn: "4202", tags: ["bag"], collections: ["bestsellers"], weightGrams: 1600, img: { q: "handbag", pick: [0] } }),
    p({ title: "Round Mirrored Sunglasses", category: "accessories", type: "accessory", price: 1990, options: [["Lens", ["Silver mirror|#c9ccd1", "Grey|#4a4a4a"]]], short: "Round metal frames with UV400 polarised lenses.", description: desc("A light metal frame with polarised UV400 lenses that cut glare on bright days. Comes with a cotton pouch.", ["UV400 polarised lenses", "Metal frame, spring hinges", "Cotton pouch included"]), specs: [["Frame", "Stainless steel"], ["Lens", "Polarised, UV400"], ["Lens width", "50 mm"]], care: "Clean lenses with the pouch or a microfibre cloth. Store in the pouch.", hsn: "9004", tags: ["sunglasses", "under-2499"], weightGrams: 120, img: { q: "sunglasses", pick: [13] } }),
    p({ title: "Block-Print Cotton Stole", category: "accessories", type: "accessory", price: 1290, options: [["Colour", ["Indigo|#2f4fa3"]]], short: "A soft mul-cotton stole, hand block-printed in Bagru.", description: desc("A light, drapey stole printed by hand with carved wooden blocks in Bagru, near Jaipur. Wear it around the neck, over the shoulders or as a head scarf in the sun.", ["Hand block-printed", "Soft mul cotton", "200 × 70 cm"]), specs: [["Material", "100% mul cotton"], ["Size", "200 × 70 cm"], ["Made in", "Bagru, Rajasthan"]], care: "Hand wash cold separately; the colour may bleed slightly at first. Dry in shade.", hsn: "6214", tags: ["scarf", "under-2499"], weightGrams: 90, img: { q: "scarf", pick: [11] } }),
    p({ title: "Spiral Drop Earrings", category: "accessories", type: "accessory", price: 890, short: "Lightweight spiral drops in 18k gold-plated brass.", description: desc("Hand-hammered spiral pendants on fine hooks, plated in 18k gold over nickel-free brass. Light enough to wear all day.", ["18k gold-plated brass", "Nickel-free, hypoallergenic hooks", "3 cm drop"]), specs: [["Material", "Brass, 18k gold plating"], ["Drop", "3 cm"], ["Weight", "5 g per pair"]], care: "Keep dry. Avoid perfume and lotions. Store in the pouch provided.", hsn: "7117", tags: ["jewellery", "under-2499"], weightGrams: 40, img: { q: "earrings", pick: [5] } }),
    p({ title: "Straw Panama Hat", category: "accessories", type: "accessory", price: 1790, options: [["Size", ["S/M", "M/L"]]], short: "A classic woven-straw sun hat with a black grosgrain band.", description: desc("A packable woven-straw hat with a medium brim for beach days and summer weddings, finished with a black grosgrain band.", ["Woven paper straw", "Black grosgrain band", "Inner adjustable sweatband"]), specs: [["Material", "Paper straw"], ["Brim", "7 cm"], ["Sizes", "S/M 56–57 cm, M/L 58–59 cm"]], care: "Spot clean only. Keep dry; store on its crown.", hsn: "6504", tags: ["hat", "weekend", "under-2499"], weightGrams: 150, img: { q: "hat", pick: [7] } }),
    p({ title: "White Leather Sneakers", category: "accessories", type: "accessory", price: 3490, options: [["Size", ["UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"]]], short: "Minimal white leather sneakers with a cushioned rubber sole.", description: desc("A clean, unbranded low-top in soft leather, with a cushioned removable insole and a stitched rubber cupsole. Goes with dresses, denim and suits.", ["Soft full-grain leather upper", "Cushioned removable insole", "Stitched rubber cupsole"]), specs: [["Upper", "Full-grain leather"], ["Lining", "Leather"], ["Sole", "Rubber"], ["Fit", "True to size"]], care: "Wipe with a damp cloth and mild soap. Air dry away from direct heat.", hsn: "6403", tags: ["shoes", "weekend"], weightGrams: 900, img: { q: "sneakers", pick: [3] } }),
  ],
};

export default spec;
