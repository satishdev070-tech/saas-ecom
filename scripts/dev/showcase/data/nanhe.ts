import type { ShowcaseSpec, ShowProduct } from "../types";

const TOY_CARE = "Wipe clean with a damp cloth and mild soap. Do not soak wooden toys. Dry in shade. Check regularly for wear and stop using if damaged.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "9503", care: TOY_CARE, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;
const tile = (kind: "category" | "collection", slugs: string[]) =>
  slugs.map((c) => ({ id: `$${kind}:${c}`, imagePath: kind === "category" ? `$catimg:${c}` : `$colimg:${c}`, label: "" }));

const spec: ShowcaseSpec = {
  slug: "nanhe",
  name: "Nanhe Kids",
  industry: "kids",
  owner: "Meera Iyer",
  theme: "toybox-pop",
  tagline: "Safe, joyful toys and soft cotton basics for little ones",
  story: [
    "Nanhe Kids started in a Bengaluru living room with a box of Channapatna wooden toys and a question every new parent asks: what is this actually made of? Today we stock toys, art supplies and baby basics that we would hand to our own children.",
    "Every toy we sell is tested to IS 9873 (BIS) for Indian safety standards, painted with non-toxic, lead-free colours, and labelled with an honest age group. Baby clothing is soft cotton or muslin, pre-washed and free of scratchy tags.",
  ],
  email: "hello@nanhekids.test",
  phone: "+91 80 4718 2260",
  address: { line1: "No. 48, 3rd Cross, HSR Layout Sector 6", city: "Bengaluru", state: "Karnataka", postal_code: "560102" },
  legalName: "Nanhe Kids Retail Private Limited",
  seo: { title: "Nanhe Kids — Wooden toys, soft toys & baby essentials", description: "BIS-certified wooden toys, soft toys, art supplies and cotton baby basics. Non-toxic paints, honest age labels, free delivery above ₹799." },
  announcement: ["Free delivery on orders above ₹799", "Every toy BIS certified (IS 9873)", "Free gift wrap on birthday orders"],
  categories: [
    { slug: "toys", name: "Classic Toys", description: "Wooden trains, spinning tops, ride-ons and musical toys." },
    { slug: "soft-toys", name: "Soft Toys", description: "Teddies, bunnies and cuddly friends for every age." },
    { slug: "learning", name: "Learning & Building", description: "Building blocks, puzzles and counting toys." },
    { slug: "art", name: "Art & School", description: "Crayons, colours, paints and lunch boxes." },
    { slug: "baby", name: "Baby", description: "Cotton clothing, blankets and baby care." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "The toys and basics parents reorder most." },
    { slug: "newborn", title: "Newborn essentials", description: "Soft, safe basics for the first few months." },
    { slug: "toddler", title: "For 1–3 years", description: "Easy-grip toys for busy little hands." },
    { slug: "wooden", title: "Wooden toys", description: "Solid wood, non-toxic paint, made to be handed down.", tag: "wooden" },
    { slug: "under-999", title: "Gifts under ₹999", description: "Birthday-party gifts that kids actually play with.", tag: "under-999" },
  ],
  menu: [
    { title: "Toys", to: "/categories/toys" },
    { title: "Soft toys", to: "/categories/soft-toys" },
    { title: "Learning", to: "/categories/learning" },
    { title: "Art & School", to: "/categories/art" },
    { title: "Baby", to: "/categories/baby", children: [{ title: "Newborn essentials", to: "/collections/newborn" }, { title: "For 1–3 years", to: "/collections/toddler" }] },
    { title: "Gifts under ₹999", to: "/collections/under-999" },
  ],
  faqs: [
    ["Are your toys safe for small children?", "Yes. Every toy is certified to IS 9873 (BIS), the Indian toy-safety standard, and painted with non-toxic, lead-free colours. Each product page shows the recommended age; toys with small parts are marked 3+."],
    ["How do I choose the right age group?", "Follow the age on the product page. It is based on the size of parts, the grip needed and how the toy is played with, not only on difficulty."],
    ["What fabrics do you use for baby clothing?", "Soft combed cotton and cotton muslin, pre-washed to prevent shrinking. Snaps are nickel-free and labels are printed, not stitched, so nothing scratches."],
    ["Do you offer gift wrapping?", "Yes, free on every order. Tick 'This is a gift' at checkout and add a message; we leave prices off the packing slip."],
    ["How long does delivery take?", "Metro cities in 2–4 working days, the rest of India in 4–7. Orders above ₹799 ship free; cash on delivery is available up to ₹5,000."],
    ["Can I return a toy?", "Unopened toys can be returned within 10 days. Opened or used toys and baby clothing are replaced only if they arrive damaged or defective, for hygiene reasons."],
  ],
  shippingNote: "Free delivery on orders above ₹799, otherwise ₹59. Metro cities in 2–4 working days, the rest of India in 4–7. Cash on delivery up to ₹5,000.",
  returnsNote: "Unopened toys can be returned within 10 days of delivery. Anything that arrives damaged or defective is replaced free. For hygiene reasons, opened baby clothing and feeding items can't be returned.",
  images: {
    hero: { q: "balloon", pick: [2] },
    hero2: { q: "colored pencils", pick: [2] },
    feature: { q: "wooden toys", pick: [0] },
    "feature-2": { q: "watercolor", pick: [0] },
    story: { q: "baby room", pick: [2] },
    "promo-a": { q: "balloon", pick: [0] },
    "promo-b": { q: "books", pick: [0] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A heap of colourful balloons", eyebrow: "Birthday season", heading: "Gifts that get played with", subheading: "Wooden toys, soft toys and art kits, gift-wrapped free.", ctaLabel: "Shop gifts under ₹999", ctaHref: "/collections/under-999" },
          { imagePath: "$img:hero2", alt: "A rainbow of colour pencils", eyebrow: "Art & School", heading: "Colour outside the lines", subheading: "Non-toxic crayons, pencils and paints for every age.", ctaLabel: "Shop art supplies", ctaHref: "/categories/art" },
        ],
      },
    ],
    marquee: ["Marquee", { items: [{ text: "Free delivery above ₹799" }, { text: "BIS-certified toys" }, { text: "Non-toxic paints" }, { text: "Free gift wrap" }, { text: "Cash on delivery" }] }],
    categories: ["CategoryGrid", { eyebrow: "Browse", heading: "Shop by category", mode: "manual", items: tile("category", ["toys", "soft-toys", "learning", "art", "baby"]) }],
    collections: ["CollectionGrid", { eyebrow: "Curated", heading: "Find the right fit", mode: "manual", items: tile("collection", ["wooden", "newborn", "toddler", "under-999"]) }],
    toys: ["ProductCarousel", { eyebrow: "Playtime", heading: "Classic toys", subheading: "Trains, tops and ride-ons that never go out of style.", source: "category", categoryId: "$category:toys", viewAllHref: "/categories/toys" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    new: ["ProductGrid", { eyebrow: "Just in", heading: "New arrivals", source: "newest", viewAllHref: "/collections" }],
    baby: ["ProductGrid", { heading: "For the littlest ones", subheading: "Soft cotton, gentle care.", source: "category", categoryId: "$category:baby", viewAllHref: "/categories/baby" }],
    learning: ["ProductGrid", { heading: "Learn through play", subheading: "Blocks, puzzles and counting toys.", source: "category", categoryId: "$category:learning", viewAllHref: "/categories/learning" }],
    school: ["ProductCarousel", { eyebrow: "Back to school", heading: "Art & school essentials", source: "category", categoryId: "$category:art", viewAllHref: "/categories/art" }],
    deals: ["ProductGrid", { eyebrow: "Limited time", heading: "Today's offers", source: "sale", viewAllHref: "/collections" }],
    gifts: ["ProductCarousel", { eyebrow: "Birthday party?", heading: "Gifts under ₹999", source: "collection", collectionId: "$collection:under-999", viewAllHref: "/collections/under-999" }],
    story: [
      "BrandStory",
      { eyebrow: "What it's made of", heading: "Safe enough to chew on", body: "Little ones put everything in their mouths, so we start with materials. Our wooden toys are turned from local hale wood and finished with lead-free lacquer; soft toys are filled with hypoallergenic fibre; baby clothes are pre-washed cotton and muslin. Every toy is tested to IS 9873 before it reaches our shelves.", imagePath: "$img:story", alt: "A cane baby cradle in a calm nursery", stats: [{ value: "IS 9873", label: "BIS-certified toys" }, { value: "Lead-free", label: "Paints and lacquers" }, { value: "100%", label: "Cotton baby basics" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "Hand-painted wooden toy figures", eyebrow: "Made to last", heading: "Toys you can hand down", body: "A good wooden toy outlives childhood. Ours are turned and painted by artisan families in Channapatna, sanded smooth for small hands and finished with natural lacquer, so they can go from one sibling to the next.", ctaLabel: "Shop wooden toys", ctaHref: "/collections/wooden" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "Watercolour paints mid-painting", eyebrow: "Art corner", heading: "Messy is the point", body: "Washable crayons, non-toxic watercolours and chunky pencils that survive being dropped. Set up a corner, roll out old newspaper and let them make something only they could make.", ctaLabel: "Shop art supplies", ctaHref: "/categories/art" },
    ],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "A single pink balloon", heading: "Party bag ready", text: "Return gifts from ₹199.", ctaLabel: "Shop under ₹999", ctaHref: "/collections/under-999" },
          { imagePath: "$img:promo-b", alt: "Books on a desk in front of a chalkboard", heading: "Learning, the fun way", text: "Blocks, puzzles and counting toys.", ctaLabel: "Shop learning", ctaHref: "/categories/learning" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "Birthday week", heading: "Up to 30% off toys & art kits", subheading: "Use code PLAY10 for an extra 10% off orders above ₹1,499.", ctaLabel: "Shop the offers", ctaHref: "/collections/under-999", background: "#5b2a86", textColor: "#fff7fb" }],
    brands: ["BrandStrip", { eyebrow: "Our ranges", heading: "", items: ["Nanhe Wood", "Nanhe Cuddles", "Nanhe Muslin", "Nanhe Art", "Nanhe Play"].map((name) => ({ name, imagePath: "", href: "" })) }],
    trust: [
      "TrustBadges",
      {
        items: [
          { icon: "secure", title: "BIS certified", text: "Every toy tested to IS 9873" },
          { icon: "leaf", title: "Non-toxic paints", text: "Lead-free, child-safe finishes" },
          { icon: "gift", title: "Free gift wrap", text: "With a handwritten note" },
          { icon: "truck", title: "Free delivery", text: "On orders above ₹799" },
        ],
      },
    ],
    faq: ["FAQ", { heading: "Parents often ask", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Play ideas, once a month", subheading: "Age-by-age play tips, new arrivals and early access to sales.", buttonLabel: "Subscribe" }],
  },
  products: [
    // ---- Classic toys
    p({ title: "Chuk-Chuk Push-Along Train Set", category: "toys", price: 1299, mrp: 1599, short: "A chunky, colourful engine and carriage with a snap-together track.", description: desc("A bright engine and carriage that roll along a snap-together oval track. No batteries, no noise, just pushing, steering and a lot of chuk-chuk sound effects from the driver.", ["Engine, carriage and 8 track pieces", "Chunky parts sized for small hands", "No batteries needed"]), specs: [["Age group", "2 years+"], ["Material", "BPA-free ABS plastic"], ["Safety", "IS 9873 (BIS) certified, no small parts"], ["Track size", "Oval, 70 × 45 cm"], ["Pieces", "10"]], tags: ["train"], collections: ["bestsellers", "toddler"], featured: true, weightGrams: 650, img: { q: "toy train", pick: [15] } }),
    p({ title: "Tin Lattu Spinning Top", category: "toys", price: 349, short: "A classic pump-action tin top that hums as it spins.", description: desc("Press the plunger a few times and watch it spin, sing and blur its pattern into rings of colour. The toy every grandparent remembers.", ["Pump-action plunger, no batteries", "Printed tin with rolled, smooth edges", "Spins for up to a minute"]), specs: [["Age group", "3 years+"], ["Material", "Tin-plated steel, plastic plunger"], ["Safety", "IS 9873 (BIS) certified, rolled edges"], ["Dimensions", "Ø 13 × H 15 cm"]], tags: ["top", "under-999"], collections: ["bestsellers"], weightGrams: 280, img: { q: "spinning top", pick: [7] } }),
    p({ title: "Little Rider Classic Tricycle", category: "toys", price: 3999, mrp: 4599, options: [["Colour", ["Cherry red|#c8202f", "Sky blue|#4a90d9"]]], short: "A sturdy steel tricycle with a rear step and rubber grips.", description: desc("A proper first trike: a low, stable frame, rubber-tread wheels for Indian pavements and a rear step for a parent's foot or a friend.", ["Powder-coated steel frame", "Adjustable seat, two positions", "Rubber-tread wheels and soft grips"]), specs: [["Age group", "2–5 years"], ["Material", "Steel frame, rubber wheels"], ["Safety", "IS 9873 (BIS) certified"], ["Max load", "25 kg"], ["Seat height", "34–38 cm"], ["Assembly", "Handlebar and seat, 10 minutes"]], care: "Wipe with a damp cloth. Store indoors; oil the axles every few months.", hsn: "9503", tags: ["ride-on"], collections: ["toddler"], featured: true, weightGrams: 6200, img: { q: "tricycle", pick: [4, 3] } }),
    p({ title: "Gullak Piggy Bank", category: "toys", price: 399, options: [["Colour", ["Tomato red|#e0393e", "Blush pink|#f2a7b5"]]], short: "A glossy ceramic piggy bank with a rubber stopper underneath.", description: desc("A first lesson in saving: a round, glossy piggy bank with a coin slot on top and a rubber stopper underneath, so you never have to break it.", ["Rubber stopper, reusable", "Holds about ₹500 in coins", "Glazed ceramic"]), specs: [["Age group", "5 years+"], ["Material", "Glazed ceramic, rubber stopper"], ["Dimensions", "L 15 × W 11 × H 12 cm"], ["Note", "Fragile; adult supervision for younger children"]], care: "Wipe with a dry cloth.", hsn: "6912", tags: ["savings", "under-999"], weightGrams: 450, img: { q: "piggy bank", pick: [6] } }),
    // ---- Learning & building
    p({ title: "Rainbow Wooden Shape Blocks (40 pcs)", category: "learning", price: 1299, mrp: 1599, short: "Chunky wooden cubes, arches and triangles in soft rainbow colours.", description: desc("Stack, sort, build and knock down. Forty solid-wood blocks in shapes that click together into towers, bridges and houses, with a cotton bag to tidy up.", ["40 solid-wood blocks in 8 shapes", "Rounded corners, smooth sanded edges", "Cotton storage bag included"]), specs: [["Age group", "18 months+"], ["Material", "Rubberwood, water-based colours"], ["Safety", "IS 9873 (BIS) certified, lead-free paint"], ["Block size", "4 cm base unit"], ["Pieces", "40"]], tags: ["blocks", "wooden"], collections: ["bestsellers", "toddler"], featured: true, weightGrams: 1400, img: { q: "toy blocks", pick: [1] } }),
    p({ title: "Wooden Farmhouse & Animals Set", category: "learning", price: 2499, mrp: 2999, short: "A natural pine farmhouse with a fenced yard and 12 wooden animals.", description: desc("A roomy open-sided barn in plain natural wood, with fences and a dozen hand-cut animals for counting, sorting and storytelling.", ["Barn, 6 fence pieces and 12 animals", "Unpainted, smooth-sanded pine", "Open back for easy play"]), specs: [["Age group", "3 years+"], ["Material", "Pine wood, unfinished"], ["Safety", "IS 9873 (BIS) certified"], ["Pieces", "19"], ["Barn size", "W 40 × D 28 × H 30 cm"]], tags: ["blocks", "wooden"], collections: ["bestsellers"], weightGrams: 2100, img: { q: "toy dinosaur", pick: [7] } }),
    p({ title: "Rainbow Bead Abacus", category: "learning", price: 799, mrp: 999, short: "A wooden counting frame with ten rows of colourful beads.", description: desc("A hands-on way to learn counting, adding and patterns. Each row is a different colour, so ten tens make a hundred you can see.", ["10 rows of 10 beads", "Solid wood frame", "Stands on its own feet"]), specs: [["Age group", "3 years+"], ["Material", "Wood frame, painted wooden beads"], ["Safety", "IS 9873 (BIS) certified, beads fixed on steel rods"], ["Dimensions", "W 28 × H 26 cm"]], tags: ["counting", "wooden", "under-999"], weightGrams: 700, img: { q: "abacus", pick: [14, 15] } }),
    p({ title: "Ocean Blue Jigsaw Puzzle (200 pcs)", category: "learning", price: 599, short: "A 200-piece puzzle in thick card with a poster for reference.", description: desc("A challenging but achievable family puzzle in shades of blue, cut from extra-thick recycled board so pieces don't bend.", ["200 pieces, 2 mm board", "Reference poster included", "Finished size 48 × 34 cm"]), specs: [["Age group", "7 years+"], ["Material", "Recycled board, soy-based inks"], ["Safety", "IS 9873 (BIS) certified"], ["Pieces", "200"], ["Finished size", "48 × 34 cm"]], care: "Keep dry. Store pieces in the box.", hsn: "9503", tags: ["puzzle", "under-999"], weightGrams: 450, img: { q: "jigsaw puzzle", pick: [15, 12] } }),
    // ---- Soft toys
    p({ title: "Bhalu Classic Teddy Bear", category: "soft-toys", price: 1199, mrp: 1499, options: [["Size", ["30 cm", "45 cm"]]], short: "A honey-brown teddy with a soft, huggable tummy.", description: desc("The teddy bear everyone pictures: plush honey-brown fur, stitched eyes that can't come loose and a soft, squishy middle for bedtime cuddles.", ["Embroidered eyes and nose, no buttons", "Hypoallergenic polyester fill", "Surface washable"]), specs: [["Age group", "0 months+"], ["Material", "Polyester plush, hypoallergenic fill"], ["Safety", "IS 9873 (BIS) certified, embroidered features"], ["Height", "30 cm or 45 cm (seated)"]], care: "Surface wash with mild soap and a damp cloth. Air dry.", tags: ["teddy"], collections: ["bestsellers", "newborn"], featured: true, weightGrams: 380, img: { q: "stuffed animal", pick: [7] } }),
    p({ title: "Crochet Grey Bear", category: "soft-toys", price: 899, short: "A hand-crocheted cotton bear made by a women's collective.", description: desc("Each bear is crocheted by hand from soft cotton yarn by a women's collective in Mysuru, so no two faces are quite the same.", ["Hand-crocheted cotton", "Embroidered eyes", "Takes about six hours to make"]), specs: [["Age group", "0 months+"], ["Material", "100% cotton yarn, cotton fill"], ["Safety", "IS 9873 (BIS) certified, no small parts"], ["Height", "22 cm"], ["Made in", "Mysuru, India"]], care: "Hand wash cold in mild soap. Reshape and dry flat in shade.", tags: ["handmade", "under-999"], collections: ["newborn"], weightGrams: 160, img: { q: "stuffed animal", pick: [11] } }),
    p({ title: "Linen Bunny with Bow", category: "soft-toys", price: 799, short: "A long-eared linen bunny with a soft cotton bow, made for carrying everywhere.", description: desc("A vintage-style bunny in textured natural linen, with long ears for little fists to hold and a cotton bow tied at the neck. Light enough to go to the park, the grandparents' house and back.", ["Natural linen, soft cotton bow (stitched on)", "Weighted bottom so it sits up", "Hand wash"]), specs: [["Age group", "12 months+"], ["Material", "Linen outer, hypoallergenic fill"], ["Safety", "IS 9873 (BIS) certified"], ["Height", "34 cm (ears up)"]], care: "Hand wash cold with mild soap. Air dry in shade.", tags: ["bunny", "under-999"], collections: ["newborn"], weightGrams: 220, img: { q: "stuffed animal", pick: [0] } }),
    p({ title: "Bandar Monkey Buddies (Pair)", category: "soft-toys", price: 1099, mrp: 1299, short: "Two cheeky plush monkeys with long arms that hug each other.", description: desc("A pair of brown plush monkeys with hook-and-loop paws, so they can hang from a cot rail, a backpack strap or each other.", ["Set of two", "Hook-and-loop paws", "Embroidered faces"]), specs: [["Age group", "12 months+"], ["Material", "Polyester plush, hypoallergenic fill"], ["Safety", "IS 9873 (BIS) certified"], ["Height", "25 cm each"]], care: "Surface wash with mild soap. Air dry.", tags: ["monkey"], collections: ["toddler"], weightGrams: 400, img: { q: "soft toy", pick: [4] } }),
    // ---- Art & school
    p({ title: "Jumbo Wax Crayons (24 Colours)", category: "art", price: 249, short: "Thick, break-resistant crayons for little fists.", description: desc("Extra-thick crayons that are hard to snap and easy to grip, with bright colours that go on smoothly without pressing hard.", ["24 colours", "11 mm thick, break-resistant", "Washes off skin and most fabrics"]), specs: [["Age group", "2 years+"], ["Material", "Paraffin and plant wax, food-grade pigments"], ["Safety", "Non-toxic, conforms to EN 71-3"], ["Count", "24"]], care: "Store away from direct sun.", hsn: "9609", tags: ["crayons", "under-999"], collections: ["bestsellers", "toddler"], weightGrams: 300, img: { q: "crayons", pick: [5] } }),
    p({ title: "Colour Pencils Tin (36 Shades)", category: "art", price: 499, mrp: 599, short: "Soft, bright colour pencils in a reusable tin.", description: desc("Soft cores that blend easily and sharpen without breaking, in a flat tin that slides into a school bag.", ["36 shades", "Pre-sharpened, 3.3 mm soft cores", "Reusable metal tin"]), specs: [["Age group", "4 years+"], ["Material", "Cedar wood casing, wax-based cores"], ["Safety", "Non-toxic, conforms to EN 71-3"], ["Count", "36"]], care: "Sharpen with a hand sharpener.", hsn: "9609", tags: ["pencils", "under-999"], collections: ["bestsellers"], weightGrams: 420, img: { q: "colored pencils", pick: [4, 8] } }),
    p({ title: "Watercolour Paint Set (36 Cakes)", category: "art", price: 649, short: "A palette of 36 bright watercolour cakes with a brush.", description: desc("Rich, washable watercolours in a flip-top palette with mixing wells. Just add water.", ["36 colours", "Two brushes included", "Washable, rinses out of clothes"]), specs: [["Age group", "4 years+"], ["Material", "Gum arabic, non-toxic pigments"], ["Safety", "Non-toxic, conforms to EN 71-3"], ["Count", "36 cakes, 2 brushes"]], care: "Let the palette dry open before closing.", hsn: "3213", tags: ["paint", "under-999"], weightGrams: 260, img: { q: "watercolor", pick: [2, 3] } }),
    p({ title: "Soft Pastels (24 Colours)", category: "art", price: 349, short: "Square soft pastels in a wooden tray, for bold colour and easy blending.", description: desc("Chalky, richly pigmented pastels that smudge and blend with a fingertip. Great for sunsets, skies and drawing-class homework.", ["24 colours", "Square sticks for broad strokes and fine edges", "Wooden storage tray"]), specs: [["Age group", "5 years+"], ["Material", "Pigment, chalk and binder"], ["Safety", "Non-toxic, conforms to EN 71-3"], ["Count", "24"]], care: "Keep dry. Spray finished drawings with fixative or store between sheets of paper.", hsn: "9609", tags: ["pastels", "under-999"], weightGrams: 240, img: { q: "chalk", pick: [7, 5] } }),
    p({ title: "Leak-Proof Bento Lunch Box", category: "art", price: 899, mrp: 1099, options: [["Colour", ["Mint|#a8dcc6", "Peach|#f7c3a8"]]], short: "A four-compartment lunch box with a leak-proof seal.", description: desc("Dal in one corner, fruit in another, nothing runs into anything. The silicone seal keeps it all inside the bag.", ["Four compartments, one removable divider", "Silicone seal, easy-open clips", "Food-grade, BPA-free"]), specs: [["Age group", "3 years+"], ["Material", "Food-grade PP, silicone seal"], ["Capacity", "850 ml"], ["Safety", "BPA-free"], ["Dimensions", "20 × 15 × 6 cm"]], care: "Top-rack dishwasher safe. Not for microwave with the lid on.", hsn: "3924", tags: ["lunch-box", "under-999"], collections: ["bestsellers"], weightGrams: 380, img: { q: "lunch box", pick: [11] } }),
    // ---- Baby
    p({ title: "Organic Cotton Romper Set", category: "baby", price: 999, mrp: 1199, options: [["Size", ["0–3 M", "3–6 M", "6–12 M"]]], short: "A soft cotton tee and pull-on pants set in pale sea green.", description: desc("Everyday comfort for babies: an envelope-neck tee that goes over the head easily and pull-on pants with a soft, wide waistband.", ["Envelope neck for easy changes", "Soft rib waistband, no elastic marks", "Printed labels, nothing scratchy"]), specs: [["Age group", "0–12 months"], ["Material", "100% organic cotton jersey"], ["Fabric weight", "160 GSM"], ["Includes", "Tee and pull-on pants"]], care: "Machine wash cold with similar colours. Dry in shade. Do not bleach.", hsn: "6111", tags: ["clothing", "cotton"], collections: ["newborn"], featured: true, weightGrams: 180, img: { q: "baby clothes", pick: [0] } }),
    p({ title: "Hand-Knitted Cotton Baby Blanket", category: "baby", price: 1499, short: "A cosy blue-and-white knitted blanket for the pram or cot.", description: desc("Knitted in a breathable cotton yarn with a textured diamond pattern, warm enough for air-conditioned rooms and cool enough for Indian summers.", ["Hand-knitted cotton", "Breathable diamond pattern", "75 × 90 cm, fits pram and cot"]), specs: [["Age group", "0 months+"], ["Material", "100% cotton yarn"], ["Size", "75 × 90 cm"], ["Made in", "Ludhiana, India"]], care: "Hand wash or gentle machine wash cold. Dry flat in shade.", hsn: "6301", tags: ["blanket", "cotton"], collections: ["newborn"], weightGrams: 420, img: { q: "baby blanket", pick: [6, 8] } }),
    p({ title: "Knitted Kitty Booties", category: "baby", price: 449, options: [["Size", ["0–6 M", "6–12 M"]]], short: "Soft pink knitted booties with sleepy kitty faces that stay on.", description: desc("Warm, stretchy booties with a ribbed cuff that stays on kicking feet, finished with appliquéd sleepy kitty faces.", ["Ribbed cuff stays on", "Embroidered details, no buttons", "Soft cotton-acrylic knit"]), specs: [["Age group", "0–12 months"], ["Material", "Cotton-acrylic knit"], ["Safety", "No small parts"]], care: "Hand wash cold. Dry flat.", hsn: "6111", tags: ["booties", "under-999"], collections: ["newborn"], weightGrams: 60, img: { q: "baby shoes", pick: [12] } }),
    p({ title: "Wide-Neck Feeding Bottle (250 ml)", category: "baby", price: 549, short: "A BPA-free feeding bottle with an anti-colic vent and soft teat.", description: desc("An easy-to-clean wide neck, clear measurement markings and an anti-colic valve that lets air out so babies take in less of it.", ["Anti-colic valve", "Soft silicone teat, slow flow", "Clear ml and oz markings"]), specs: [["Age group", "0 months+"], ["Material", "BPA-free PP, silicone teat"], ["Capacity", "250 ml"], ["Safety", "Conforms to IS 14625 (BIS)"]], care: "Sterilise before first use. Hand wash or top rack. Replace teats every 2–3 months.", hsn: "3924", tags: ["feeding", "under-999"], collections: ["newborn"], weightGrams: 120, img: { q: "baby bottle", pick: [0] } }),
    p({ title: "Bath-Time Duck Family (Set of 4)", category: "baby", price: 299, short: "Four squeaky yellow ducks that float upright in the bath.", description: desc("Bath time's favourite guests. Each duck is moulded in one piece with no hole underneath, so water can't get inside and grow mould.", ["Set of four, two sizes", "Sealed: no hole, no mould", "Floats upright"]), specs: [["Age group", "6 months+"], ["Material", "Phthalate-free vinyl"], ["Safety", "IS 9873 (BIS) certified, sealed"], ["Size", "6 cm and 9 cm"]], care: "Rinse and dry after each bath.", tags: ["bath", "under-999"], collections: ["toddler"], weightGrams: 150, img: { q: "rubber duck", pick: [11] } }),
  ],
};

export default spec;
