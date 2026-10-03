import type { ShowcaseSpec, ShowProduct } from "../types";

const PAPER_CARE = "Store flat in a cool, dry place away from direct sunlight. Keep away from water and humidity.";
const p = (x: Omit<ShowProduct, "hsn" | "care"> & { hsn?: string; care?: string }): ShowProduct => ({ hsn: "4820", care: PAPER_CARE, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;
const tile = (kind: "category" | "collection", slugs: string[]) =>
  slugs.map((c) => ({ id: `$${kind}:${c}`, imagePath: kind === "category" ? `$catimg:${c}` : `$colimg:${c}`, label: "" }));

const spec: ShowcaseSpec = {
  slug: "pustak-ghar",
  name: "Pustak Ghar",
  industry: "books",
  owner: "Arindam Basu",
  theme: "margin-notes",
  tagline: "Notebooks, fountain pens and fine paper from College Street",
  story: [
    "Pustak Ghar opened in 1972 as a narrow paper-and-ink counter on College Street in Kolkata, the city's book market, selling exercise books and blue-black ink to students from the colleges next door. Fifty years on, the counter is still there, and so is the smell of paper.",
    "Today we make our own notebooks and journals in a small bindery behind the shop, on acid-free paper chosen for fountain pens, and stock the pens, pencils, art supplies and desk tools that go with them. Every product page lists the paper weight (GSM), page count, size and binding, so you know exactly what you're writing on.",
  ],
  email: "hello@pustakghar.test",
  phone: "+91 33 4062 1972",
  address: { line1: "No. 27, Bankim Chatterjee Street, College Street", city: "Kolkata", state: "West Bengal", postal_code: "700073" },
  legalName: "Pustak Ghar Stationers Private Limited",
  seo: { title: "Pustak Ghar — Notebooks, journals, fountain pens & fine paper", description: "House-bound notebooks and journals on fountain-pen-friendly paper, fountain pens, pencils, art supplies and desk tools from College Street, Kolkata. Free delivery above ₹599." },
  announcement: ["Free delivery on orders above ₹599", "House-bound notebooks on acid-free paper", "Free name label on every notebook"],
  categories: [
    { slug: "notebooks", name: "Notebooks & Journals", description: "Ruled, dotted and plain notebooks, journals and sketchbooks, bound in our own bindery." },
    { slug: "pens", name: "Pens & Ink", description: "Fountain pens, dip pens, rollerballs and brush pens." },
    { slug: "art", name: "Pencils & Art", description: "Graphite and colour pencils, watercolours and brushes." },
    { slug: "paper", name: "Paper & Letters", description: "Envelopes, wax seals and letter-writing supplies." },
    { slug: "desk", name: "Desk & Reading", description: "Desk lamps, organisers, magnifiers and study tools." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "What College Street comes back for." },
    { slug: "fine-writing", title: "Fine writing", description: "Fountain pens, dip pens and the paper that suits them." },
    { slug: "artist", title: "Artist's corner", description: "Pencils, paints, brushes and sketchbooks." },
    { slug: "new-term", title: "Back to college", description: "Notebooks and tools for the new term." },
    { slug: "gifts-under-999", title: "Gifts under ₹999", description: "Small, useful gifts for people who write.", tag: "under-999" },
  ],
  menu: [
    { title: "Notebooks", to: "/categories/notebooks" },
    { title: "Pens & Ink", to: "/categories/pens", children: [{ title: "Pens & Ink", to: "/categories/pens" }, { title: "Fine writing", to: "/collections/fine-writing" }] },
    { title: "Pencils & Art", to: "/categories/art" },
    { title: "Paper & Letters", to: "/categories/paper" },
    { title: "Desk", to: "/categories/desk" },
    { title: "Back to college", to: "/collections/new-term" },
    { title: "Gifts", to: "/collections/gifts-under-999" },
  ],
  faqs: [
    ["Is your paper fountain-pen friendly?", "Our house notebooks and journals use 80–120 GSM acid-free paper tested with wet fountain-pen nibs. Each product page lists the GSM and how much show-through to expect."],
    ["What do GSM and binding mean?", "GSM is the paper weight in grams per square metre: higher is thicker. Section-sewn (thread-bound) notebooks open flat and last longest; spiral binding folds back on itself; perfect binding is glued and lighter."],
    ["Do you sell published books?", "We focus on stationery. Our own house-bound notebooks and journals are made in our bindery behind the shop; we don't resell other publishers' titles online."],
    ["Can I get a notebook personalised?", "Yes. Every notebook ships with a free printed name label, and hardbound journals can be blind-embossed with initials for ₹149. Personalised items can't be returned."],
    ["How long does delivery take?", "Kolkata in 1–2 working days, metro cities in 2–4 and the rest of India in 4–7. Orders above ₹599 ship free; cash on delivery is available up to ₹5,000."],
    ["What if a pen doesn't write well?", "Fountain pens are tested before dispatch. If a nib scratches or a pen leaks within 30 days, send it back and we'll adjust or replace it free."],
  ],
  shippingNote: "Free delivery on orders above ₹599, otherwise ₹49. Kolkata in 1–2 working days, metro cities in 2–4, the rest of India in 4–7. Cash on delivery up to ₹5,000.",
  returnsNote: "Unused items in their original packing can be returned within 10 days of delivery. Personalised or embossed items can't be returned. Pens that arrive faulty or leak within 30 days are adjusted or replaced free.",
  images: {
    hero: { q: "library", pick: [7] },
    hero2: { q: "writing", pick: [2] },
    feature: { q: "fountain pen", pick: [1] },
    "feature-2": { q: "watercolor", pick: [3] },
    story: { q: "old books", pick: [1] },
    "promo-a": { q: "colored pencils", pick: [0] },
    "promo-b": { q: "paper clips", pick: [4] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A long aisle of bookshelves lit by hanging bulbs", eyebrow: "Since 1972, College Street", heading: "Paper worth writing on", subheading: "House-bound notebooks and journals on acid-free, fountain-pen-friendly paper.", ctaLabel: "Shop notebooks", ctaHref: "/categories/notebooks" },
          { imagePath: "$img:hero2", alt: "A woman writing in a notebook on the grass", eyebrow: "New term", heading: "Write it down, keep it", subheading: "Notebooks, planners and pens for lectures, lists and long letters.", ctaLabel: "Shop back to college", ctaHref: "/collections/new-term" },
        ],
      },
    ],
    marquee: ["Marquee", { items: [{ text: "Free delivery above ₹599" }, { text: "House-bound on acid-free paper" }, { text: "Free name label on notebooks" }, { text: "Pens tested before dispatch" }, { text: "Cash on delivery" }] }],
    categories: ["CategoryGrid", { eyebrow: "Browse", heading: "Shop by department", mode: "manual", items: tile("category", ["notebooks", "pens", "art", "paper", "desk"]) }],
    collections: ["CollectionGrid", { eyebrow: "Curated", heading: "From the shelves", mode: "manual", items: tile("collection", ["fine-writing", "artist", "gifts-under-999"]) }],
    journals: ["ProductGrid", { eyebrow: "From our bindery", heading: "Notebooks & journals", subheading: "Section-sewn, acid-free, and labelled with GSM, pages and size.", source: "category", categoryId: "$category:notebooks", viewAllHref: "/categories/notebooks" }],
    writing: ["ProductGrid", { eyebrow: "Fine writing", heading: "Pens, nibs and ink", subheading: "Every fountain pen is inked and tested before it ships.", source: "collection", collectionId: "$collection:fine-writing", viewAllHref: "/collections/fine-writing" }],
    art: ["ProductCarousel", { eyebrow: "Artist's corner", heading: "Pencils, paints & brushes", source: "collection", collectionId: "$collection:artist", viewAllHref: "/collections/artist" }],
    paper: ["ProductCarousel", { eyebrow: "New term", heading: "Back to college", subheading: "Exercise books, planners and desk tools.", source: "collection", collectionId: "$collection:new-term", viewAllHref: "/collections/new-term" }],
    new: ["ProductGrid", { eyebrow: "Just in", heading: "New on the counter", source: "newest", viewAllHref: "/collections" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    deals: ["ProductGrid", { eyebrow: "Term-start offers", heading: "Today's offers", source: "sale", viewAllHref: "/collections" }],
    story: [
      "BrandStory",
      { eyebrow: "Since 1972", heading: "A paper counter on College Street", body: "Pustak Ghar began as a narrow counter in Kolkata's book market, selling exercise books and blue-black ink to students from the colleges next door. Today our notebooks and journals are still folded, sewn and cased by hand in the bindery behind the shop, on acid-free paper we test with wet fountain-pen nibs.", imagePath: "$img:story", alt: "An old bound book tied with string and dried flowers", stats: [{ value: "1972", label: "Opened on College Street" }, { value: "100 GSM", label: "Standard notebook paper" }, { value: "Hand-sewn", label: "In our own bindery" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A hand writing with a fountain pen in a spiral notebook", eyebrow: "On paper", heading: "Why GSM matters", body: "Thin paper lets fountain-pen ink feather and show through. Our house notebooks start at 100 GSM, heavy enough for a wet nib and smooth enough for a fine one, and every product page tells you the weight, ruling and binding before you buy.", ctaLabel: "Shop fine writing", ctaHref: "/collections/fine-writing" },
    ],
    "feature-2": [
      "EditorialImageText",
      { imagePath: "$img:feature-2", alt: "A watercolour palette, brushes and a spiral sketchbook on a wooden table", eyebrow: "Artist's corner", heading: "Start a sketchbook habit", body: "Ten minutes a day is enough. A heavy-paper sketchbook, a small watercolour palette and two good brushes fit in a bag and turn a bus ride or a tea break into practice.", ctaLabel: "Shop art supplies", ctaHref: "/collections/artist" },
    ],
    lookbook: ["Lookbook", { eyebrow: "On the desk", heading: "Paper, pens & small things", looks: [0, 7, 3, 14, 18, 21].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "A row of sharpened colour pencils", heading: "Colour, sharpened", text: "Artist pencils, paints and brushes.", ctaLabel: "Shop art", ctaHref: "/categories/art" },
          { imagePath: "$img:promo-b", alt: "Binder clips, paper clips and a pen on a notepad", heading: "Back to college", text: "Notebooks and desk tools from ₹199.", ctaLabel: "Shop the list", ctaHref: "/collections/new-term" },
        ],
      },
    ],
    brands: ["BrandStrip", { eyebrow: "House ranges", heading: "", items: ["Pustak Ghar Bindery", "College Street Classics", "Ghar Ink Works", "Artist's Corner", "Desk & Lamp"].map((name) => ({ name, imagePath: "", href: "" })) }],
    trust: [
      "TrustBadges",
      {
        items: [
          { icon: "handmade", title: "Hand-bound", text: "Sewn in our College Street bindery" },
          { icon: "leaf", title: "Acid-free paper", text: "Won't yellow or crumble" },
          { icon: "truck", title: "Free delivery", text: "On orders above ₹599" },
          { icon: "return", title: "Pens guaranteed", text: "Adjusted or replaced within 30 days" },
        ],
      },
    ],
    faq: ["FAQ", { heading: "Paper questions", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "Letters from College Street", subheading: "New notebooks, ink colours and the occasional paper tip, once a month.", buttonLabel: "Subscribe" }],
  },
  products: [
    // ---- Notebooks & journals
    p({ title: "College Street A5 Ruled Notebook", category: "notebooks", price: 449, mrp: 549, options: [["Cover", ["Black|#1d1d1d", "Oxblood|#6b2a2a", "Bottle green|#1f3b2d"]]], short: "A hardbound A5 notebook with 192 ruled pages of 100 GSM ivory paper.", description: desc("Our best-selling everyday notebook, bound in the workshop behind the shop. The section-sewn spine opens flat on the desk, and the ivory 100 GSM paper takes fountain-pen ink without feathering.", ["Section-sewn binding, opens flat", "Ribbon marker and back pocket", "Free printed name label"]), specs: [["Size", "A5 (148 × 210 mm)"], ["Pages", "192 (96 sheets)"], ["Paper", "100 GSM ivory, acid-free"], ["Ruling", "7 mm ruled"], ["Binding", "Section-sewn hardcover"]], tags: ["notebook", "ruled", "under-999"], collections: ["bestsellers", "new-term", "fine-writing"], featured: true, weightGrams: 380, img: { q: "pen", pick: [3] } }),
    p({ title: "Dot-Grid Journal with Elastic Band", category: "notebooks", price: 599, mrp: 699, options: [["Cover", ["Chalk white|#f2f0ea", "Charcoal|#3a3a3a"]]], short: "A plain-cover A5 journal with 5 mm dot grid, elastic closure and pen loop.", description: desc("A clean, unbranded journal for planning, lists and bullet journalling. The faint 5 mm dot grid disappears behind your writing, and the elastic band keeps loose notes inside.", ["Elastic closure and ribbon marker", "Numbered pages and blank index", "Lay-flat sewn binding"]), specs: [["Size", "A5 (148 × 210 mm)"], ["Pages", "240 (120 sheets), numbered"], ["Paper", "120 GSM white, acid-free"], ["Ruling", "5 mm dot grid"], ["Binding", "Section-sewn hardcover"]], tags: ["journal", "dotted", "under-999"], collections: ["bestsellers", "fine-writing"], featured: true, weightGrams: 420, img: { q: "diary", pick: [4] } }),
    p({ title: "Botanical Spiral Notebook A5", category: "notebooks", price: 299, options: [["Print", ["Teal floral|#2f8f8b", "Mocha floral|#5b4a3f"]]], short: "A twin-wire spiral notebook with a printed botanical cover.", description: desc("A cheerful spiral notebook for lectures and lists. The twin-wire spiral folds all the way back, so it's easy to write on your lap.", ["Twin-wire spiral, folds back flat", "Laminated printed cover", "Micro-perforated pages tear out cleanly"]), specs: [["Size", "A5 (148 × 210 mm)"], ["Pages", "160 (80 sheets)"], ["Paper", "70 GSM white"], ["Ruling", "Ruled, with margin"], ["Binding", "Twin-wire spiral"]], tags: ["notebook", "spiral", "under-999"], collections: ["new-term", "gifts-under-999"], weightGrams: 260, img: { q: "journal", pick: [10] } }),
    p({ title: "Leather Ring-Binder Journal", category: "notebooks", price: 1299, mrp: 1599, short: "A pocket ring-binder in dark leather with refillable cream pages.", description: desc("A soft leather cover cut and stitched in Kolkata, with a brass ring mechanism that takes our cream refill pages. Add, remove and reorder pages as you go; the leather darkens and softens with use.", ["Vegetable-tanned leather cover", "Six brass rings, 64 cream refill pages included", "Fits a jacket pocket"]), specs: [["Size", "Pocket (95 × 170 mm)"], ["Pages", "64 refill pages"], ["Paper", "100 GSM cream, plain"], ["Cover", "Vegetable-tanned leather"], ["Binding", "Six-ring binder, refillable"]], care: "Wipe the leather with a dry cloth; condition with leather balm twice a year. Keep away from water.", hsn: "4202", tags: ["journal", "leather"], collections: ["fine-writing"], featured: true, weightGrams: 180, img: { q: "leather notebook", pick: [2] } }),
    p({ title: "Undated Weekly Planner", category: "notebooks", price: 549, short: "A spiral weekly planner you can start any month, with a week on two pages.", description: desc("Fifty-two undated weeks, so no page is wasted when you start in March. Each spread has a week on the left and a ruled notes page on the right.", ["52 undated weekly spreads", "Monthly overview pages", "Sturdy board covers and twin-wire spiral"]), specs: [["Size", "A5 (148 × 210 mm)"], ["Pages", "176"], ["Paper", "90 GSM white"], ["Layout", "Week on two pages, undated"], ["Binding", "Twin-wire spiral"]], tags: ["planner", "under-999"], collections: ["new-term"], weightGrams: 340, img: { q: "diary", pick: [5] } }),
    p({ title: "Artist's Sketchbook A4", category: "notebooks", price: 699, mrp: 799, short: "A hardbound A4 sketchbook with heavy 150 GSM cartridge paper.", description: desc("Thick, slightly toothy cartridge paper that takes graphite, charcoal, ink and light washes. The sewn spine opens flat for drawing across a spread.", ["150 GSM cartridge paper", "Opens flat across a spread", "Black linen hardcover"]), specs: [["Size", "A4 (210 × 297 mm)"], ["Pages", "112 (56 sheets)"], ["Paper", "150 GSM natural white cartridge"], ["Ruling", "Plain"], ["Binding", "Section-sewn hardcover"]], tags: ["sketchbook", "under-999"], collections: ["artist"], weightGrams: 720, img: { q: "drawing", pick: [6] } }),
    p({ title: "Plain-Cover Exercise Books (Set of 6)", category: "notebooks", price: 249, short: "Six stitched exercise books in bright plain covers, ready for subject labels.", description: desc("The College Street classic: thread-stitched exercise books in six colours, one per subject. Plain covers with no printing, so labels and doodles stand out.", ["Six colours, one per subject", "Thread-stitched spine", "Name labels included"]), specs: [["Size", "Long (170 × 270 mm)"], ["Pages", "172 each"], ["Paper", "58 GSM white"], ["Ruling", "Single ruled"], ["Binding", "Thread-stitched, soft cover"], ["Count", "6"]], tags: ["exercise-book", "under-999"], collections: ["new-term", "bestsellers"], weightGrams: 1100, img: { q: "leather notebook", pick: [9] } }),
    // ---- Pens & ink
    p({ title: "Heritage Gold-Nib Fountain Pen", category: "pens", price: 2499, mrp: 2999, options: [["Nib", ["Fine", "Medium"]]], short: "A black resin fountain pen with a gold-plated steel nib and converter.", description: desc("A classic, well-balanced fountain pen for daily writing. The gold-plated steel nib is smoothed and tested by hand before it leaves the shop, and the converter takes bottled ink.", ["Gold-plated steel nib, hand-tuned", "Piston converter and two cartridges included", "Gift box with care card"]), specs: [["Nib", "Gold-plated stainless steel, F or M"], ["Filling", "Cartridge or converter"], ["Ink type", "Standard international cartridges / bottled ink"], ["Body", "Black resin, gold-tone trim"], ["Length", "138 mm capped"]], care: "Flush with lukewarm water when changing ink colours. Store capped, nib up.", hsn: "9608", tags: ["fountain-pen"], collections: ["fine-writing", "bestsellers"], featured: true, weightGrams: 120, img: { q: "fountain pen", pick: [2] } }),
    p({ title: "Vermilion Fountain Pen", category: "pens", price: 1499, short: "A glossy red fountain pen with a fine steel nib, made for everyday notes.", description: desc("A bright, light fountain pen in sindoor red. The fine steel nib suits small handwriting and thinner paper.", ["Fine steel nib", "Snap cap with clip", "Takes cartridges or a converter"]), specs: [["Nib", "Stainless steel, Fine"], ["Filling", "Cartridge or converter (included)"], ["Ink type", "Standard international cartridges / bottled ink"], ["Body", "Lacquered brass, red"], ["Length", "135 mm capped"]], care: "Flush with lukewarm water when changing ink colours. Store capped, nib up.", hsn: "9608", tags: ["fountain-pen"], collections: ["fine-writing"], weightGrams: 90, img: { q: "fountain pen", pick: [3] } }),
    p({ title: "Calligraphy Dip Pen & Nib Set", category: "pens", price: 899, mrp: 1099, short: "A lacquered dip-pen holder with five steel nibs for copperplate and italic lettering.", description: desc("Everything you need to start pointed-pen and broad-edge lettering: a light lacquered holder, five nibs from fine to broad and a guide sheet with practice strokes.", ["Black lacquered holder", "Five steel nibs, fine to broad", "Printed practice guide"]), specs: [["Nib", "5 steel dip nibs (pointed and broad-edge)"], ["Holder", "Lacquered wood, black"], ["Ink type", "Dip: calligraphy or India ink (not included)"], ["Length", "175 mm"]], care: "Wipe nibs dry after each use to prevent rust.", hsn: "9608", tags: ["calligraphy", "under-999"], collections: ["fine-writing", "gifts-under-999"], weightGrams: 80, img: { q: "nib", pick: [1] } }),
    p({ title: "Matte Black Rollerball Pen", category: "pens", price: 399, short: "A slim aluminium rollerball with smooth 0.5 mm black gel ink.", description: desc("A no-fuss rollerball that writes from the first stroke. The matte aluminium barrel is light and cool to hold, and refills are easy to find.", ["0.5 mm gel ink, quick-drying", "Aluminium barrel, matte finish", "Refillable"]), specs: [["Tip", "0.5 mm"], ["Ink type", "Gel, black"], ["Body", "Anodised aluminium"], ["Refill", "Standard G2-size gel refill"]], care: "Store capped.", hsn: "9608", tags: ["rollerball", "under-999"], collections: ["new-term", "gifts-under-999"], weightGrams: 25, img: { q: "pen", pick: [5] } }),
    p({ title: "Dual-Tip Brush Pens (Set of 12)", category: "pens", price: 649, mrp: 749, short: "Twelve water-based brush pens with a flexible brush tip and a fine tip.", description: desc("A soft brush tip for lettering and colour fills, and a 0.4 mm fine tip for outlines, in one pen. Water-based ink blends with a wet brush.", ["Brush tip and 0.4 mm fine tip", "Water-based, blendable ink", "12 colours"]), specs: [["Tips", "Flexible brush + 0.4 mm fine"], ["Ink type", "Water-based, non-toxic"], ["Count", "12 colours"]], care: "Store horizontally with caps on.", hsn: "9608", tags: ["brush-pen", "under-999"], collections: ["artist"], weightGrams: 140, img: { q: "markers", pick: [3] } }),
    // ---- Pencils & art
    p({ title: "Artist Colour Pencils (24 Shades)", category: "art", price: 799, mrp: 949, short: "Soft, richly pigmented colour pencils that layer and blend.", description: desc("Wax-based cores with high pigment load, so colours layer and burnish smoothly. Light-fast enough for finished work.", ["24 shades", "3.8 mm soft cores", "Reusable tin"]), specs: [["Count", "24"], ["Core", "Wax-based, 3.8 mm"], ["Casing", "Cedar wood"], ["Lightfastness", "Most shades rated good to excellent"]], care: "Sharpen with a hand sharpener. Store in the tin.", hsn: "9609", tags: ["colour-pencil", "under-999"], collections: ["artist", "bestsellers"], featured: true, weightGrams: 380, img: { q: "colored pencils", pick: [13] } }),
    p({ title: "Graphite Sketching Pencils (Set of 6)", category: "art", price: 299, short: "Six silver-lacquered graphite pencils from 2H to 6B.", description: desc("A graded set of cedar pencils for sketching and shading, from a hard 2H for light construction lines to a soft 6B for deep shadows.", ["Grades 2H, HB, 2B, 4B, 5B, 6B", "Cedar casing, sharpens cleanly", "Break-resistant bonded leads"]), specs: [["Grades", "2H, HB, 2B, 4B, 5B, 6B"], ["Lead", "Graphite, 2.2 mm"], ["Casing", "Cedar wood"], ["Count", "6"]], care: "Sharpen with a hand sharpener or craft knife.", hsn: "9609", tags: ["pencil", "under-999"], collections: ["artist", "new-term", "bestsellers"], weightGrams: 70, img: { q: "pencils", pick: [6] } }),
    p({ title: "Watercolour Pan Set (24 Colours)", category: "art", price: 899, mrp: 1099, short: "Twenty-four half pans of bright watercolour in a flip-top palette.", description: desc("Clear, transparent watercolours in a white palette with built-in mixing wells. Great for travel sketching and botanical studies.", ["24 half pans", "Mixing palette in the lid", "Travel brush included"]), specs: [["Count", "24 half pans"], ["Binder", "Gum arabic"], ["Palette", "White plastic, flip-top"], ["Size", "190 × 95 mm closed"]], care: "Let the palette dry open before closing.", hsn: "3213", tags: ["watercolour", "under-999"], collections: ["artist", "bestsellers"], weightGrams: 260, img: { q: "watercolor", pick: [1] } }),
    p({ title: "Artist Brush Set (Set of 10)", category: "art", price: 549, short: "Ten synthetic brushes in round, flat and filbert shapes.", description: desc("Soft synthetic brushes that hold water well and keep their point, for watercolour, gouache and acrylic.", ["Rounds, flats and filberts", "Seamless nickel ferrules", "Short lacquered wooden handles"]), specs: [["Count", "10"], ["Hair", "Synthetic taklon"], ["Shapes", "Round 0–8, flat 2–12, filbert 6"], ["Handle", "Lacquered birch, short"]], care: "Rinse in water after use, reshape the tip and dry flat.", hsn: "9603", tags: ["brushes", "under-999"], collections: ["artist"], weightGrams: 90, img: { q: "paint brushes", pick: [2] } }),
    p({ title: "Metal Pencil Sharpener", category: "art", price: 199, short: "A solid metal wedge sharpener with a replaceable steel blade.", description: desc("A heavy little sharpener machined from solid metal, the kind that lasts from school to retirement. It gives a long, sharp point and the blade is replaceable.", ["Solid die-cast body", "Replaceable carbon-steel blade", "Fits standard 8 mm pencils"]), specs: [["Material", "Die-cast alloy, steel blade"], ["Fits", "Standard pencils up to 8 mm"], ["Size", "25 × 16 × 8 mm"]], care: "Tap out shavings after use. Replace the blade when the point tears.", hsn: "8214", tags: ["sharpener", "under-999"], collections: ["gifts-under-999"], weightGrams: 25, img: { q: "pencil sharpener", pick: [0] } }),
    // ---- Paper & letters
    p({ title: "Cotton Paper Envelopes (Pack of 25)", category: "paper", price: 349, short: "Cream cotton-rag envelopes with a deep pointed flap.", description: desc("Soft, slightly textured envelopes made from cotton rag in Sanganer. The deep flap takes a wax seal beautifully.", ["25 envelopes", "Pointed flap, gummed", "Pairs with A5 letter paper folded once"]), specs: [["Size", "C6 (114 × 162 mm)"], ["Paper", "120 GSM cotton rag, cream"], ["Count", "25"], ["Closure", "Gummed pointed flap"]], tags: ["envelope", "letters", "under-999"], collections: ["gifts-under-999"], weightGrams: 180, img: { q: "envelope", pick: [2] } }),
    p({ title: "Wax Seal Starter Kit", category: "paper", price: 999, mrp: 1199, options: [["Wax", ["Sealing red|#a4161a", "Antique gold|#b08d57"]]], short: "A brass seal with a classic crest motif, wooden handle and six wax sticks.", description: desc("Seal letters and invitations the old way. Melt the wax, press the brass stamp and lift for a crisp crest impression.", ["Brass seal with wooden handle", "Six sealing-wax sticks", "Melting spoon and tea light"]), specs: [["Seal", "Brass, 25 mm, crest motif"], ["Wax", "6 sticks"], ["Includes", "Melting spoon, tea light"], ["Box", "Kraft gift box"]], care: "Wipe the seal clean while warm. Keep wax away from heat.", hsn: "3404", tags: ["wax-seal", "letters"], collections: ["gifts-under-999", "fine-writing"], featured: true, weightGrams: 260, img: { q: "wax seal", pick: [3] } }),
    // ---- Desk & reading
    p({ title: "Glazed Ceramic Pencil Cup", category: "desk", price: 599, short: "A bottle-green twin pencil cup with hand-painted gold leaves.", description: desc("Two deep, joined cups for pens on one side and pencils on the other, glazed in bottle green and finished with gold leaf sprigs painted by hand in Khurja.", ["Twin compartments", "Hand-painted gold detail", "Felt base protects the desk"]), specs: [["Material", "Glazed stoneware"], ["Compartments", "2"], ["Size", "W 14 × D 8 × H 11 cm"], ["Made in", "Khurja, Uttar Pradesh"]], care: "Wipe with a damp cloth. Not dishwasher safe (hand-painted gold).", hsn: "6912", tags: ["organiser", "under-999"], collections: ["new-term", "gifts-under-999"], weightGrams: 650, img: { q: "pencil holder", pick: [9] } }),
    p({ title: "Wooden Set Square & Ruler Set", category: "desk", price: 449, short: "A teak-finish set square, protractor and 30 cm ruler for drawing and study.", description: desc("Smooth, warm wooden drawing tools for geometry homework and drafting, with laser-etched markings that won't rub off.", ["30 cm ruler, 45° and 60° set squares, protractor", "Laser-etched markings", "Cotton pouch"]), specs: [["Material", "Rubberwood, teak finish"], ["Ruler", "30 cm, mm markings"], ["Pieces", "4"]], care: "Wipe clean. Keep dry to prevent warping.", hsn: "9017", tags: ["geometry", "under-999"], collections: ["new-term"], weightGrams: 220, img: { q: "ruler", pick: [0] } }),
    p({ title: "Swing-Arm Reading Lamp", category: "desk", price: 2299, mrp: 2799, short: "A white metal desk lamp with an adjustable arm and warm LED bulb.", description: desc("A calm, warm light for reading and writing late. The arm and shade adjust to put light where the page is, without glare.", ["Adjustable arm and shade", "Warm 2700 K LED bulb included", "Weighted base"]), specs: [["Material", "Powder-coated steel"], ["Bulb", "E27, 7 W LED, 2700 K (included)"], ["Height", "Up to 52 cm"], ["Cable", "1.8 m with inline switch"]], care: "Unplug before cleaning. Wipe with a dry cloth.", hsn: "9405", tags: ["lamp"], collections: ["bestsellers"], featured: true, weightGrams: 1400, img: { q: "desk lamp", pick: [4] } }),
    p({ title: "Brass Reading Magnifier", category: "desk", price: 799, short: "A 3× glass magnifier with a gold-tone rim and red lacquered handle.", description: desc("For fine print, maps, stamps and old letters. The polished glass lens gives a clear 3× view edge to edge.", ["3× optical glass lens, 75 mm", "Gold-tone brass rim, red lacquered handle", "Velvet pouch"]), specs: [["Magnification", "3×"], ["Lens", "Optical glass, 75 mm"], ["Frame", "Brass rim, lacquered handle"], ["Length", "21 cm"]], care: "Clean the lens with a soft lens cloth.", hsn: "9013", tags: ["magnifier", "under-999"], collections: ["gifts-under-999"], weightGrams: 210, img: { q: "magnifying glass", pick: [8] } }),
  ],
};

export default spec;
