import type { ShowcaseSpec, ShowProduct } from "../types";

const WARRANTY = "6-month Khel Studio warranty";
const p = (x: Omit<ShowProduct, "hsn"> & { hsn?: string }): ShowProduct => ({ hsn: "9506", ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;

const spec: ShowcaseSpec = {
  slug: "khel-studio",
  name: "Khel Studio",
  industry: "sports",
  owner: "Harpreet Sandhu",
  theme: "arena-bold",
  tagline: "Gear for every game, from gully to club",
  story: [
    "Khel Studio began in 2019 as a cricket workshop on Basti Sheikh Road in Jalandhar, the city that has made sports goods for India for seventy years. We still knock in every willow bat by hand, and today we also make and source racquets, footballs, home-gym kit and yoga gear for players at every level.",
    "Everything we sell is tested by our own club players first. We ship across India from Jalandhar, offer a six-month warranty on equipment and give honest advice on sizes and weights over WhatsApp.",
  ],
  email: "hello@khelstudio.test",
  phone: "+91 181 462 7710",
  address: { line1: "Plot 18, Basti Sheikh Road, Near Sports Market", city: "Jalandhar", state: "Punjab", postal_code: "144001" },
  legalName: "Khel Studio Sports Private Limited",
  seo: { title: "Khel Studio — Cricket, badminton, football, gym & yoga gear", description: "Hand-finished cricket bats, racquets, footballs, dumbbells, kettlebells and yoga gear from Jalandhar. Free delivery over ₹1,499, 6-month warranty." },
  announcement: ["Free delivery on orders above ₹1,499", "Every bat knocked in by hand in Jalandhar", "Cash on delivery available"],
  categories: [
    { slug: "racquet", name: "Badminton & Tennis", description: "Racquets, shuttles and table-tennis bats for club and court." },
    { slug: "team-sports", name: "Cricket & Team Sports", description: "Hand-knocked willow bats and match balls built for Indian grounds and courts." },
    { slug: "strength", name: "Gym & Strength", description: "Dumbbells, kettlebells, plates, ropes and bands for home workouts." },
    { slug: "yoga", name: "Yoga & Recovery", description: "Mats, blocks and bottles for practice and recovery." },
    { slug: "ride-run", name: "Cycling & Running", description: "Helmets, bar tape, training wear and timing for the road and track." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "What our players buy most." },
    { slug: "home-gym", title: "Home gym starter", description: "Everything for a strong workout in a small space." },
    { slug: "beginners", title: "For beginners", description: "Forgiving, light gear for your first season.", tag: "beginner" },
    { slug: "under-1500", title: "Under ₹1,500", description: "Useful kit that won't stretch the budget.", tag: "under-1500" },
  ],
  menu: [
    { title: "Racquet sports", to: "/categories/racquet" },
    { title: "Cricket & Team Sports", to: "/categories/team-sports" },
    { title: "Gym", to: "/categories/strength" },
    { title: "Yoga", to: "/categories/yoga" },
    { title: "Cycling & Running", to: "/categories/ride-run" },
    { title: "Best sellers", to: "/collections/bestsellers" },
  ],
  faqs: [
    ["Is the cricket bat ready to play?", "Our bats are pre-knocked by hand for about four hours. We still recommend 30 minutes of gentle knocking with an old ball and a light coat of raw linseed oil before your first match."],
    ["How do I choose a bat size?", "Size 6 suits players around 5′3″–5′6″, Harrow 5′6″–5′9″ and Short Handle (SH) most adults above that. Send us your height on WhatsApp if you're unsure."],
    ["How long does delivery take?", "Metro cities usually receive orders in 2–4 working days, the rest of India in 4–7. Heavy items such as plates and kettlebells may take a day longer."],
    ["Is there a warranty?", "Six months on equipment against manufacturing defects, including bat handles and racquet frames under normal use. Wear on grips, strings and balls isn't covered."],
    ["Which dumbbell weight should I start with?", "Most beginners start with 2–4 kg for arms and shoulders and 6–10 kg for squats and lunges. Our home gym starter collection lists a balanced set."],
    ["Do you offer cash on delivery?", "Yes, on orders up to ₹10,000 at most PIN codes."],
  ],
  shippingNote: "Free delivery on orders above ₹1,499; ₹79 below that. Orders placed before 1 pm ship the same working day from Jalandhar.",
  returnsNote: "7-day returns on unused items in original packaging. Bats that have been oiled or knocked can't be returned unless defective; damaged or defective items are replaced free of charge.",
  images: {
    hero: { q: "cricket bowler", pick: [6] },
    hero2: { q: "workout", pick: [2] },
    feature: { q: "running", pick: [1] },
    "feature-2": { q: "yoga", pick: [2] },
    "promo-a": { q: "badminton shuttlecock", pick: [0] },
    "promo-b": { q: "running track", pick: [1] },
    story: { q: "woodworking", pick: [0] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A bowler running in on a green cricket ground", eyebrow: "New season · Cricket", heading: "Built in Jalandhar. Made for match day.", subheading: "Hand-knocked willow bats and match balls for club and gully.", ctaLabel: "Shop cricket", ctaHref: "/categories/team-sports" },
          { imagePath: "$img:hero2", alt: "An athlete training with battle ropes on sand", eyebrow: "Strength & conditioning", heading: "Train strong, anywhere", subheading: "Dumbbells, kettlebells, plates and bands that fit a small room.", ctaLabel: "Shop gym gear", ctaHref: "/categories/strength" },
        ],
      },
    ],
    categories: ["CategoryGrid", { eyebrow: "Pick your game", heading: "Shop by sport", mode: "manual", items: ["team-sports", "racquet", "strength", "yoga", "ride-run"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    trending: ["ProductCarousel", { eyebrow: "Popular this week", heading: "Trending now", source: "featured", viewAllHref: "/collections/bestsellers" }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New arrivals", source: "newest", viewAllHref: "/collections" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    deals: ["ProductGrid", { eyebrow: "Limited time", heading: "Match day deals", source: "sale", viewAllHref: "/collections" }],
    team: ["ProductGrid", { eyebrow: "From our workshop", heading: "Cricket & team sports", subheading: "Hand-knocked willow and match balls for Indian grounds.", source: "category", categoryId: "$category:team-sports", viewAllHref: "/categories/team-sports" }],
    racquet: ["ProductGrid", { heading: "Badminton & tennis", subheading: "Racquets, shuttles and bats for every level.", source: "category", categoryId: "$category:racquet", viewAllHref: "/categories/racquet" }],
    fitness: ["ProductGrid", { eyebrow: "Home gym", heading: "Gym & strength", subheading: "Weights and tools for a strong workout at home.", source: "category", categoryId: "$category:strength", viewAllHref: "/categories/strength" }],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A runner sprinting on the beach", eyebrow: "Training notes", heading: "Speed is a skill. Train it.", body: "Two short sessions a week make a difference: ten 20-metre sprints with full recovery, skipping for footwork, and kettlebell swings for power. Our coaches put together a simple plan that needs only a rope, one kettlebell and some open ground.", ctaLabel: "Shop training gear", ctaHref: "/categories/strength" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "Yoga on a beach at sunrise", eyebrow: "Yoga & recovery", heading: "Recovery is part of training", body: "Twenty minutes on the mat after a match or a heavy session loosens hips and hamstrings and helps you come back fresher. Start with a grippy 6 mm mat and a pair of blocks to make every pose reachable.", ctaLabel: "Shop yoga", ctaHref: "/categories/yoga" },
    ],
    story: [
      "BrandStory",
      { eyebrow: "Our workshop", heading: "Seventy years of sports craft, one street in Jalandhar", body: "Every Khel Studio bat is graded, pressed, shaped and knocked in by hand on Basti Sheikh Road. The same club players who test our bats also test our racquets, balls and gym kit before anything goes on sale.", imagePath: "$img:story", alt: "A hand plane and wood shavings on a workbench", stats: [{ value: "4 hrs", label: "Hand knocking per bat" }, { value: "6 mo", label: "Equipment warranty" }, { value: "19k+", label: "Orders shipped" }], ctaLabel: "About us", ctaHref: "/pages/about" },
    ],
    lookbook: ["Lookbook", { eyebrow: "In play", heading: "Gear in action", looks: [0, 1, 5, 13, 18, 20].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "Feather shuttlecocks on grass", heading: "Court ready", text: "Racquets and feather shuttles.", ctaLabel: "Shop badminton", ctaHref: "/categories/racquet" },
          { imagePath: "$img:promo-b", alt: "Lane numbers on a running track", heading: "On your marks", text: "Training wear and timing.", ctaLabel: "Shop running", ctaHref: "/categories/ride-run" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "Season opener", heading: "Up to 30% off gym & racquet gear", subheading: "Prices already reduced. Extra 5% off with the code below.", code: "KHEL5", endsText: "Ends Sunday midnight", ctaLabel: "Shop deals", ctaHref: "/categories/strength", background: "#0a2a66", textColor: "#ffffff" }],
    brands: ["BrandStrip", { eyebrow: "Our product lines", heading: "", items: ["Khel Willow", "Smash Lab", "Iron Akhada", "Prana Mat", "Raftaar"].map((name) => ({ name, imagePath: "", href: "" })) }],
    trust: [
      "TrustBadges",
      {
        items: [
          { icon: "truck", title: "Free delivery", text: "On orders above ₹1,499" },
          { icon: "handmade", title: "Hand-finished bats", text: "In our Jalandhar workshop" },
          { icon: "return", title: "7-day returns", text: "On unused items" },
          { icon: "cod", title: "Cash on delivery", text: "On orders up to ₹10,000" },
        ],
      },
    ],
    faq: ["FAQ", { heading: "Before you buy", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Join the Khel club", subheading: "Training tips, restocks and early access to season sales.", buttonLabel: "Join" }],
    collections: ["CollectionGrid", { eyebrow: "Shop by goal", heading: "Where are you starting?", mode: "manual", items: ["home-gym", "beginners", "under-1500"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    marquee: ["Marquee", { items: [{ text: "Free delivery above ₹1,499" }, { text: "Hand-knocked willow" }, { text: "6-month warranty" }, { text: "Cash on delivery" }] }],
  },
  products: [
    p({ title: "Khel Willow Kashmir Cricket Bat", category: "team-sports", brand: "Khel Willow", price: 2799, mrp: 3499, options: [["Size", ["Size 6", "Harrow", "Short Handle"]]], short: "Grade A Kashmir willow, pre-knocked by hand, with a mid-to-low sweet spot.", description: desc("Our best-selling bat for club and school players: seasoned Kashmir willow, a full profile with a mid-to-low middle, and a cane handle with three rubber inserts to soften the jar on mistimed shots.", ["Pre-knocked by hand for about four hours", "Round cane handle with chevron grip", "Anti-scuff sheet on the face", "Toe guard fitted"]), specs: [["Material", "Grade A Kashmir willow"], ["Weight", "1150–1220 g"], ["Grip", "Chevron rubber, round handle"], ["Sweet spot", "Mid-to-low"], ["Recommended level", "Club and school"], ["Warranty", WARRANTY]], care: "Apply a light coat of raw linseed oil to the face and edges before first use. Keep out of damp car boots.", tags: ["bat", "bestseller"], collections: ["bestsellers"], featured: true, weightGrams: 1400, img: { q: "cricket player", pick: [1] } }),
    p({ title: "Smash Lab Carbon Badminton Racquet", category: "racquet", brand: "Smash Lab", price: 2499, mrp: 3199, options: [["Grip", ["G4", "G5"]]], short: "A light 84 g carbon racquet, factory strung at 24 lbs.", description: desc("An even-balance graphite racquet that forgives off-centre hits and still has the stiffness for a clean smash. Comes strung, with a full-length cover.", ["High-modulus graphite frame", "Strung at 24 lbs, takes up to 28 lbs", "Full-length cover included"]), specs: [["Material", "High-modulus graphite"], ["Weight", "84 g (4U)"], ["Balance", "Even"], ["Grip", "G4 / G5"], ["Recommended level", "Intermediate"], ["Warranty", WARRANTY]], tags: ["badminton", "bestseller"], collections: ["bestsellers"], featured: true, weightGrams: 300, img: { q: "badminton racket", pick: [1] } }),
    p({ title: "Smash Lab Feather Shuttlecocks (Tube of 12)", category: "racquet", brand: "Smash Lab", price: 1199, mrp: 1399, options: [["Speed", ["76 (slow)", "77 (medium)"]]], short: "Duck-feather shuttles with a cork base, for club and tournament play.", description: desc("Graded duck feathers on a natural cork base give a true, stable flight. Choose speed 76 for warm cities and 77 for cooler halls.", ["12 shuttles per tube", "Natural cork base", "Graded duck feathers"]), specs: [["Material", "Duck feather, natural cork"], ["Weight", "4.9–5.1 g per shuttle"], ["Size", "Tube of 12"], ["Recommended level", "Club and tournament"]], tags: ["badminton", "under-1500"], collections: ["bestsellers"], weightGrams: 150, img: { q: "badminton shuttlecock", pick: [1] } }),
    p({ title: "Smash Lab Graphite Tennis Racquet", category: "racquet", brand: "Smash Lab", price: 5499, mrp: 6499, options: [["Grip", ["L2", "L3"]]], short: "A 100 sq in, 285 g racquet that's easy to swing and generous on spin.", description: desc("A modern all-rounder for players moving up from aluminium frames: large sweet spot, a 16×19 open string pattern and a comfortable 285 g weight.", ["100 sq in head", "16×19 string pattern", "Pre-strung, with a half cover"]), specs: [["Material", "Graphite composite"], ["Weight", "285 g unstrung"], ["Head size", "100 sq in"], ["Grip", "L2 / L3"], ["Recommended level", "Beginner to intermediate"], ["Warranty", WARRANTY]], tags: ["tennis", "beginner"], weightGrams: 600, img: { q: "tennis racket", pick: [0] } }),
    p({ title: "Table Tennis Bats, Pair with Balls", category: "racquet", brand: "Smash Lab", price: 899, mrp: 1199, short: "Two five-ply bats with pimpled rubber and three 40+ balls.", description: desc("A ready-to-play set for home tables and office breaks, with all-round rubber that gives control and some spin.", ["Two bats, five-ply blade", "1.8 mm sponge, inverted rubber", "Three 40+ training balls"]), specs: [["Material", "Five-ply wood, rubber"], ["Weight", "170 g per bat"], ["Grip", "Flared handle"], ["Recommended level", "Beginner"]], tags: ["table-tennis", "beginner", "under-1500"], weightGrams: 500, img: { q: "table tennis", pick: [1, 4] } }),
    p({ title: "Raftaar Hand-stitched Football, Size 5", category: "team-sports", brand: "Raftaar", price: 1299, mrp: 1599, options: [["Size", ["Size 4", "Size 5"]]], short: "A 32-panel hand-stitched ball with a butyl bladder, made for rough grounds.", description: desc("Hand-stitched in Jalandhar from a tough PU cover that survives gravel grounds and monsoon mud. The butyl bladder holds air for weeks.", ["32 hand-stitched panels", "Butyl bladder", "Size 5 for 12+ years, Size 4 for 8–12"]), specs: [["Material", "PU cover, butyl bladder"], ["Weight", "410–450 g"], ["Size", "4 / 5"], ["Recommended level", "Training and matches"]], tags: ["football", "under-1500", "beginner"], collections: ["bestsellers"], featured: true, weightGrams: 600, img: { q: "soccer ball", pick: [3] } }),
    p({ title: "Raftaar Outdoor Basketball, Size 7", category: "team-sports", brand: "Raftaar", price: 1499, mrp: 1799, options: [["Size", ["Size 6", "Size 7"]]], short: "Deep-channel rubber basketball with a grippy pebbled cover.", description: desc("Built for concrete courts: a durable rubber cover with deep channels for grip, and a nylon-wound carcass that keeps its shape.", ["Deep channels for control", "Nylon-wound carcass", "Ships inflated in a box"]), specs: [["Material", "Rubber, nylon-wound"], ["Weight", "600 g (Size 7)"], ["Size", "6 / 7"], ["Recommended level", "Outdoor play"]], tags: ["basketball", "under-1500"], weightGrams: 800, img: { q: "basketball", pick: [0] } }),
    p({ title: "Iron Akhada Vinyl Dumbbells (Pair)", category: "strength", brand: "Iron Akhada", price: 999, mrp: 1299, options: [["Weight", ["2 kg × 2", "3 kg × 2", "5 kg × 2"]], ["Colour", ["Blue|#1f7ae0", "Pink|#e24c8f"]]], short: "Vinyl-coated dumbbells with a hexagonal end that won't roll.", description: desc("Floor-friendly dumbbells for toning, rehab and HIIT. The soft vinyl coating protects tiles and the hex ends stop them rolling away.", ["Vinyl-coated cast iron", "Hex ends, anti-roll", "Sold as a pair"]), specs: [["Material", "Cast iron, vinyl coating"], ["Weight", "2, 3 or 5 kg each"], ["Grip", "Contoured, non-slip"], ["Recommended level", "Beginner"]], tags: ["dumbbell", "beginner", "under-1500"], collections: ["home-gym", "bestsellers"], featured: true, weightGrams: 4500, hsn: "9506", img: { q: "dumbbell", pick: [4, 3] } }),
    p({ title: "Iron Akhada Cast-iron Kettlebell", category: "strength", brand: "Iron Akhada", price: 1799, mrp: 2199, options: [["Weight", ["8 kg", "12 kg", "16 kg"]]], short: "Single-cast iron kettlebell with a wide, smooth handle for swings.", description: desc("Cast in one piece so there are no welds to fail. The flat base sits steady for renegade rows and the handle is wide enough for two-hand swings.", ["Single-cast iron", "Powder-coat finish for grip", "Flat, stable base"]), specs: [["Material", "Cast iron, powder coated"], ["Weight", "8, 12 or 16 kg"], ["Grip", "33 mm handle"], ["Recommended level", "Intermediate"]], tags: ["kettlebell"], collections: ["home-gym"], weightGrams: 12000, img: { q: "kettlebell", pick: [1, 2] } }),
    p({ title: "Iron Akhada Soft-coat Kettlebell, 8 kg", category: "strength", brand: "Iron Akhada", price: 1299, short: "Vinyl-coated 8 kg kettlebell in teal, gentle on floors.", description: desc("A friendly first kettlebell for goblet squats, deadlifts and swings, coated in vinyl so it's kind to floors and fingers.", ["8 kg, weight moulded on the side", "Vinyl coating over iron core", "Flat base"]), specs: [["Material", "Iron core, vinyl coating"], ["Weight", "8 kg"], ["Grip", "Smooth, 30 mm handle"], ["Recommended level", "Beginner"]], tags: ["kettlebell", "beginner", "under-1500"], collections: ["home-gym"], weightGrams: 8500, img: { q: "kettlebell", pick: [3] } }),
    p({ title: "Iron Akhada Cast-iron Weight Plates", category: "strength", brand: "Iron Akhada", price: 1599, mrp: 1899, options: [["Weight", ["2.5 kg × 2", "5 kg × 2", "10 kg × 2"]]], short: "Standard 28 mm bore plates with a raised lip for easy pickup.", description: desc("Classic grey cast-iron plates for 28 mm home bars and dumbbell rods, with the weight cast into the face.", ["28 mm centre hole", "Raised rim for easy grip", "Sold in pairs"]), specs: [["Material", "Cast iron"], ["Weight", "2.5, 5 or 10 kg each"], ["Size", "28 mm bore"], ["Recommended level", "All levels"]], tags: ["plates"], collections: ["home-gym"], weightGrams: 10500, img: { q: "weight plate", pick: [2] } }),
    p({ title: "Iron Akhada 5 ft Straight Barbell Rod", category: "strength", brand: "Iron Akhada", price: 1999, short: "Chrome steel 28 mm bar with spin collars and knurled grip.", description: desc("A 5 ft bar for bench press, rows and curls at home. Spring collars hold plates firmly and the knurl gives grip without tearing hands.", ["Chrome-plated steel", "Medium knurling", "Two spring collars included"]), specs: [["Material", "Chrome steel"], ["Weight", "7 kg"], ["Size", "150 cm, 28 mm diameter"], ["Grip", "Medium knurl"], ["Recommended level", "Intermediate"]], tags: ["barbell"], collections: ["home-gym"], weightGrams: 7500, img: { q: "barbell", pick: [1] } }),
    p({ title: "Raftaar Speed Skipping Rope", category: "strength", brand: "Raftaar", price: 449, mrp: 599, short: "Ball-bearing handles and an adjustable 3 m PVC cable.", description: desc("A fast, smooth rope for warm-ups, boxing footwork and double-unders. Trim the cable to your height in a minute.", ["Ball-bearing swivel", "Foam handles", "Adjustable 3 m cable"]), specs: [["Material", "PVC cable, foam handles"], ["Weight", "160 g"], ["Size", "Up to 3 m, adjustable"], ["Recommended level", "All levels"]], tags: ["rope", "beginner", "under-1500"], collections: ["home-gym", "bestsellers"], weightGrams: 250, img: { q: "jump rope", pick: [4] } }),
    p({ title: "Iron Akhada Fabric Resistance Loop Bands (Set of 3)", category: "strength", brand: "Iron Akhada", price: 699, mrp: 899, short: "Non-slip fabric mini bands in light, medium and heavy, for glutes and warm-ups.", description: desc("Woven fabric bands that don't roll up or pinch like latex. Loop one above the knees for squats, lateral walks and bridges.", ["Three resistance levels", "Non-slip inner grip strip", "Carry pouch included"]), specs: [["Material", "Polycotton, latex thread"], ["Weight", "180 g set"], ["Size", "33 × 8 cm loop"], ["Recommended level", "Beginner to intermediate"]], care: "Hand wash in cold water. Dry in shade.", tags: ["bands", "beginner", "under-1500"], collections: ["home-gym"], weightGrams: 250, img: { q: "squat", pick: [1] } }),
    p({ title: "Iron Akhada Boxing Gloves, 12 oz", category: "strength", brand: "Iron Akhada", price: 1699, mrp: 2099, options: [["Colour", ["Blue|#1d4ed8", "Red|#c81e1e"]]], short: "Multi-layer foam gloves for bag work and pad training.", description: desc("Layered foam protects knuckles on the heavy bag while a wide velcro cuff supports the wrist.", ["Multi-layer foam padding", "Wide velcro wrist strap", "Mesh palm for ventilation"]), specs: [["Material", "PU leather, layered foam"], ["Weight", "12 oz"], ["Size", "Adult"], ["Recommended level", "Beginner to intermediate"]], tags: ["boxing"], weightGrams: 900, img: { q: "boxing gloves", pick: [6] } }),
    p({ title: "Prana 6 mm Yoga Mat", category: "yoga", brand: "Prana Mat", price: 1199, mrp: 1499, options: [["Colour", ["Rose|#e58fb4", "Slate|#5b6670"]]], short: "Grippy, cushioned 6 mm mat with a carry strap.", description: desc("Thick enough for knees on hard floors, with a textured surface that grips even in humid rooms.", ["6 mm cushioning", "Textured, non-slip both sides", "Carry strap included"]), specs: [["Material", "TPE, latex-free"], ["Weight", "1.1 kg"], ["Size", "183 × 61 cm, 6 mm"], ["Recommended level", "All levels"]], care: "Wipe with a damp cloth and mild soap. Dry flat in shade.", hsn: "3926", tags: ["yoga", "beginner", "under-1500"], collections: ["bestsellers"], featured: true, weightGrams: 1300, img: { q: "yoga mat", pick: [4] } }),
    p({ title: "Prana EVA Yoga Blocks (Pair)", category: "yoga", brand: "Prana Mat", price: 699, short: "Light, firm foam blocks to make every pose reachable.", description: desc("Use them under hands in forward folds, under hips in seated poses or between knees for core work.", ["High-density EVA foam", "Bevelled edges", "Sold as a pair"]), specs: [["Material", "EVA foam"], ["Weight", "200 g each"], ["Size", "23 × 15 × 7.5 cm"], ["Recommended level", "All levels"]], hsn: "3926", tags: ["yoga", "beginner", "under-1500"], weightGrams: 450, img: { q: "yoga block", pick: [1, 0] } }),
    p({ title: "Raftaar Leakproof Sports Bottle, 750 ml", category: "yoga", brand: "Raftaar", price: 549, options: [["Colour", ["Pink|#e0569b", "Grey|#7b7f86"]]], short: "BPA-free bottle with a flip lid and carry loop.", description: desc("Light enough for a gym bag, tough enough for the cricket kit. The flip lid locks shut so it won't leak in your bag.", ["BPA-free Tritan", "Lockable flip lid", "Carry loop"]), specs: [["Material", "Tritan, BPA-free"], ["Weight", "130 g"], ["Size", "750 ml"]], care: "Hand wash. Not for hot drinks.", hsn: "3924", tags: ["bottle", "under-1500"], weightGrams: 200, img: { q: "sports bottle", pick: [2] } }),
    p({ title: "Raftaar Ventilated Cycling Helmet", category: "ride-run", brand: "Raftaar", price: 2299, mrp: 2799, options: [["Size", ["M (54–58 cm)", "L (58–62 cm)"]]], short: "In-mould helmet with 18 vents and a dial-fit cradle.", description: desc("Light and airy for hot Indian rides, with a dial at the back to fine-tune the fit and a removable visor.", ["18 vents", "Dial-fit cradle", "Removable visor"]), specs: [["Material", "PC shell, EPS foam"], ["Weight", "260 g"], ["Size", "M, L"], ["Recommended level", "Commute and road"], ["Warranty", WARRANTY]], tags: ["helmet", "cycling"], weightGrams: 500, img: { q: "bicycle helmet", pick: [0] } }),
    p({ title: "Raftaar Cork Handlebar Tape", category: "ride-run", brand: "Raftaar", price: 599, options: [["Colour", ["Red|#c62828", "Black|#1b1b1b"]]], short: "Cushioned cork bar tape with end plugs and finishing tape.", description: desc("Soaks up road buzz on long rides and grips well with or without gloves.", ["Cork-blend, 3 mm", "Bar-end plugs included", "Enough for one drop bar"]), specs: [["Material", "Cork-EVA blend"], ["Weight", "70 g"], ["Size", "2 × 200 cm, 3 mm"]], tags: ["cycling", "under-1500"], weightGrams: 120, img: { q: "bicycle", pick: [0] } }),
    p({ title: "Raftaar Compression Long-sleeve Top", category: "ride-run", type: "top", brand: "Raftaar", price: 1299, mrp: 1599, options: [["Size", ["S", "M", "L", "XL"]]], short: "Quick-dry compression top for runs, rides and gym sessions.", description: desc("A close fit that supports muscles and wicks sweat on humid mornings, with flat seams that won't rub.", ["Four-way stretch", "Quick-dry, flat seams", "Thumbholes"]), specs: [["Material", "82% polyester, 18% elastane"], ["Weight", "180 g"], ["Size", "S–XL"], ["Fit", "Compression"]], care: "Machine wash cold. Do not iron or tumble dry.", hsn: "6110", tags: ["activewear", "under-1500"], weightGrams: 250, img: { q: "stretching", pick: [4] } }),
    p({ title: "Raftaar High-rise Training Leggings", category: "ride-run", type: "bottom", brand: "Raftaar", price: 1499, mrp: 1899, options: [["Size", ["XS", "S", "M", "L"]]], short: "Squat-proof high-rise leggings with a side phone pocket.", description: desc("Opaque, soft and supportive for yoga, running and gym, with a wide waistband that stays put.", ["High-rise waistband", "Side pocket fits a phone", "Squat-proof fabric"]), specs: [["Material", "75% nylon, 25% elastane"], ["Weight", "220 g"], ["Size", "XS–L"], ["Fit", "Second skin"]], care: "Machine wash cold, inside out. Dry in shade.", hsn: "6104", tags: ["activewear", "under-1500"], weightGrams: 300, img: { q: "running track", pick: [5] } }),
    p({ title: "Coach's Mechanical Stopwatch", category: "ride-run", brand: "Raftaar", price: 999, short: "Wind-up stopwatch with a 1/5-second dial for track and nets.", description: desc("No batteries, no screens: a dependable mechanical stopwatch for coaches timing sprints, laps and overs.", ["1/5-second resolution", "30-minute register", "Start, stop and reset crown"]), specs: [["Material", "Chrome-plated brass case"], ["Weight", "90 g"], ["Size", "Ø 55 mm"], ["Recommended level", "Coaches"]], hsn: "9102", tags: ["timing", "under-1500"], weightGrams: 200, img: { q: "stopwatch", pick: [6] } }),
  ],
};

export default spec;
