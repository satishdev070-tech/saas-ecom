import type { ShowcaseSpec, ShowProduct } from "../types";

const WOOD_CARE = "Dust with a soft dry cloth. Wipe spills immediately. Keep away from direct sunlight and radiators; re-oil every 6–12 months with the included care kit.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "9403", care: WOOD_CARE, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;

const spec: ShowcaseSpec = {
  slug: "kasa-living",
  name: "Kasa Living",
  industry: "furniture",
  owner: "Rohan Deshmukh",
  theme: "scandinavian-home",
  tagline: "Solid-wood furniture and calm décor for Indian homes",
  story: [
    "Kasa Living makes furniture the way it used to be made: solid sheesham and mango wood, mortise-and-tenon joints and hand-rubbed oil finishes, built in our Jodhpur workshop and sized for Indian apartments.",
    "We deliver and assemble in 40 cities, offer a five-year structural warranty on every wooden piece, and will happily send wood and fabric swatches before you decide.",
  ],
  email: "studio@kasaliving.test",
  phone: "+91 22 6123 4488",
  address: { line1: "Unit 7, Kamala Mills Compound, Senapati Bapat Marg, Lower Parel", city: "Mumbai", state: "Maharashtra", postal_code: "400013" },
  legalName: "Kasa Living Private Limited",
  seo: { title: "Kasa Living — Solid-wood furniture & home décor", description: "Sheesham and mango-wood furniture, lighting and décor, made in Jodhpur. Free delivery and assembly in 40 cities, 5-year warranty." },
  announcement: ["Free delivery & assembly in 40 cities", "5-year warranty on solid-wood furniture", "No-cost EMI from ₹2,500/month"],
  categories: [
    { slug: "living", name: "Living Room", description: "Sofas, armchairs, coffee tables and storage." },
    { slug: "bedroom", name: "Bedroom", description: "Beds, bedside tables and soft furnishings." },
    { slug: "dining", name: "Dining", description: "Dining tables, chairs and benches." },
    { slug: "lighting", name: "Lighting", description: "Floor, table and pendant lamps." },
    { slug: "decor", name: "Décor", description: "Vases, mirrors, clocks, baskets and textiles." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "Pieces our customers love most." },
    { slug: "small-spaces", title: "For small spaces", description: "Compact pieces for city apartments." },
    { slug: "work-from-home", title: "Home office", description: "Desks, chairs and lighting for work." },
    { slug: "under-5000", title: "Under ₹5,000", description: "Easy updates for any room.", tag: "under-5000" },
    { slug: "solid-wood", title: "Solid wood", description: "Sheesham, mango and teak pieces built to last.", tag: "solid-wood" },
  ],
  menu: [
    { title: "Living", to: "/categories/living" },
    { title: "Bedroom", to: "/categories/bedroom" },
    { title: "Dining", to: "/categories/dining" },
    { title: "Lighting", to: "/categories/lighting" },
    { title: "Décor", to: "/categories/decor" },
    { title: "Small spaces", to: "/collections/small-spaces" },
  ],
  faqs: [
    ["Do you deliver and assemble?", "Yes, free in 40 cities including Mumbai, Delhi NCR, Bengaluru, Pune, Hyderabad and Chennai. Our team assembles on delivery and takes the packaging away."],
    ["How long does delivery take?", "In-stock pieces arrive in 7–12 days. Made-to-order pieces take 4–6 weeks; the product page shows which is which."],
    ["What wood do you use?", "Mostly sheesham (Indian rosewood) and mango wood from sustainably managed plantations, kiln-dried to prevent warping in humid weather."],
    ["Is there a warranty?", "Five years on the structure and joints of all solid-wood furniture, one year on upholstery, lighting and hardware."],
    ["Can I see samples first?", "Yes. We'll post up to three wood or fabric swatches free of charge. Write to us with the product names."],
    ["Do you offer EMI?", "No-cost EMI for 3 or 6 months on most credit cards for orders above ₹10,000."],
  ],
  shippingNote: "Free delivery and assembly in 40 cities. Elsewhere, a delivery quote is shown at checkout. Large pieces are delivered on a scheduled day; we call to confirm a slot.",
  returnsNote: "If anything arrives damaged, we repair or replace it at no cost. Unused décor can be returned within 10 days. Furniture can be returned within 7 days of delivery for a 10% handling fee.",
  images: {
    hero: { q: "living room", pick: [0] },
    hero2: { q: "bedroom", pick: [2] },
    materials: { q: "wood", pick: [3] },
    feature: { q: "interior", pick: [5] },
    "promo-a": { q: "dining table", pick: [1] },
    "promo-b": { q: "plant pot", pick: [7] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A bright living room", eyebrow: "New season", heading: "Rooms that feel like you", subheading: "Solid-wood furniture made in Jodhpur, delivered and assembled free.", ctaLabel: "Shop living room", ctaHref: "/categories/living" },
          { imagePath: "$img:hero2", alt: "A calm bedroom", eyebrow: "Bedroom", heading: "Slow mornings start here", subheading: "Beds, bedside tables and soft cotton linen.", ctaLabel: "Shop bedroom", ctaHref: "/categories/bedroom" },
        ],
      },
    ],
    rooms: ["CollectionGrid", { eyebrow: "Shop by need", heading: "Made for how you live", mode: "manual", items: ["small-spaces", "work-from-home", "solid-wood", "under-5000"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    categories: ["CategoryGrid", { heading: "Shop by room", mode: "manual", items: ["living", "bedroom", "dining", "lighting", "decor"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New arrivals", source: "newest", viewAllHref: "/collections" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    living: ["ProductGrid", { heading: "The living room edit", subheading: "Comfortable, well made and easy to live with.", source: "category", categoryId: "$category:living", viewAllHref: "/categories/living" }],
    bedroom: ["ProductCarousel", { eyebrow: "Bedroom", heading: "Rest, well made", source: "category", categoryId: "$category:bedroom", viewAllHref: "/categories/bedroom" }],
    workspace: ["ProductGrid", { heading: "Home office", subheading: "A better place to work from.", source: "collection", collectionId: "$collection:work-from-home", viewAllHref: "/collections/work-from-home" }],
    decor: ["ProductGrid", { heading: "Finishing touches", source: "category", categoryId: "$category:decor", viewAllHref: "/categories/decor" }],
    materials: [
      "BrandStory",
      { eyebrow: "How we make it", heading: "Solid wood, honest joints", body: "Every piece starts as kiln-dried sheesham or mango wood, is joined by hand with mortise-and-tenon joints, and finished with natural oils that you can refresh at home. No particle board, no veneer over chipboard.", imagePath: "$img:materials", alt: "Close-up of wood grain", stats: [{ value: "5 yr", label: "Structural warranty" }, { value: "40", label: "Cities with free assembly" }, { value: "100%", label: "Solid wood frames" }], ctaLabel: "Our workshop", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A styled interior", eyebrow: "Styling notes", heading: "Start with one good piece", body: "A room comes together around one thing you love — a sofa, a dining table, a big mirror. Choose that first, then add light, texture and plants around it.", ctaLabel: "Shop best sellers", ctaHref: "/collections/bestsellers" },
    ],
    lookbook: ["Lookbook", { eyebrow: "In real homes", heading: "Rooms we love", looks: [0, 4, 7, 10, 15].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "A dining table set for dinner", heading: "Gather round", text: "Dining tables for four to eight.", ctaLabel: "Shop dining", ctaHref: "/categories/dining" },
          { imagePath: "$img:promo-b", alt: "Plants in pots", heading: "Bring it to life", text: "Planters, vases and baskets.", ctaLabel: "Shop décor", ctaHref: "/categories/decor" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "Monsoon offer", heading: "Up to 25% off living room", subheading: "Prices already reduced on selected sofas and tables.", ctaLabel: "Shop the offer", ctaHref: "/categories/living", background: "#3b2a20", textColor: "#f6efe6" }],
    trust: ["TrustBadges", { items: [{ icon: "truck", title: "Free delivery & assembly", text: "In 40 cities" }, { icon: "handmade", title: "Made in Jodhpur", text: "By our own craftspeople" }, { icon: "secure", title: "5-year warranty", text: "On solid-wood furniture" }, { icon: "return", title: "Damage-free promise", text: "We repair or replace" }] }],
    faq: ["FAQ", { heading: "Before you buy", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Notes from the workshop", subheading: "New pieces, styling ideas and early access to offers.", buttonLabel: "Subscribe" }],
    marquee: ["Marquee", { items: [{ text: "Free delivery & assembly" }, { text: "5-year warranty" }, { text: "Solid sheesham & mango wood" }, { text: "No-cost EMI" }] }],
  },
  products: [
    p({ title: "Aaram Three-Seater Sofa", category: "living", price: 64999, mrp: 74999, options: [["Fabric", ["Oat linen|#d9cfbf", "Olive cotton|#6b705c", "Charcoal|#3a3a3a"]]], short: "A deep, low sofa with a solid sheesham frame and feather-blend cushions.", description: desc("Our most comfortable sofa: deep seats for sitting cross-legged, a solid sheesham frame and seat cushions of foam wrapped in a feather blend.", ["Solid sheesham frame, 5-year warranty", "Removable, washable covers", "Seat depth 62 cm, height 42 cm"]), specs: [["Dimensions", "W 210 × D 92 × H 80 cm"], ["Frame", "Solid sheesham wood"], ["Upholstery", "Linen-cotton blend, removable"], ["Seat", "High-resilience foam, feather-blend wrap"], ["Assembly", "Legs attach, done by our team"], ["Warranty", "5 years frame, 1 year upholstery"]], tags: ["sofa", "solid-wood"], collections: ["bestsellers"], featured: true, weightGrams: 62000, img: { q: "sofa", pick: [7, 0] } }),
    p({ title: "Nook Wingback Armchair", category: "living", price: 24999, options: [["Upholstery", ["Tan|#8a5a3b", "Cognac|#9a4f2a"]]], short: "A classic wingback in soft vegan leather, sized for reading corners.", description: desc("A proper reading chair: high wings to lean into, a sprung seat and solid mango-wood legs, in a footprint that fits a bedroom corner.", ["Fits a 78 cm corner", "Solid mango-wood legs", "Pocket-sprung seat"]), specs: [["Dimensions", "W 78 × D 82 × H 104 cm"], ["Frame", "Solid mango wood"], ["Upholstery", "Vegan leather"], ["Weight capacity", "120 kg"]], tags: ["chair", "solid-wood"], collections: ["small-spaces", "bestsellers"], weightGrams: 14000, img: { q: "chair", pick: [2] } }),
    p({ title: "Tana Wood & Cast-Iron Side Table", category: "living", price: 8999, mrp: 10999, short: "A lacquered sheesham top on hand-cast iron legs.", description: desc("A glossy, heat-resistant sheesham top on decorative cast-iron legs made by a foundry in Aligarh. Just right beside a sofa or armchair.", ["Solid sheesham top, gloss lacquer", "Hand-cast iron legs", "Felt pads protect floors"]), specs: [["Dimensions", "W 50 × D 50 × H 55 cm"], ["Material", "Solid sheesham, cast iron"], ["Finish", "Gloss lacquer"], ["Assembly", "Not required"]], tags: ["table", "solid-wood"], collections: ["bestsellers"], featured: true, weightGrams: 22000, img: { q: "wooden table", pick: [2] } }),
    p({ title: "Kitab Open Bookshelf", category: "living", price: 21999, short: "A five-tier solid-wood bookshelf with adjustable shelves.", description: desc("Tall and slim, with shelves you can move to fit coffee-table books or plants. Anchors to the wall for safety.", ["Five shelves, three adjustable", "Wall anchor kit included", "Solid mango wood"]), specs: [["Dimensions", "W 90 × D 35 × H 180 cm"], ["Material", "Solid mango wood"], ["Shelf load", "20 kg each"], ["Assembly", "By our team"]], tags: ["storage", "solid-wood"], collections: ["small-spaces"], weightGrams: 38000, img: { q: "shelf", pick: [4, 5] } }),
    p({ title: "Neend Solid Wood Queen Bed", category: "bedroom", price: 49999, mrp: 57999, options: [["Size", ["Queen", "King"]]], short: "A low platform bed in sheesham with a slatted headboard.", description: desc("Clean lines and a low profile make small bedrooms feel bigger. The solid slats need no box spring.", ["Solid sheesham frame and slats", "Fits a standard 150 × 195 cm mattress (queen)", "Under-bed clearance 18 cm"]), specs: [["Dimensions (queen)", "W 162 × L 208 × H 95 cm"], ["Material", "Solid sheesham wood"], ["Mattress", "Not included"], ["Assembly", "By our team"], ["Warranty", "5 years"]], tags: ["bed", "solid-wood"], collections: ["bestsellers"], featured: true, weightGrams: 85000, img: { q: "bed", pick: [5, 1] } }),
    p({ title: "Kora Cotton Bedding Set", category: "bedroom", price: 3499, mrp: 4299, options: [["Size", ["Queen", "King"]], ["Colour", ["White|#f6f4ef", "Stone|#cfc6b6"]]], short: "A 300-thread-count cotton sheet set that gets softer with every wash.", description: desc("Breathable percale for hot nights: crisp, cool and made from long-staple cotton woven in Panipat.", ["300 TC cotton percale", "Fitted sheet fits mattresses up to 25 cm deep", "Pre-washed to prevent shrinking"]), specs: [["Contents", "1 fitted sheet, 1 flat sheet, 2 pillow covers"], ["Material", "100% cotton, 300 TC percale"], ["Made in", "Panipat, India"]], care: "Machine wash at 40 °C. Tumble dry low or line dry in shade.", hsn: "6302", tags: ["bedding", "under-5000"], collections: ["bestsellers"], weightGrams: 1800, img: { q: "pillow", pick: [0] } }),
    p({ title: "Ghar Bedside Table", category: "bedroom", price: 7999, short: "A drawer-and-shelf bedside table in mango wood.", description: desc("Just enough space for a lamp, a book and a glass of water, with a soft-close drawer for everything else.", ["Soft-close drawer", "Open shelf below", "Solid mango wood with brass handle"]), specs: [["Dimensions", "W 45 × D 38 × H 55 cm"], ["Material", "Solid mango wood, brass handle"], ["Assembly", "Not required"]], tags: ["bedside", "solid-wood"], collections: ["small-spaces"], weightGrams: 12000, img: { q: "bedroom", pick: [0, 3] } }),
    p({ title: "Sabha Six-Seater Dining Table", category: "dining", price: 42999, mrp: 49999, short: "A solid-wood dining table that seats six comfortably.", description: desc("A thick sheesham top on tapered legs, finished to take everyday meals, homework and board games.", ["Seats six", "Solid sheesham, 4 cm top", "Heat- and water-resistant oil finish"]), specs: [["Dimensions", "L 180 × W 90 × H 76 cm"], ["Material", "Solid sheesham wood"], ["Seats", "6"], ["Assembly", "By our team"], ["Warranty", "5 years"]], tags: ["dining-table", "solid-wood"], collections: ["bestsellers"], featured: true, weightGrams: 60000, img: { q: "dining table", pick: [0] } }),
    p({ title: "Jodh Dining Chairs (Set of 2)", category: "dining", price: 15999, short: "Bentwood dining chairs with a curved back and a solid seat.", description: desc("A café classic: steam-bent wood curved into a comfortable back, with a solid, contoured seat. Light enough to move around easily.", ["Set of two", "Steam-bent wood back", "Walnut-stained finish"]), specs: [["Dimensions", "W 45 × D 50 × H 84 cm (each)"], ["Seat height", "46 cm"], ["Material", "Solid beech wood, walnut stain"]], tags: ["chair", "solid-wood"], collections: ["work-from-home"], weightGrams: 14000, img: { q: "wooden chair", pick: [0] } }),
    p({ title: "Aangan Painted Wooden Bench", category: "dining", price: 11999, short: "A long white-painted bench for the verandah, the entrance or the dining table.", description: desc("Simple, sturdy and endlessly useful, with a durable white finish that suits indoors and covered verandahs.", ["Solid pine, white weatherproof paint", "Seats 2–3", "Doubles as a shoe bench"]), specs: [["Dimensions", "L 140 × W 38 × H 45 cm"], ["Material", "Solid pine, white paint"], ["Weight capacity", "250 kg"]], tags: ["bench"], collections: ["small-spaces"], weightGrams: 18000, img: { q: "bench", pick: [7] } }),
    p({ title: "Kaam Writing Desk", category: "living", price: 16999, mrp: 19999, short: "A compact desk with a cable tray and a slim drawer.", description: desc("A 110 cm desk that fits in a bedroom corner, with a hidden tray to keep chargers and cables tidy.", ["Built-in cable tray", "Slim drawer for stationery", "Solid ash legs"]), specs: [["Dimensions", "W 110 × D 55 × H 76 cm"], ["Material", "White lacquered top, solid ash legs"], ["Assembly", "By our team"]], tags: ["desk", "solid-wood"], collections: ["work-from-home", "small-spaces"], weightGrams: 26000, img: { q: "desk", pick: [0] } }),
    p({ title: "Roshni Black Task Lamp", category: "lighting", price: 4499, short: "An adjustable metal desk lamp with a matte black finish.", description: desc("A counter-balanced arm and a pivoting shade put light exactly where you need it. Takes a standard E27 bulb.", ["Matte black steel", "Adjustable arm and shade", "In-line switch, 1.8 m cable"]), specs: [["Height", "42–60 cm"], ["Shade", "Ø 15 cm, steel"], ["Bulb", "E27, up to 40 W LED (not included)"], ["Warranty", "1 year"]], hsn: "9405", care: "Dust with a dry cloth. Switch off before cleaning.", tags: ["lamp", "under-5000"], collections: ["work-from-home"], weightGrams: 3000, img: { q: "lamp", pick: [6] } }),
    p({ title: "Kiran Linen Wall Sconce", category: "lighting", price: 3999, mrp: 4799, short: "A plug-in wall light with a linen shade. No electrician needed.", description: desc("Screws to the wall and plugs into a socket, so you can add light beside a bed or sofa without rewiring.", ["Plug-in, with cord cover", "Linen drum shade", "Brass-finish arm"]), specs: [["Projection", "28 cm"], ["Shade", "Ø 20 cm, linen"], ["Cable", "2 m with switch"], ["Bulb", "E27, up to 40 W LED (not included)"]], hsn: "9405", care: "Dust with a dry cloth.", tags: ["lamp"], collections: ["small-spaces"], weightGrams: 12000, img: { q: "lamp", pick: [1] } }),
    p({ title: "Diya Glass Pendant Light", category: "lighting", price: 4299, short: "A hand-blown glass pendant with a warm, softly diffused glow.", description: desc("Blown by hand in Firozabad, each shade is slightly different. Hang one above a side table or three in a row over the dining table.", ["Hand-blown glass, Firozabad", "Adjustable 1.2 m cord", "E27 holder"]), specs: [["Shade", "Ø 22 cm glass"], ["Cord", "Adjustable up to 1.2 m"], ["Bulb", "E27, up to 40 W LED"]], hsn: "9405", care: "Clean glass with a soft damp cloth when switched off and cool.", tags: ["pendant", "under-5000"], weightGrams: 2000, img: { q: "light bulb", pick: [1, 6] } }),
    p({ title: "Mitti Ceramic Vase", category: "decor", price: 1899, options: [["Colour", ["Blush|#d9a79b", "Ivory|#efe8dc"]]], short: "A hand-thrown stoneware vase with a matte glaze.", description: desc("Thrown on the wheel in Khurja and glazed in soft matte colours. Waterproof inside, for fresh or dried stems.", ["Hand-thrown stoneware", "Waterproof glaze inside", "Each piece is unique"]), specs: [["Dimensions", "Ø 14 × H 24 cm"], ["Material", "Stoneware"], ["Made in", "Khurja, India"]], hsn: "6913", care: "Hand wash only.", tags: ["vase", "under-5000"], collections: ["bestsellers"], weightGrams: 1600, img: { q: "vase", pick: [7] } }),
    p({ title: "Chakra Round Wall Mirror", category: "decor", price: 6499, short: "A 70 cm round mirror with a slim solid-wood frame.", description: desc("A large round mirror bounces light around a small room. The frame is solid mango wood with an oil finish.", ["70 cm diameter", "Solid mango-wood frame", "Hanging hardware included"]), specs: [["Diameter", "70 cm"], ["Frame", "Solid mango wood"], ["Glass", "5 mm, distortion-free"]], hsn: "7009", tags: ["mirror", "solid-wood"], collections: ["small-spaces"], weightGrams: 9000, img: { q: "mirror", pick: [2] } }),
    p({ title: "Samay Brass Table Clock", category: "decor", price: 2499, short: "A brass-finish table clock with a silent movement and Roman numerals.", description: desc("An old-fashioned face in a brass-finish case, with a modern silent movement, so no ticking at night.", ["Silent sweep movement", "Brass-finish metal case", "Runs on one AA battery"]), specs: [["Size", "Ø 12 × H 15 cm"], ["Movement", "Silent sweep quartz"], ["Battery", "1 × AA (not included)"]], hsn: "9105", tags: ["clock", "under-5000"], weightGrams: 1500, img: { q: "clock", pick: [2] } }),
    p({ title: "Bunai Seagrass Storage Baskets (Set of 3)", category: "decor", price: 2799, short: "Hand-woven seagrass baskets for toys, throws and laundry.", description: desc("Woven by hand in Kerala. Nest them when not in use, fill them with throws, plants or toys when you do.", ["Set of three nesting sizes", "Hand-woven seagrass", "Sturdy side handles"]), specs: [["Sizes", "Ø 30, 35, 40 cm"], ["Material", "Seagrass"], ["Made in", "Kerala, India"]], hsn: "4602", care: "Wipe with a damp cloth; dry in shade.", tags: ["basket", "under-5000"], collections: ["small-spaces"], weightGrams: 2000, img: { q: "basket", pick: [2] } }),
    p({ title: "Bunai Knitted Cotton Throw", category: "decor", price: 3299, mrp: 3999, short: "A chunky hand-knitted throw in soft cotton.", description: desc("Knitted by hand by a women's collective in Ludhiana. Throw it over a sofa arm or the foot of the bed for cool evenings.", ["Hand-knitted", "Soft, breathable cotton", "130 × 170 cm"]), specs: [["Size", "130 × 170 cm"], ["Material", "100% cotton"], ["Made in", "Ludhiana, India"]], hsn: "6304", care: "Gentle machine wash, cold. Dry in shade.", tags: ["throw", "under-5000"], collections: ["bestsellers"], weightGrams: 1200, img: { q: "blanket", pick: [0] } }),
    p({ title: "Hari Terracotta Planter", category: "decor", price: 1299, options: [["Size", ["Medium (Ø 20 cm)", "Large (Ø 28 cm)"]]], short: "A classic terracotta pot with a drainage hole and saucer.", description: desc("Terracotta breathes, so roots stay healthy in Indian summers. Comes with a matching saucer.", ["Natural terracotta", "Drainage hole and saucer", "For indoor and outdoor plants"]), specs: [["Material", "Terracotta"], ["Includes", "Saucer"], ["Made in", "India"]], hsn: "6912", care: "Rinse and dry; soak before first use.", tags: ["planter", "under-5000"], weightGrams: 3000, img: { q: "plant pot", pick: [2] } }),
  ],
};

export default spec;
