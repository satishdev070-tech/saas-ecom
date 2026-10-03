import type { ShowcaseSpec, ShowProduct } from "../types";

const CARE_APPLIANCE = "Unplug and let it cool before cleaning. Wipe the body with a soft, damp cloth; never immerse the base or motor unit in water. Use a stabilised 230 V socket with earthing.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "8516", care: CARE_APPLIANCE, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Highlights\n${points.map((t) => `- ${t}`).join("\n")}`;
const tile = (kind: "category" | "collection", slugs: string[]) =>
  slugs.map((c) => ({ id: `$${kind}:${c}`, imagePath: kind === "category" ? `$catimg:${c}` : `$colimg:${c}`, label: "" }));

const spec: ShowcaseSpec = {
  slug: "griha-smart",
  name: "Griha Smart",
  industry: "smart-home",
  owner: "Ananya Kulkarni",
  theme: "modern-kitchen",
  tagline: "Appliances that make a home run itself",
  story: [
    "Griha Smart began in 2019 as a small appliance counter on Baner Road in Pune, run by two engineers who were tired of explaining why a 'turbo' mixer kept tripping the fuse. We now design and source a short list of kitchen appliances, fans, lighting and home-care products, built for Indian kitchens, 230 V supply and long power cuts.",
    "Every product is tested for a month in our own homes before it reaches the shelf. Appliances carry a home-service warranty across 120 cities, installation is free for fans and cooktops, and our support team answers on WhatsApp in English, Hindi and Marathi.",
  ],
  email: "hello@grihasmart.test",
  phone: "+91 20 4860 3175",
  address: { line1: "Shop 4, Sai Plaza, Baner Road, near Balewadi Phata", city: "Pune", state: "Maharashtra", postal_code: "411045" },
  legalName: "Griha Smart Appliances Private Limited",
  seo: { title: "Griha Smart — Kitchen appliances, fans, lighting & home care", description: "Kettles, toasters, coffee makers, fans, lamps, irons and vacuums built for Indian homes. Home-service warranty, free installation and free delivery above ₹1,499." },
  announcement: ["Free delivery on orders above ₹1,499", "Free installation on fans and cooktops", "Home-service warranty in 120 cities"],
  categories: [
    { slug: "kitchen", name: "Kitchen Appliances", description: "Toasters, cooktops, pressure cookers and scales for everyday Indian cooking." },
    { slug: "beverages", name: "Tea & Coffee", description: "Kettles, coffee makers, espresso machines and grinders." },
    { slug: "climate", name: "Fans & Cooling", description: "Energy-efficient BLDC ceiling fans, table and pedestal fans." },
    { slug: "lighting", name: "Lighting", description: "Desk lamps, floor lamps, pendants and warm LED bulbs." },
    { slug: "cleaning", name: "Cleaning & Laundry", description: "Vacuum cleaners and steam irons that save an hour a day." },
    { slug: "smart-security", name: "Smart Home", description: "Digital door locks and app-controlled bulbs." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "The appliances Griha Smart customers reorder and recommend most." },
    { slug: "new-home", title: "New home essentials", description: "Everything a new kitchen and living room needs in the first week." },
    { slug: "energy-saver", title: "Energy savers", description: "BEE 5-star fans, LED lighting and efficient appliances that cut the power bill.", tag: "energy-saver" },
    { slug: "morning-routine", title: "The morning routine", description: "Tea, coffee and toast, ready before the school bus." },
    { slug: "gifts-under-2999", title: "Gifts under ₹2,999", description: "Housewarming gifts people actually use.", tag: "under-2999" },
  ],
  menu: [
    { title: "Kitchen", to: "/categories/kitchen" },
    { title: "Tea & Coffee", to: "/categories/beverages" },
    { title: "Fans", to: "/categories/climate" },
    { title: "Lighting", to: "/categories/lighting" },
    { title: "Cleaning", to: "/categories/cleaning" },
    { title: "Smart Home", to: "/categories/smart-security", children: [{ title: "Energy savers", to: "/collections/energy-saver" }, { title: "New home essentials", to: "/collections/new-home" }] },
    { title: "Gifts under ₹2,999", to: "/collections/gifts-under-2999" },
  ],
  faqs: [
    ["Do your appliances work on Indian voltage?", "Yes. Every appliance is rated for 220–240 V, 50 Hz, and ships with an Indian 3-pin plug. High-wattage products (2,000 W and above) should go on a 16 A socket."],
    ["How does the warranty work?", "Register your product from the order page. If anything goes wrong, raise a request on WhatsApp or the website and a technician visits your home, usually within 48 hours in metro cities. Warranty periods are listed on each product page."],
    ["Is installation included?", "Ceiling fans, wall lights and gas cooktops are installed free in our service cities. We call to book a slot after delivery."],
    ["What does the star rating mean?", "Fans and some appliances carry a BEE star rating: more stars means lower power use for the same output. A 5-star BLDC ceiling fan uses about 28 W at full speed, against 75 W for an older fan."],
    ["How long does delivery take?", "Pune and Mumbai in 1–2 working days, other metro cities in 2–4, the rest of India in 4–7. Large items ship with tracked courier and are opened in front of you on request."],
    ["Can I return an appliance?", "Unused products in original packing can be returned within 7 days. If a product arrives damaged or stops working within 10 days, we replace it, no questions asked."],
  ],
  shippingNote: "Free delivery on orders above ₹1,499, otherwise ₹99. Pune and Mumbai in 1–2 working days, other metros in 2–4, the rest of India in 4–7. Cash on delivery up to ₹20,000.",
  returnsNote: "7-day returns on unused products in original packing. Damaged on arrival or defective within 10 days: free replacement with pickup from your home. After that, the home-service warranty applies.",
  images: {
    hero: { q: "modern kitchen", pick: [1] },
    hero2: { q: "ceiling fan", pick: [7] },
    feature: { q: "espresso machine", pick: [5] },
    "feature-2": { q: "lamp", pick: [2] },
    story: { q: "kitchen", pick: [4] },
    "promo-a": { q: "kettle", pick: [3] },
    "promo-b": { q: "light bulb", pick: [6] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A bright kitchen with pendant lights over the counter", eyebrow: "New home, new kitchen", heading: "A kitchen that keeps up with you", subheading: "Cooktops, pressure cookers and toasters built for Indian cooking and 230 V supply.", ctaLabel: "Shop kitchen", ctaHref: "/categories/kitchen" },
          { imagePath: "$img:hero2", alt: "A bedroom with a ceiling fan and soft daylight", eyebrow: "BEE 5-star BLDC", heading: "Cool rooms, lower bills", subheading: "Ceiling fans that use 28 W and run longer on an inverter. Installed free.", ctaLabel: "Shop fans", ctaHref: "/categories/climate" },
        ],
      },
    ],
    marquee: ["Marquee", { items: [{ text: "Free delivery above ₹1,499" }, { text: "Free installation on fans & cooktops" }, { text: "Home-service warranty" }, { text: "No-cost EMI from ₹2,999" }, { text: "Cash on delivery" }] }],
    categories: ["CategoryGrid", { eyebrow: "Departments", heading: "Shop by room and routine", mode: "manual", items: tile("category", ["kitchen", "beverages", "climate", "lighting", "cleaning", "smart-security"]) }],
    collections: ["CollectionGrid", { eyebrow: "Curated", heading: "Start here", mode: "manual", items: tile("collection", ["new-home", "energy-saver", "morning-routine"]) }],
    kitchen: ["ProductCarousel", { eyebrow: "Kitchen", heading: "Cook smarter every day", subheading: "Appliances tested in real Indian kitchens.", source: "category", categoryId: "$category:kitchen", viewAllHref: "/categories/kitchen" }],
    lighting: ["ProductGrid", { heading: "Light, done well", subheading: "Warm LEDs, honest materials.", source: "category", categoryId: "$category:lighting", viewAllHref: "/categories/lighting" }],
    climate: ["ProductCarousel", { eyebrow: "Summer ready", heading: "Fans & cooling", source: "category", categoryId: "$category:climate", viewAllHref: "/categories/climate" }],
    new: ["ProductGrid", { eyebrow: "Just in", heading: "New arrivals", source: "newest", viewAllHref: "/collections" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    deals: ["ProductGrid", { eyebrow: "Limited time", heading: "Deals of the day", source: "sale", viewAllHref: "/collections" }],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "Espresso pouring into a cup from a home machine", eyebrow: "Café at home", heading: "Your morning cappuccino, for ₹12", body: "A good espresso machine pays for itself in a few months of skipped café visits. Ours has a 15-bar pump and a steam wand that froths milk properly, and heats up while you find a cup.", ctaLabel: "Shop tea & coffee", ctaHref: "/categories/beverages" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "A wall lamp against a pale green wall", eyebrow: "Lighting", heading: "Warm light, a fraction of the watts", body: "Swap harsh tube lights for layered, warm light: a lamp to read by, a pendant over the table, filament bulbs where you want a glow. Every bulb we sell is LED, most use under 10 W.", ctaLabel: "Shop lighting", ctaHref: "/categories/lighting" },
    ],
    story: [
      "BrandStory",
      { eyebrow: "Since 2019, Pune", heading: "Tested in our homes first", body: "Griha Smart started as an appliance counter on Baner Road run by two engineers. We still test every product for a month in our own kitchens and living rooms, through monsoon voltage drops and summer power cuts, before it goes on sale. If it isn't good enough for our homes, it isn't on the shelf.", imagePath: "$img:story", alt: "A sunlit kitchen counter with a coffee grinder", stats: [{ value: "120", label: "Service cities" }, { value: "48 h", label: "Typical home visit" }, { value: "230 V", label: "Rated for Indian supply" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    rooms: ["Lookbook", { eyebrow: "Shop the room", heading: "In real homes", looks: [2, 4, 9, 15, 17, 12].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "Hot water pouring from a kettle", heading: "The morning routine", text: "Kettles, toasters and coffee makers from ₹1,299.", ctaLabel: "Shop the routine", ctaHref: "/collections/morning-routine" },
          { imagePath: "$img:promo-b", alt: "A glowing filament bulb", heading: "Energy savers", text: "5-star fans and LED lighting that cut the bill.", ctaLabel: "Shop energy savers", ctaHref: "/collections/energy-saver" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "Monsoon home sale", heading: "Up to 30% off fans, kitchen & cleaning", subheading: "Use code GRIHA10 for an extra 10% off orders above ₹4,999.", ctaLabel: "Shop the sale", ctaHref: "/collections/bestsellers", background: "#0b1f3a", textColor: "#fff7ed" }],
    brands: ["BrandStrip", { eyebrow: "Our ranges", heading: "", items: ["Griha Kitchen", "Griha Brew", "Griha Air", "Griha Light", "Griha Care", "Griha Secure"].map((name) => ({ name, imagePath: "", href: "" })) }],
    trust: [
      "TrustBadges",
      {
        items: [
          { icon: "secure", title: "Home-service warranty", text: "Technician visit in 120 cities" },
          { icon: "truck", title: "Free delivery", text: "On orders above ₹1,499" },
          { icon: "india", title: "Built for 230 V", text: "Tested for Indian supply" },
          { icon: "return", title: "7-day returns", text: "Free replacement if defective" },
        ],
      },
    ],
    faq: ["FAQ", { heading: "Before you buy", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Appliance tips, once a month", subheading: "Care guides, energy-saving ideas and early access to sales.", buttonLabel: "Subscribe" }],
  },
  products: [
    // ---- Kitchen appliances
    p({ title: "Crisp 2-Slice Pop-Up Toaster", category: "kitchen", price: 1899, mrp: 2499, options: [["Colour", ["Matte white|#f2f1ee", "Blush|#d9b8b0"]]], short: "A wide-slot toaster with seven browning levels and a crumb tray that slides out.", description: desc("Wide slots take thick bread, pav and bun halves; seven browning levels go from barely warm to properly crisp. Reheat warms cold toast without browning it further, and defrost handles bread straight from the freezer.", ["Extra-wide 36 mm slots with self-centring guides", "7 browning levels, defrost, reheat and cancel", "Slide-out crumb tray, cool-touch body"]), specs: [["Power", "850 W"], ["Voltage", "230 V, 50 Hz"], ["Slots", "2, extra wide"], ["Browning levels", "7"], ["Warranty", "2 years"], ["Body", "Cool-touch PP"]], tags: ["toaster", "breakfast", "under-2999"], collections: ["bestsellers", "morning-routine", "new-home"], featured: true, weightGrams: 1600, img: { q: "toaster", pick: [0, 5] } }),
    p({ title: "Nutri Personal Blender", category: "kitchen", price: 2799, mrp: 3499, short: "A compact 600 W blender that blends smoothies, lassi and chutneys straight into a travel bottle.", description: desc("Load fruit, curd or soaked almonds into the bottle, twist it onto the base and blend in under a minute. Swap the blade for a lid and take it to work. A second jar handles coconut chutney and masala pastes.", ["600 W motor, 22,000 RPM", "2 tritan bottles (600 ml and 400 ml) with sipper lids", "Stainless-steel blade, safety interlock"]), specs: [["Power", "600 W"], ["Voltage", "230 V, 50 Hz"], ["Capacity", "600 ml + 400 ml"], ["Material", "BPA-free tritan, 304 stainless-steel blade"], ["Warranty", "2 years on motor"]], care: "Rinse bottles and blade right after use; bottles are top-rack dishwasher safe. Never immerse the motor base.", tags: ["blender", "smoothie", "under-2999"], collections: ["bestsellers", "morning-routine", "gifts-under-2999"], featured: true, weightGrams: 1700, img: { q: "blender", pick: [0] } }),
    p({ title: "Agni 4-Burner Glass-Top Gas Hob", category: "kitchen", price: 12999, mrp: 16500, short: "A built-in toughened-glass hob with brass burners and auto ignition.", description: desc("Four forged brass burners, including a high-flame wok burner for tadka and stir-fries, set into 8 mm toughened glass. Flame-failure safety cuts the gas if the flame blows out. Installation is free in our service cities.", ["Forged brass burners, 1 high-flame", "Auto ignition and flame-failure safety", "8 mm toughened glass, cast-iron pan supports"]), specs: [["Burners", "4 (1 high-flame, 2 medium, 1 small)"], ["Ignition", "Battery auto ignition"], ["Gas type", "LPG (PNG convertible)"], ["Top", "8 mm toughened glass"], ["Cut-out", "73 × 48 cm"], ["Warranty", "2 years, 5 years on glass"]], care: "Wipe the glass with a soft cloth once cool. Lift the burner caps to clean; dry fully before refitting. Annual service by a trained technician.", hsn: "7321", tags: ["hob", "cooktop", "installation"], collections: ["new-home"], weightGrams: 14500, img: { q: "gas stove", pick: [9, 1] } }),
    p({ title: "Tolu Digital Kitchen Scale", category: "kitchen", price: 899, mrp: 1199, short: "A slim glass scale that weighs to 1 g, with tare and a bright backlit display.", description: desc("Weigh atta, rice and spices for consistent rotis and baking. The tare button zeroes the bowl, and the scale switches off on its own after two minutes to save the battery.", ["1 g precision up to 5 kg", "Tare, unit switch (g, kg, ml, oz)", "Toughened glass top, 1.5 cm thin"]), specs: [["Capacity", "5 kg"], ["Precision", "1 g"], ["Power", "2 × AAA batteries (included)"], ["Platform", "Toughened glass, 20 × 15 cm"], ["Warranty", "1 year"]], care: "Wipe with a damp cloth. Don't immerse or place hot pans on the glass.", hsn: "8423", tags: ["scale", "baking", "under-2999"], collections: ["gifts-under-2999"], weightGrams: 650, img: { q: "kitchen scale", pick: [1] } }),
    // ---- Fans & cooling
    p({ title: "Hawa BLDC Ceiling Fan with Light (1200 mm)", category: "climate", price: 5999, mrp: 7499, options: [["Finish", ["Walnut|#6b4a2f", "Matte white|#f1f0ec"]]], short: "A 5-star BLDC fan with an LED light, remote and wooden-look blades that uses just 28 W.", description: desc("A brushless DC motor moves the same air as an ordinary fan for about a third of the electricity, and runs longer on an inverter during power cuts. The remote controls five speeds, a sleep timer and the built-in warm LED light.", ["BEE 5-star, 28 W at top speed", "Remote with 5 speeds, timer and light control", "Integrated 18 W LED light, free installation"]), specs: [["Sweep", "1200 mm"], ["Power", "28 W (fan), 18 W (light)"], ["Voltage", "140–285 V"], ["Air delivery", "230 CMM"], ["Energy rating", "BEE 5-star"], ["Warranty", "3 years"]], care: "Switch off and wipe blades with a dry microfibre cloth every month.", hsn: "8414", tags: ["fan", "bldc", "energy-saver", "installation"], collections: ["bestsellers", "new-home"], featured: true, weightGrams: 6200, img: { q: "ceiling fan", pick: [6, 10] } }),
    p({ title: "Breeze 400 mm Table Fan", category: "climate", price: 2299, mrp: 2799, short: "A quiet white table fan with tilt, oscillation and three speeds.", description: desc("A compact, quiet fan for a study table or bedside. It oscillates through 90°, tilts up and down, and the three push-button speeds are easy to find in the dark.", ["90° oscillation, adjustable tilt", "3 speeds, push-button control", "Copper motor with thermal overload protection"]), specs: [["Sweep", "400 mm"], ["Power", "55 W"], ["Voltage", "230 V, 50 Hz"], ["Speeds", "3"], ["Warranty", "2 years"]], care: "Unplug and wipe the guard and blades with a dry cloth.", hsn: "8414", tags: ["fan", "under-2999"], collections: ["gifts-under-2999"], weightGrams: 2900, img: { q: "fan", pick: [0] } }),
    p({ title: "Toofan High-Speed Pedestal Fan", category: "climate", price: 3799, mrp: 4599, short: "A powerful black pedestal fan with height adjustment for living rooms and terraces.", description: desc("A strong, steady breeze for big rooms. The pole adjusts in height, the head tilts and oscillates, and a weighted round base keeps it steady on any floor.", ["High-speed 1350 RPM motor", "Height adjustable 1.1–1.4 m", "Weighted base, 3 speeds"]), specs: [["Sweep", "450 mm"], ["Power", "110 W"], ["Voltage", "230 V, 50 Hz"], ["Speed", "1350 RPM"], ["Warranty", "2 years"]], care: "Unplug and wipe the guard and blades with a dry cloth.", hsn: "8414", tags: ["fan"], weightGrams: 6400, img: { q: "fan", pick: [1] } }),
    // ---- Lighting
    p({ title: "Kaam Adjustable Desk Lamp", category: "lighting", price: 2499, mrp: 2999, options: [["Colour", ["Matte black|#1f1f1f", "Warm white|#efe9df"]]], short: "A metal swing-arm desk lamp with a weighted base and a warm LED bulb.", description: desc("A classic swing-arm lamp that puts light exactly where you need it: on the page, the keyboard or the sewing. The steel shade stays cool and the weighted base keeps it from tipping.", ["Swing arm and pivoting shade", "Weighted steel base", "Includes 7 W warm LED bulb (E27)"]), specs: [["Bulb", "7 W LED, E27, 2700 K (included)"], ["Voltage", "230 V, 50 Hz"], ["Material", "Powder-coated steel"], ["Height", "Up to 52 cm"], ["Warranty", "1 year"]], care: "Switch off and wipe with a dry cloth.", hsn: "9405", tags: ["lamp", "energy-saver", "under-2999"], collections: ["gifts-under-2999"], weightGrams: 1800, img: { q: "lamp", pick: [6] } }),
    p({ title: "Noor Paper Lantern Pendant", category: "lighting", price: 1799, short: "A round rice-paper pendant that turns any bulb into soft, even light.", description: desc("A light, airy pendant in white rice paper on a wire frame. It diffuses a single bulb into a soft glow that suits bedrooms, dining tables and reading corners.", ["45 cm rice-paper shade", "1.2 m adjustable white cord", "Fits any E27 LED bulb up to 12 W"]), specs: [["Diameter", "45 cm"], ["Bulb", "E27, LED up to 12 W (not included)"], ["Voltage", "230 V"], ["Material", "Rice paper on steel wire"], ["Warranty", "6 months"]], care: "Dust gently with a soft brush. Keep away from moisture.", hsn: "9405", tags: ["pendant", "under-2999"], collections: ["new-home", "gifts-under-2999"], weightGrams: 450, img: { q: "pendant light", pick: [1] } }),
    p({ title: "Tripod Floor Lamp", category: "lighting", price: 4999, mrp: 5999, short: "A slim floor lamp with a fabric shade and a foot switch, for reading corners.", description: desc("A tall, slender lamp that throws warm light over a sofa or armchair without taking up floor space. A foot switch on the cord means no reaching for the wall.", ["Fabric drum shade", "Foot switch on the cord", "Includes 9 W warm LED bulb (E27)"]), specs: [["Height", "155 cm"], ["Bulb", "9 W LED, E27, 2700 K (included)"], ["Voltage", "230 V, 50 Hz"], ["Material", "Steel, linen-look shade"], ["Warranty", "1 year"]], care: "Wipe the base with a dry cloth; dust the shade with a lint roller.", hsn: "9405", tags: ["lamp", "energy-saver"], collections: ["new-home"], weightGrams: 3200, img: { q: "desk lamp", pick: [15] } }),
    p({ title: "Amber Filament LED Bulbs (Pack of 4)", category: "lighting", price: 999, mrp: 1299, short: "Vintage-style filament bulbs with a warm amber glow, at 6 W each.", description: desc("The warm look of an old incandescent bulb at a tenth of the electricity. Clear amber glass shows the slim LED filaments; perfect for pendants and exposed fittings.", ["6 W LED, equivalent to 60 W", "Warm 2200 K amber glow", "Lasts about 15,000 hours"]), specs: [["Power", "6 W each"], ["Cap", "E27"], ["Colour temperature", "2200 K"], ["Brightness", "600 lumens"], ["Voltage", "220–240 V"], ["Warranty", "1 year"]], care: "Switch off and let cool before handling.", hsn: "8539", tags: ["bulb", "energy-saver", "under-2999"], collections: ["gifts-under-2999"], weightGrams: 260, img: { q: "light bulb", pick: [2] } }),
    // ---- Cleaning & laundry
    p({ title: "Press-Perfect Steam Iron", category: "cleaning", price: 2199, mrp: 2799, options: [["Colour", ["Teal|#2a9d9f", "Lilac|#b9a3c9"]]], short: "A 2000 W steam iron with a non-stick soleplate, vertical steam and anti-drip.", description: desc("Strong continuous steam takes creases out of cotton kurtas and linen shirts in one pass. Hold it upright to refresh hanging curtains and blazers; the anti-drip system stops water spots on silk.", ["2000 W with 30 g/min continuous steam", "Vertical steam, burst of steam and spray", "Non-stick soleplate, self-clean and anti-calc"]), specs: [["Power", "2000 W"], ["Voltage", "230 V, 50 Hz"], ["Steam", "30 g/min, 120 g burst"], ["Water tank", "300 ml"], ["Cord", "2 m, 360° swivel"], ["Warranty", "2 years"]], care: "Empty the tank after use and run self-clean monthly. Store upright once cool.", tags: ["iron", "laundry", "under-2999"], collections: ["new-home", "gifts-under-2999"], weightGrams: 1300, img: { q: "steam iron", pick: [0, 2] } }),
    p({ title: "Swift Bagless Upright Vacuum", category: "cleaning", price: 6999, mrp: 8499, short: "A slim corded upright vacuum with a motorised brush for floors, rugs and dhurries.", description: desc("Pulls dust and hair out of rugs and the grout lines of tiled floors in one pass. The bagless cyclone bin empties with one press, and the hose lifts off for sofas, curtains and ceiling corners.", ["Bagless cyclone, 1.2 L bin", "Motorised floor brush with carpet and hard-floor settings", "Detachable hose with crevice and dusting tools"]), specs: [["Power", "1200 W"], ["Voltage", "230 V, 50 Hz"], ["Dustbin", "1.2 litres"], ["Filter", "Washable HEPA"], ["Cord", "7 m"], ["Warranty", "2 years"]], care: "Empty the bin after use; rinse the filter monthly and dry fully before refitting.", hsn: "8508", tags: ["vacuum"], weightGrams: 5200, img: { q: "vacuum cleaner", pick: [8] } }),
    // ---- Smart home
    p({ title: "Suraksha Digital Door Lock", category: "smart-security", price: 11999, mrp: 15999, short: "A keypad and RFID door lock with an emergency key and a low-battery alert.", description: desc("Open the door with a PIN, a card or the mechanical key. Give the cook or driver their own code, delete it when you need to, and never worry about duplicate keys again. Free installation in our service cities.", ["PIN, RFID card and mechanical key", "Up to 100 user codes, scramble PIN to hide your code", "Low-battery alert and USB-C emergency power"]), specs: [["Unlock methods", "PIN, RFID card, key"], ["Power", "4 × AA batteries, about 12 months"], ["Door thickness", "35–90 mm"], ["Material", "Zinc alloy, tempered glass"], ["Warranty", "2 years"]], care: "Wipe the keypad with a dry cloth. Change batteries when the alert sounds.", hsn: "8301", tags: ["lock", "smart", "installation"], collections: ["bestsellers", "new-home"], featured: true, weightGrams: 3800, img: { q: "keypad", pick: [0] } }),
    p({ title: "Wi-Fi Smart Filament Bulb", category: "smart-security", price: 799, mrp: 999, short: "An app and voice-controlled filament bulb you can dim and schedule.", description: desc("Screw it into any E27 holder, connect to your 2.4 GHz Wi-Fi and control it from the app or by voice. Dim it for dinner, schedule it to switch on at sunset and off at bedtime.", ["Dimmable from 1% to 100%", "Schedules, timers and away mode", "Works with popular voice assistants, no hub needed"]), specs: [["Power", "7 W"], ["Cap", "E27"], ["Colour temperature", "2500 K"], ["Connectivity", "2.4 GHz Wi-Fi"], ["Voltage", "220–240 V"], ["Warranty", "1 year"]], care: "Switch off before fitting. Not for use with dimmer switches.", hsn: "8539", tags: ["bulb", "smart", "energy-saver", "under-2999"], weightGrams: 120, img: { q: "edison bulb", pick: [5] } }),
    // ---- Tea & coffee
    p({ title: "Chai-Time 1.5 L Electric Kettle", category: "beverages", price: 1499, mrp: 1999, short: "A quick-boil cordless kettle with a 360° base and auto shut-off.", description: desc("Boils a full 1.5 litres in about four minutes for tea, instant noodles or a hot-water bottle. Lift it off the 360° base from any side; it switches off on its own when the water boils or the kettle runs dry.", ["Auto shut-off and boil-dry protection", "Cordless 360° base with cord storage", "Removable limescale filter"]), specs: [["Power", "1500 W"], ["Voltage", "230 V, 50 Hz"], ["Capacity", "1.5 litres"], ["Inner body", "304 stainless steel"], ["Warranty", "2 years"]], care: "Descale monthly with a lemon and water boil. Never immerse the base.", tags: ["kettle", "under-2999"], collections: ["bestsellers", "morning-routine", "gifts-under-2999"], featured: true, weightGrams: 1100, img: { q: "electric kettle", pick: [0, 1] } }),
    p({ title: "Filter Brew Drip Coffee Maker", category: "beverages", price: 3499, mrp: 4299, short: "A 6-cup drip coffee maker with a reusable filter and a keep-warm plate.", description: desc("Add ground coffee, pour in water and press one button. A shower head wets the grounds evenly for a smooth cup, and the hot plate keeps the carafe warm for 40 minutes before switching off.", ["Brews up to 6 cups (750 ml)", "Reusable mesh filter, no paper needed", "Anti-drip pause to pour mid-brew"]), specs: [["Power", "750 W"], ["Voltage", "230 V, 50 Hz"], ["Capacity", "750 ml (6 cups)"], ["Keep warm", "40 minutes, auto off"], ["Warranty", "1 year"]], tags: ["coffee"], collections: ["morning-routine"], weightGrams: 1900, img: { q: "coffee maker", pick: [0] } }),
    p({ title: "Barista Home Espresso Machine", category: "beverages", price: 18999, mrp: 22999, short: "A 15-bar espresso machine with a steam wand for cappuccinos at home.", description: desc("A compact pump espresso machine with a commercial-size 58 mm portafilter and a steam wand that textures milk for lattes. Heats up in 40 seconds; the cup tray on top keeps cups warm.", ["15-bar pump, 58 mm portafilter", "Manual steam wand for milk foam", "1.8 L removable water tank"]), specs: [["Power", "1450 W"], ["Voltage", "230 V, 50 Hz"], ["Pump pressure", "15 bar"], ["Water tank", "1.8 litres"], ["Heat-up", "About 40 seconds"], ["Warranty", "2 years"]], care: "Purge the steam wand after each use. Descale every two months. Never immerse the machine.", tags: ["coffee", "espresso"], collections: ["bestsellers"], featured: true, weightGrams: 6800, img: { q: "espresso machine", pick: [6] } }),
    p({ title: "Burr Coffee Grinder", category: "beverages", price: 4299, mrp: 4999, short: "A conical burr grinder with 18 settings, from espresso-fine to French-press coarse.", description: desc("Freshly ground beans taste better, and burrs grind evenly where blades chop. Choose one of 18 settings and the number of cups; the grinder stops on its own.", ["Stainless-steel conical burrs", "18 grind settings", "200 g bean hopper, 100 g grounds container"]), specs: [["Power", "150 W"], ["Voltage", "230 V, 50 Hz"], ["Grind settings", "18"], ["Hopper", "200 g"], ["Warranty", "1 year"]], care: "Brush the burrs weekly. Don't wash burrs with water; never grind spices or rice.", tags: ["coffee", "grinder"], weightGrams: 1500, img: { q: "coffee grinder", pick: [7] } }),
    p({ title: "Steel Whistling Kettle (Induction-Ready)", category: "beverages", price: 1299, short: "A stainless-steel stovetop kettle that whistles when the water boils.", description: desc("For homes that cook on gas or induction: a heavy, encapsulated base heats evenly, the whistle lets you know when it's ready and the handle stays cool.", ["Works on gas, induction and electric hobs", "Loud whistle, flip-up spout cap", "Cool-touch handle"]), specs: [["Capacity", "2.5 litres"], ["Material", "18/8 stainless steel, encapsulated base"], ["Compatible with", "Gas, induction, ceramic"], ["Warranty", "1 year"]], care: "Hand wash. Don't heat empty.", hsn: "7323", tags: ["kettle", "under-2999"], collections: ["gifts-under-2999"], weightGrams: 1200, img: { q: "kettle", pick: [8] } }),
  ],
};

export default spec;
