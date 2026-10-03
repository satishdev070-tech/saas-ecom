import type { ShowcaseSpec, ShowProduct } from "../types";

const SILVER_CARE = "Store in the zip pouch provided, away from moisture. Wipe with the polishing cloth after wear. Keep away from perfume, sanitiser and water.";
const GOLD_CARE = "Store each piece separately in its box. Clean with lukewarm water and a soft brush; pat dry. Remove before swimming or applying perfume.";
const PLATED_CARE = "Keep dry and away from perfume and sanitiser. Wipe with a soft cloth after wear and store in the box provided to protect the plating.";
const p = (x: Omit<ShowProduct, "hsn" | "care" | "type"> & { hsn?: string; care?: string; type?: ShowProduct["type"] }): ShowProduct => ({ hsn: "7113", care: SILVER_CARE, type: "accessory", ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Details\n${points.map((t) => `- ${t}`).join("\n")}`;
const FINISH: [string, string[]] = ["Finish", ["Gold|#d4af37", "Rose gold|#b76e79", "Silver|#c9c9c9"]];
const RING: [string, string[]] = ["Ring size", ["8", "10", "12", "14", "16"]];

const spec: ShowcaseSpec = {
  slug: "suvarna",
  name: "Suvarna Jewels",
  industry: "jewellery",
  owner: "Meenakshi Iyer",
  theme: "gilded-luxe",
  tagline: "Hallmarked gold, 925 silver and temple jewellery from Coimbatore",
  story: [
    "Suvarna Jewels began in 1994 as a two-bench workshop on Big Bazaar Street in Coimbatore, making temple jewellery for Bharatanatyam dancers and families of the bride. Today the same karigars, and their children, make hallmarked gold, 925 sterling silver and gold-plated pieces for everyday and for once-in-a-lifetime.",
    "Every gold piece carries a BIS hallmark and every silver piece is stamped 925. We publish the metal, purity and weight of each design, offer lifetime exchange on gold at the day's rate, and pack every order in a gift-ready box.",
  ],
  email: "care@suvarnajewels.test",
  phone: "+91 422 439 6720",
  address: { line1: "No. 214, Big Bazaar Street, Town Hall", city: "Coimbatore", state: "Tamil Nadu", postal_code: "641001" },
  legalName: "Suvarna Jewels Private Limited",
  seo: { title: "Suvarna Jewels — Hallmarked gold, 925 silver & temple jewellery", description: "Temple, kundan-style, everyday gold and sterling silver jewellery made in Coimbatore. BIS hallmarked, insured free shipping, lifetime gold exchange." },
  announcement: ["Free insured shipping across India", "BIS hallmarked gold · 925 stamped silver", "Lifetime exchange on gold at the day's rate"],
  categories: [
    { slug: "earrings", name: "Earrings", description: "Jhumkas, temple drops, hoops and huggies." },
    { slug: "necklaces", name: "Necklaces", description: "Temple collars, layered chains and pearl strands." },
    { slug: "pendants", name: "Pendants", description: "Coin pendants, lockets and gemstone drops." },
    { slug: "rings", name: "Rings", description: "Solitaires, cocktail rings and toe rings." },
    { slug: "bangles", name: "Bangles & Cuffs", description: "Gold bangles, silver kadas and cuffs." },
    { slug: "boxes", name: "Jewellery Boxes", description: "Inlay and enamel boxes for keeping and gifting." },
  ],
  collections: [
    { slug: "bridal", title: "The bridal edit", description: "Temple gold and statement pieces for the wedding day." },
    { slug: "heritage", title: "Temple & heritage", description: "Nakshi, temple and meenakari designs from our Coimbatore workshop." },
    { slug: "everyday", title: "Everyday fine", description: "Light pieces made to wear every day." },
    { slug: "bestsellers", title: "Best sellers", description: "The designs our customers come back for." },
    { slug: "silver", title: "925 silver", description: "Sterling silver, stamped and certified.", tag: "silver" },
    { slug: "gifts-under-5000", title: "Gifts under ₹5,000", description: "Gift-boxed and ready to give.", tag: "under-5000" },
  ],
  menu: [
    { title: "Earrings", to: "/categories/earrings" },
    { title: "Necklaces", to: "/categories/necklaces", children: [{ title: "Necklaces", to: "/categories/necklaces" }, { title: "Pendants", to: "/categories/pendants" }] },
    { title: "Rings", to: "/categories/rings" },
    { title: "Bangles", to: "/categories/bangles" },
    { title: "Bridal", to: "/collections/bridal" },
    { title: "Silver", to: "/collections/silver" },
    { title: "Gifting", to: "/collections/gifts-under-5000" },
  ],
  faqs: [
    ["Is your gold hallmarked?", "Yes. Every gold piece carries a BIS hallmark with its purity (22K, 18K or 14K) and a unique HUID number, which you can verify on the BIS CARE app."],
    ["How is the price of gold jewellery worked out?", "The product page shows the metal weight, purity, making charge and GST. Prices of gold pieces are updated each morning in line with the day's gold rate."],
    ["Do you offer exchange on gold?", "Yes, lifetime exchange on any Suvarna gold piece at the day's gold rate, less 2% for wastage. Bring it to our store or send it insured with the invoice."],
    ["Will gold-plated pieces tarnish?", "Our plating is a thick micron layer over brass or 925 silver. Kept dry and away from perfume, it lasts years; we offer re-plating at a nominal charge."],
    ["How do I find my ring size?", "Measure the inside diameter of a ring that fits you and match it with the size guide on every ring page, or ask us for a free plastic ring sizer by post."],
    ["Is shipping insured?", "Yes. All orders ship free, fully insured, in tamper-proof packaging. Orders above ₹50,000 need a signature and photo ID on delivery."],
  ],
  shippingNote: "Free, fully insured shipping across India. Ready pieces ship within 2 working days and arrive in 3–7 days; made-to-order gold takes 12–15 days. Orders above ₹50,000 are handed over only against photo ID.",
  returnsNote: "Unworn silver and gold-plated pieces can be returned within 10 days. Gold pieces can be returned within 7 days at the invoiced metal value less making charges, and exchanged for life at the day's rate. Personalised and resized pieces can't be returned.",
  images: {
    hero: { q: "indian wedding", pick: [0] },
    hero2: { q: "woman jewelry", pick: [0] },
    craft: { q: "gold ring", pick: [11] },
    feature: { q: "woman jewelry", pick: [3] },
    styling: { q: "ring", pick: [1] },
    "promo-a": { q: "gift box", pick: [8] },
    "promo-b": { q: "gift box", pick: [10] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "A bride's hands with gold bangles and mehendi", eyebrow: "The bridal edit", heading: "Gold for the days you'll remember", subheading: "Temple and heritage jewellery, hallmarked and made in Coimbatore.", ctaLabel: "Shop bridal", ctaHref: "/collections/bridal" },
          { imagePath: "$img:hero2", alt: "Hands wearing stacked rings", eyebrow: "Everyday fine", heading: "Small pieces, worn every day", subheading: "925 silver and light gold, made to stack.", ctaLabel: "Shop everyday", ctaHref: "/collections/everyday" },
        ],
      },
    ],
    categories: ["CategoryGrid", { eyebrow: "Browse", heading: "Shop by category", mode: "manual", items: ["earrings", "necklaces", "pendants", "rings", "bangles", "boxes"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    collections: ["CollectionGrid", { eyebrow: "Curated", heading: "Find your piece", mode: "manual", items: ["bridal", "heritage", "everyday"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    bridal: ["ProductGrid", { eyebrow: "For the bride", heading: "The bridal edit", source: "collection", collectionId: "$collection:bridal", viewAllHref: "/collections/bridal" }],
    heritage: ["ProductGrid", { eyebrow: "From our workshop", heading: "Temple & heritage", subheading: "Nakshi, meenakari and temple gold, made by hand.", source: "collection", collectionId: "$collection:heritage", viewAllHref: "/collections/heritage" }],
    everyday: ["ProductGrid", { heading: "Everyday fine", subheading: "Light enough to forget you're wearing them.", source: "collection", collectionId: "$collection:everyday", viewAllHref: "/collections/everyday" }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New in 925 silver", source: "collection", collectionId: "$collection:silver", viewAllHref: "/collections/silver" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    offers: ["ProductCarousel", { eyebrow: "Festive offers", heading: "Prices you'll love", source: "sale", viewAllHref: "/collections" }],
    craft: [
      "BrandStory",
      { eyebrow: "Since 1994", heading: "Made at the bench, not the factory", body: "Our karigars on Big Bazaar Street still shape temple motifs by hand: chasing the nakshi pattern, setting each stone and finishing every piece on a hand-held buff. Gold is BIS hallmarked, silver is stamped 925, and every weight on our site is the weight you receive.", imagePath: "$img:craft", alt: "A goldsmith's tools and a gold ring on the workbench", stats: [{ value: "30+", label: "Years in Coimbatore" }, { value: "18", label: "Karigars at the bench" }, { value: "100%", label: "Hallmarked gold" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "A wrist stacked with bracelets", eyebrow: "The stack", heading: "Mix your metals", body: "A slim gold bangle beside an oxidised silver cuff, a pearl strand over a fine chain: the most personal jewellery is rarely a matching set. Start with one piece you love and build around it.", ctaLabel: "Shop bangles & cuffs", ctaHref: "/categories/bangles" },
    ],
    styling: [
      "EditorialImageText",
      { imagePath: "$img:styling", alt: "Hands wearing rings outdoors", eyebrow: "Styling notes", heading: "One ring, three ways", body: "Wear a solitaire alone for the office, stack it with a slim band for dinner, or pair it with a cocktail ring on the next finger for a wedding. All our rings come in half sizes and can be resized once for free.", ctaLabel: "Shop rings", ctaHref: "/categories/rings" },
    ],
    lookbook: ["Lookbook", { eyebrow: "Up close", heading: "The details", looks: [0, 6, 8, 13, 16, 18].map((i) => ({ imagePath: `$product:${i}`, alt: "", caption: "", productId: `$productId:${i}` })) }],
    social: ["SocialProof", { heading: "From the Suvarna tray", subheading: "Pieces from this season, photographed as they are.", handle: "", posts: [1, 3, 5, 7, 10, 12, 15, 17, 19].map((i) => ({ imagePath: `$product:${i}`, alt: "", href: "" })), showProfile: false }],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "A black gift box tied with a gold ribbon", heading: "Gifts that last", text: "Every order arrives gift-boxed.", ctaLabel: "Shop gifting", ctaHref: "/collections/gifts-under-5000" },
          { imagePath: "$img:promo-b", alt: "A gift box tied with a ribbon", heading: "925 silver under ₹5,000", text: "Earrings, pendants and toe rings.", ctaLabel: "Shop silver", ctaHref: "/collections/silver" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "Festive season", heading: "Up to 20% off silver & making charges on gold", subheading: "Prices already reduced, no code needed.", ctaLabel: "Shop the offers", ctaHref: "/collections/bestsellers", background: "#4a1942", textColor: "#fdf3dc" }],
    trust: ["TrustBadges", { items: [{ icon: "secure", title: "BIS hallmarked", text: "HUID on every gold piece" }, { icon: "truck", title: "Free insured shipping", text: "Across India" }, { icon: "return", title: "Lifetime gold exchange", text: "At the day's rate" }, { icon: "gift", title: "Gift-ready boxes", text: "On every order" }] }],
    faq: ["FAQ", { heading: "Buying jewellery online", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "First look at new designs", subheading: "New collections, festive offers and the occasional gold-rate note.", buttonLabel: "Subscribe" }],
    marquee: ["Marquee", { items: [{ text: "BIS hallmarked gold" }, { text: "925 stamped silver" }, { text: "Free insured shipping" }, { text: "Lifetime gold exchange" }, { text: "Made in Coimbatore" }] }],
  },
  products: [
    p({ title: "Jaal Meenakari Jhumkas", category: "earrings", price: 4890, mrp: 5750, short: "Bell jhumkas with a kundan-style top and blue meenakari enamel.", description: desc("A festive classic: a jaal-work stud set with stones, an enamelled bell and a fringe of tiny pearls that moves when you do.", ["Gold-plated 925 silver", "Hand-painted meenakari enamel", "Push-back with ear-chain loop"]), specs: [["Metal", "925 sterling silver"], ["Plating", "22K gold, 2 micron"], ["Stones", "White CZ, glass pearls"], ["Length", "5.5 cm"], ["Weight", "18.4 g (pair)"], ["Closure", "Push back"]], care: PLATED_CARE, tags: ["jhumka", "silver", "under-5000"], collections: ["heritage", "bestsellers"], featured: true, weightGrams: 60, img: { q: "jhumka", pick: [0] } }),
    p({ title: "Nakshi Temple Drop Earrings", category: "earrings", price: 38900, short: "Domed 22K gold earrings with granulation and hanging drops.", description: desc("Hand-chased nakshi work in the temple tradition, finished with tiny granules of gold and three drops that catch the light.", ["BIS hallmarked 22K gold", "Hand-chased dome", "Screw back for heavier wear"]), specs: [["Metal", "22K yellow gold (916)"], ["Weight", "4.1 g (pair)"], ["Length", "2.8 cm"], ["Finish", "Antique matte"], ["Hallmark", "BIS with HUID"], ["Closure", "Screw back"]], care: GOLD_CARE, tags: ["temple", "gold"], collections: ["heritage", "bridal"], featured: true, weightGrams: 40, img: { q: "gold earrings", pick: [5] } }),
    p({ title: "Chaukor Fringe Earrings", category: "earrings", price: 6490, mrp: 7490, short: "Square gold-plated drops with a glass stone and a beaded fringe.", description: desc("A square frame set with a green glass stone, edged with granulation and finished with a fringe of gold beads.", ["Gold-plated 925 silver", "Glass stone centre", "Lightweight for its size"]), specs: [["Metal", "925 sterling silver"], ["Plating", "22K gold, 2 micron"], ["Stone", "Green glass"], ["Length", "4.2 cm"], ["Weight", "11.2 g (pair)"]], care: PLATED_CARE, tags: ["temple", "silver"], collections: ["heritage"], weightGrams: 40, img: { q: "gold earrings", pick: [4] } }),
    p({ title: "Classic 18K Gold Hoops", category: "earrings", price: 21500, options: [["Diameter", ["15 mm", "20 mm"]]], short: "Plain, polished 18K gold hoops you'll never take off.", description: desc("The hoop everyone needs: seamless tubing, polished to a mirror finish, with a hinged latch that clicks shut.", ["BIS hallmarked 18K gold", "Hinged click latch", "Light enough to sleep in"]), specs: [["Metal", "18K yellow gold (750)"], ["Weight", "2.3 g (pair, 15 mm)"], ["Thickness", "2 mm"], ["Finish", "High polish"], ["Hallmark", "BIS with HUID"]], care: GOLD_CARE, tags: ["hoops", "gold"], collections: ["everyday", "bestsellers"], featured: true, weightGrams: 30, img: { q: "gold earrings", pick: [2] } }),
    p({ title: "Bindu Disc Hoop Earrings", category: "earrings", price: 14900, short: "Fine 18K gold wire hoops, each with a small domed disc.", description: desc("A whisper of gold: fine wire hoops threaded with a tiny domed disc that sits on the earlobe. Light enough to wear every day and to sleep in.", ["BIS hallmarked 18K gold", "Hook-through wire closure", "Under 1.5 g the pair"]), specs: [["Metal", "18K yellow gold (750)"], ["Weight", "1.4 g (pair)"], ["Hoop", "12 mm"], ["Disc", "Ø 5 mm, domed"], ["Hallmark", "BIS with HUID"]], care: GOLD_CARE, tags: ["hoops", "gold"], collections: ["everyday"], weightGrams: 20, img: { q: "gold earrings", pick: [15] } }),
    p({ title: "Lakshmi Coin Pendant Chain", category: "pendants", price: 46800, short: "A 22K gold Lakshmi coin on a fine rope chain.", description: desc("A small gold coin stamped with Goddess Lakshmi, hung from a rope chain. A traditional gift for Akshaya Tritiya and new beginnings.", ["BIS hallmarked 22K gold", "18-inch rope chain with lobster clasp", "Coin is double-sided"]), specs: [["Metal", "22K yellow gold (916)"], ["Weight", "4.9 g (with chain)"], ["Coin", "Ø 14 mm"], ["Chain length", "18 in"], ["Hallmark", "BIS with HUID"]], care: GOLD_CARE, tags: ["coin", "gold"], collections: ["bridal"], weightGrams: 30, img: { q: "gold necklace", pick: [3] } }),
    p({ title: "Mor Temple Collar Necklace", category: "necklaces", price: 18900, mrp: 22500, short: "A wide temple-style collar with a fringe of gold drops.", description: desc("Inspired by the attigai worn by South Indian brides: a broad collar of hand-finished links with a dense fringe of drops that sits close to the neck.", ["Gold-plated 925 silver", "Adjustable dori at the back", "Comes in a velvet bridal box"]), specs: [["Metal", "925 sterling silver"], ["Plating", "22K gold, 3 micron, antique finish"], ["Weight", "68 g"], ["Length", "14 in + adjustable dori"], ["Style", "Temple choker"]], care: PLATED_CARE, tags: ["temple", "silver", "choker"], collections: ["bridal", "heritage", "bestsellers"], featured: true, weightGrams: 300, img: { q: "gold necklace", pick: [1] } }),
    p({ title: "Trio Layered Chain Necklace", category: "necklaces", price: 3290, short: "Three fine chains at three lengths, joined at one clasp.", description: desc("The layered look without the tangle: three delicate chains, the shortest with a tiny disc, all on a single clasp.", ["Gold-plated 925 silver", "One clasp, no tangling", "Extender for 2 in more"]), specs: [["Metal", "925 sterling silver"], ["Plating", "18K gold, 1 micron"], ["Lengths", "15, 17 and 19 in"], ["Weight", "4.6 g"], ["Clasp", "Lobster"]], care: PLATED_CARE, options: [FINISH], tags: ["layered", "silver", "under-5000"], collections: ["everyday", "bestsellers"], weightGrams: 40, img: { q: "gold necklace", pick: [5] } }),
    p({ title: "Moti Freshwater Pearl Strand", category: "necklaces", price: 7900, mrp: 8900, short: "A single strand of hand-knotted freshwater pearls.", description: desc("Near-round white freshwater pearls, knotted by hand between each pearl so the strand stays safe if it ever breaks. Sourced and strung in Hyderabad.", ["7–7.5 mm freshwater pearls", "Hand-knotted on silk", "925 silver clasp"]), specs: [["Pearl", "Freshwater, near-round, 7–7.5 mm"], ["Lustre", "High"], ["Length", "18 in"], ["Clasp", "925 silver fish-hook"], ["Weight", "34 g"]], care: "Put pearls on last and take them off first. Wipe with a soft cloth; never wash or soak. Store flat, away from other jewellery.", hsn: "7116", tags: ["pearl"], collections: ["bridal", "everyday"], weightGrams: 80, img: { q: "pearl necklace", pick: [4] } }),
    p({ title: "Firoza Crystal Pendant", category: "pendants", price: 2190, short: "A turquoise-blue crystal point on a fine silver chain.", description: desc("A polished six-sided crystal point in turquoise blue, capped in sterling silver and hung on a fine box chain.", ["925 silver cap and chain", "Natural howlite, dyed turquoise blue", "18-inch chain"]), specs: [["Metal", "925 sterling silver"], ["Stone", "Howlite (dyed), 22 mm"], ["Chain", "Box chain, 18 in"], ["Weight", "3.8 g"]], tags: ["gemstone", "silver", "under-5000"], collections: ["everyday"], weightGrams: 30, img: { q: "gemstone", pick: [11] } }),
    p({ title: "Engraved Oval Silver Locket", category: "pendants", price: 3650, short: "An oxidised oval locket with hand-engraved florals, opens for two photos.", description: desc("A locket for keeping someone close: hand-engraved flowers on the front, space for two small photos inside.", ["925 sterling silver, oxidised", "Opens for two photos", "20-inch chain included"]), specs: [["Metal", "925 sterling silver"], ["Finish", "Oxidised, hand-engraved"], ["Size", "28 × 20 mm"], ["Chain", "20 in cable chain"], ["Weight", "9.5 g"]], tags: ["locket", "silver", "oxidised", "under-5000"], collections: ["bestsellers"], weightGrams: 40, img: { q: "chain necklace", pick: [12] } }),
    p({ title: "Tara Solitaire Ring", category: "rings", price: 42500, options: [RING], short: "A lab-grown diamond solitaire in a six-claw 14K gold setting.", description: desc("A classic engagement silhouette: a brilliant-cut lab-grown diamond held high in six claws on a slim 14K gold band.", ["0.30 ct lab-grown diamond, IGI certified", "BIS hallmarked 14K gold", "Free resizing once"]), specs: [["Metal", "14K yellow gold (585)"], ["Stone", "Lab-grown diamond, 0.30 ct"], ["Colour / clarity", "F / VS1"], ["Setting", "Six-claw solitaire"], ["Weight", "2.2 g"], ["Certificate", "IGI"]], care: GOLD_CARE, tags: ["solitaire", "gold"], collections: ["bridal", "bestsellers"], featured: true, weightGrams: 30, img: { q: "diamond ring", pick: [14] } }),
    p({ title: "Marcasite Cocktail Ring", category: "rings", price: 4290, mrp: 4990, options: [RING], short: "A tall oval cocktail ring paved with marcasite in oxidised silver.", description: desc("Vintage glamour in sterling silver: a domed oval set with dozens of hand-placed marcasite stones around a dark centre stone.", ["Oxidised 925 silver", "Hand-set marcasite", "Statement size, 32 mm tall"]), specs: [["Metal", "925 sterling silver, oxidised"], ["Stones", "Marcasite, black onyx centre"], ["Face", "32 × 18 mm"], ["Weight", "8.1 g"]], tags: ["cocktail", "silver", "oxidised", "under-5000"], collections: ["heritage"], weightGrams: 30, img: { q: "diamond ring", pick: [15] } }),
    p({ title: "Gulabi Halo Ring", category: "rings", price: 3490, options: [RING], short: "A pink oval stone in a halo of sparkling CZ, rose-gold plated.", description: desc("A soft pink oval centre ringed with tiny stones on a pavé band, plated in rose gold over sterling silver.", ["Rose-gold-plated 925 silver", "Pink and white CZ", "Comfort-fit band"]), specs: [["Metal", "925 sterling silver"], ["Plating", "Rose gold, 1 micron"], ["Stones", "Pink CZ centre, white CZ halo"], ["Weight", "3.4 g"]], care: PLATED_CARE, tags: ["halo", "silver", "under-5000"], collections: ["everyday"], weightGrams: 30, img: { q: "diamond ring", pick: [0] } }),
    p({ title: "Firoza Cluster Ring", category: "rings", price: 5490, options: [RING], short: "A flower of hand-cut turquoise stones set in sterling silver.", description: desc("Twelve small turquoise petals around a round centre, each in its own silver bezel. Bold, bright and made to be noticed.", ["925 sterling silver", "Stabilised turquoise", "Each stone bezel-set by hand"]), specs: [["Metal", "925 sterling silver"], ["Stones", "Stabilised turquoise"], ["Face", "Ø 26 mm"], ["Weight", "9.8 g"]], tags: ["gemstone", "silver"], collections: ["bestsellers"], weightGrams: 30, img: { q: "silver ring", pick: [14] } }),
    p({ title: "Jaali Gold Bangles (Pair)", category: "bangles", price: 189000, short: "A pair of 22K gold bangles with a pierced jaali pattern.", description: desc("Light catches every opening of the hand-pierced jaali pattern. Made to order in your size and sold as a pair.", ["BIS hallmarked 22K gold", "Hand-pierced jaali work", "Made to order in 12–15 days"]), specs: [["Metal", "22K yellow gold (916)"], ["Weight", "19.6 g (pair, size 2.4)"], ["Width", "8 mm"], ["Hallmark", "BIS with HUID"], ["Sizes", "2.2, 2.4, 2.6, 2.8"]], options: [["Bangle size", ["2.2", "2.4", "2.6", "2.8"]]], care: GOLD_CARE, tags: ["bangle", "gold"], collections: ["bridal"], featured: true, weightGrams: 120, img: { q: "bangles", pick: [4] } }),
    p({ title: "Slim Stacking Bangles (Set of 4)", category: "bangles", price: 2890, mrp: 3390, short: "Four fine gold-plated bangles, one finished with an arrow.", description: desc("Thin enough to wear all four with a watch. Mix the plain, twisted, beaded and arrow bangles however you like.", ["Gold-plated brass", "Four textures", "Anti-tarnish coating"]), specs: [["Metal", "Brass"], ["Plating", "18K gold, anti-tarnish"], ["Width", "1.5–2 mm"], ["Sizes", "2.4, 2.6"]], options: [["Bangle size", ["2.4", "2.6"]]], hsn: "7117", care: PLATED_CARE, tags: ["bangle", "under-5000"], collections: ["everyday"], weightGrams: 60, img: { q: "bangles", pick: [10] } }),
    p({ title: "Mesha Ram-Head Silver Cuff", category: "bangles", price: 8900, short: "An open cuff ending in two hand-carved ram heads.", description: desc("A heavy, open cuff in oxidised silver with ram-head finials carved by hand, a motif found in old tribal jewellery across India.", ["Oxidised 925 silver", "Open cuff, gently adjustable", "Hand-carved finials"]), specs: [["Metal", "925 sterling silver, oxidised"], ["Weight", "42 g"], ["Inner diameter", "6 cm (adjustable)"], ["Finish", "Oxidised"]], tags: ["cuff", "silver", "oxidised"], collections: ["heritage", "bestsellers"], weightGrams: 120, img: { q: "silver bracelet", pick: [3] } }),
    p({ title: "Twisted Silver Kada", category: "bangles", price: 6290, short: "A rope-twisted sterling silver kada with a slim opening.", description: desc("Two strands of silver wire, twisted by hand and closed into a kada. Wears well alone or between gold bangles.", ["925 sterling silver", "Hand-twisted rope pattern", "Slim opening for easy wear"]), specs: [["Metal", "925 sterling silver"], ["Weight", "28 g"], ["Thickness", "5 mm"], ["Sizes", "2.4, 2.6, 2.8"]], options: [["Bangle size", ["2.4", "2.6", "2.8"]]], tags: ["kada", "silver"], collections: ["everyday"], weightGrams: 90, img: { q: "silver bracelet", pick: [12] } }),
    p({ title: "Bichiya Silver Toe Rings (Pair)", category: "rings", price: 1290, mrp: 1490, short: "A pair of adjustable sterling silver toe rings.", description: desc("Traditional bichiya, worn on the second toe. Open at the back so they adjust to fit and are easy to put on.", ["925 sterling silver", "Adjustable open back", "Sold as a pair"]), specs: [["Metal", "925 sterling silver"], ["Weight", "3.6 g (pair)"], ["Fit", "Adjustable"]], tags: ["toe-ring", "silver", "under-5000"], collections: ["bridal"], weightGrams: 30, img: { q: "silver jewelry", pick: [12] } }),
    p({ title: "Seep Mother-of-Pearl Jewellery Box", category: "boxes", type: "other", price: 4490, short: "A footed box inlaid with mother-of-pearl, lined in velvet.", description: desc("Inlaid by hand in Udaipur: hundreds of small pieces of mother-of-pearl set into a wooden box in a floral pattern, on four turned feet.", ["Mother-of-pearl inlay on wood", "Velvet-lined with ring rolls", "Gift-wrapped free"]), specs: [["Material", "Wood, mother-of-pearl inlay"], ["Size", "20 × 14 × 9 cm"], ["Lining", "Velvet with ring rolls"], ["Made in", "Udaipur, India"]], hsn: "4420", care: "Wipe with a dry cloth. Keep away from water and direct sunlight.", tags: ["box", "under-5000"], collections: [], weightGrams: 900, img: { q: "jewelry box", pick: [3] } }),
    p({ title: "Chhaya Gilt Jewellery Casket", category: "boxes", type: "other", price: 3290, mrp: 3790, short: "A gilt-footed casket with green stone-finish panels and a mirror inside.", description: desc("A small casket with pale green stone-finish panels, gilt handles and feet and a mirror inside the lid. Perfect for rings and earrings on a dressing table.", ["Stone-finish panels, gilt metal frame", "Mirror inside the lid", "Satin lining"]), specs: [["Material", "Gilt metal, resin stone-finish panels, satin"], ["Size", "12 × 8 × 8 cm"], ["Finish", "Gilt"]], hsn: "8306", care: "Wipe with a soft dry cloth.", tags: ["box", "under-5000"], collections: [], weightGrams: 500, img: { q: "jewelry box", pick: [4] } }),
  ],
};

export default spec;
