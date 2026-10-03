import type { ShowcaseSpec, ShowProduct } from "../types";

const FSSAI = ["FSSAI licence", "Shown on pack"] as [string, string];
const item = (x: Omit<ShowProduct, "hsn" | "weightGrams"> & { hsn?: string; weightGrams?: number }): ShowProduct => ({ hsn: "0709", weightGrams: 1000, ...x });
const desc = (intro: string, points: string[]) => `${intro}\n\n## Good to know\n${points.map((t) => `- ${t}`).join("\n")}`;
const FRESH_CARE = "Store in a cool, dry place or the vegetable crisper. Wash just before use.";

const spec: ShowcaseSpec = {
  slug: "harvest-basket",
  name: "Harvest Basket",
  industry: "grocery",
  owner: "Anjali Reddy",
  theme: "fresh-market",
  tagline: "Farm-fresh groceries, delivered the same day",
  story: [
    "Harvest Basket is a neighbourhood grocer in Hyderabad that buys fruit and vegetables directly from 60 farmer groups around Telangana, and staples from small mills and co-operatives we've visited ourselves.",
    "Produce is picked the evening before and delivered the next morning, so it lasts longer in your kitchen. Everything else is chosen for honest quality at a fair price.",
  ],
  email: "orders@harvestbasket.test",
  phone: "+91 40 4852 7710",
  address: { line1: "Plot 22, Road No. 10, Banjara Hills", city: "Hyderabad", state: "Telangana", postal_code: "500034" },
  legalName: "Harvest Basket Foods Private Limited",
  seo: { title: "Harvest Basket — Fresh fruit, vegetables & staples delivered", description: "Farm-fresh fruit and vegetables, dairy, staples, tea and snacks. Same-day delivery in Hyderabad, free above ₹499." },
  announcement: ["Same-day delivery on orders before 12 noon", "Free delivery above ₹499", "Picked last evening, at your door this morning"],
  categories: [
    { slug: "fruits-vegetables", name: "Fruits & Vegetables", description: "Picked the evening before delivery." },
    { slug: "dairy-bakery", name: "Dairy, Eggs & Bakery", description: "Milk, eggs, cheese and fresh bread." },
    { slug: "staples", name: "Staples", description: "Rice, atta, pasta, spices and honey." },
    { slug: "beverages", name: "Tea, Coffee & Juice", description: "Estate teas, filter coffee and cold-pressed juice." },
    { slug: "snacks", name: "Snacks", description: "Nuts, cookies and chocolate." },
  ],
  collections: [
    { slug: "bestsellers", title: "Best sellers", description: "What our regulars order every week." },
    { slug: "weekly-essentials", title: "Weekly essentials", description: "Everything for a week of home cooking." },
    { slug: "breakfast", title: "Breakfast table", description: "Bread, eggs, honey, tea and coffee." },
    { slug: "healthy-snacking", title: "Healthy snacking", description: "Nuts, fruit and better-for-you treats.", tag: "healthy" },
  ],
  menu: [
    { title: "Fruits & Vegetables", to: "/categories/fruits-vegetables" },
    { title: "Dairy & Bakery", to: "/categories/dairy-bakery" },
    { title: "Staples", to: "/categories/staples" },
    { title: "Beverages", to: "/categories/beverages" },
    { title: "Snacks", to: "/categories/snacks" },
    { title: "Offers", to: "/collections/weekly-essentials" },
  ],
  faqs: [
    ["When will my order arrive?", "Orders placed before 12 noon arrive the same evening; later orders arrive the next morning between 7 and 10 am."],
    ["Where do you deliver?", "Across Hyderabad and Secunderabad. Enter your PIN code at checkout to confirm."],
    ["What if something isn't fresh?", "Tell us within 24 hours with a photo and we'll refund or replace it — no need to return fresh produce."],
    ["Why do fruit and vegetable weights vary slightly?", "Produce is weighed by hand. You're charged for the listed weight; we always round up, never down."],
    ["Is there a minimum order?", "No. Delivery is free above ₹499 and ₹30 below that."],
    ["Do you use plastic bags?", "Produce comes in paper bags and a reusable cloth tote. Give the tote back with your next order and we'll reuse it."],
  ],
  shippingNote: "Same-day delivery in Hyderabad for orders before 12 noon. Free above ₹499; ₹30 below that.",
  returnsNote: "If anything is damaged or not fresh, tell us within 24 hours with a photo for an instant refund or replacement. Packaged goods can be returned unopened within 7 days.",
  images: {
    hero: { q: "vegetables", pick: [0] },
    hero2: { q: "fruits", pick: [7] },
    story: { q: "farmers market", pick: [3] },
    feature: { q: "herbs", pick: [7] },
    "promo-a": { q: "bread", pick: [0] },
    "promo-b": { q: "coffee", pick: [1] },
  },
  slots: {
    hero: [
      "Hero",
      {
        slides: [
          { imagePath: "$img:hero", alt: "Fresh vegetables", eyebrow: "Picked last evening", heading: "Fresh from the farm, at your door this morning", subheading: "Vegetables and fruit from 60 farmer groups around Telangana.", ctaLabel: "Shop fresh", ctaHref: "/categories/fruits-vegetables" },
          { imagePath: "$img:hero2", alt: "Fresh fruit", eyebrow: "Seasonal fruit", heading: "Sweet, ripe and in season", subheading: "Bananas, apples and citrus, chosen by hand.", ctaLabel: "Shop fruit", ctaHref: "/categories/fruits-vegetables" },
        ],
      },
    ],
    categories: ["CategoryGrid", { heading: "Shop by aisle", mode: "manual", items: ["fruits-vegetables", "dairy-bakery", "staples", "beverages", "snacks"].map((c) => ({ id: `$category:${c}`, imagePath: `$catimg:${c}`, label: "" })) }],
    collections: ["CollectionGrid", { heading: "Shop by need", mode: "manual", items: ["weekly-essentials", "breakfast", "healthy-snacking"].map((c) => ({ id: `$collection:${c}`, imagePath: `$colimg:${c}`, label: "" })) }],
    fresh: ["ProductCarousel", { eyebrow: "Fresh today", heading: "Fruits & vegetables", source: "category", categoryId: "$category:fruits-vegetables", viewAllHref: "/categories/fruits-vegetables" }],
    essentials: ["ProductGrid", { heading: "Kitchen staples", subheading: "Rice, atta, spices and more.", source: "category", categoryId: "$category:staples", viewAllHref: "/categories/staples" }],
    snacks: ["ProductCarousel", { heading: "Snacks & treats", source: "category", categoryId: "$category:snacks", viewAllHref: "/categories/snacks" }],
    beverages: ["ProductGrid", { heading: "Tea, coffee & juice", source: "category", categoryId: "$category:beverages", viewAllHref: "/categories/beverages" }],
    bestsellers: ["ProductGrid", { heading: "Best sellers", source: "collection", collectionId: "$collection:bestsellers", viewAllHref: "/collections/bestsellers" }],
    new: ["ProductCarousel", { eyebrow: "Just in", heading: "New on the shelf", source: "newest", viewAllHref: "/collections" }],
    offers: ["ProductGrid", { eyebrow: "Save more", heading: "Today's offers", source: "sale", viewAllHref: "/collections/weekly-essentials" }],
    story: [
      "BrandStory",
      { eyebrow: "Where it comes from", heading: "We know our farmers by name", body: "We buy directly from 60 farmer groups within 150 km of Hyderabad, pay on delivery, and pick up the evening before your order. Shorter journeys mean fresher food and a fairer price for the people who grow it.", imagePath: "$img:story", alt: "Fresh produce at a market", stats: [{ value: "60", label: "Farmer groups" }, { value: "12 h", label: "Farm to door" }, { value: "0", label: "Cold-storage middlemen" }], ctaLabel: "Our story", ctaHref: "/pages/about" },
    ],
    feature: [
      "EditorialImageText",
      { imagePath: "$img:feature", alt: "Fresh herbs", eyebrow: "Kitchen notes", heading: "Keep greens fresh for a week", body: "Wrap herbs and leafy greens loosely in a damp cloth, keep them in the crisper, and wash only before cooking. Tomatoes and bananas stay out of the fridge.", ctaLabel: "Shop vegetables", ctaHref: "/categories/fruits-vegetables" },
    ],
    promo: [
      "PromoBanner",
      {
        tiles: [
          { imagePath: "$img:promo-a", alt: "Fresh bread", heading: "Baked this morning", text: "Sourdough and whole-wheat loaves.", ctaLabel: "Shop bakery", ctaHref: "/categories/dairy-bakery" },
          { imagePath: "$img:promo-b", alt: "Coffee", heading: "Filter coffee, freshly ground", text: "From estates in Chikmagalur.", ctaLabel: "Shop beverages", ctaHref: "/categories/beverages" },
        ],
      },
    ],
    sale: ["SaleBanner", { eyebrow: "This week", heading: "Save up to 20% on staples", subheading: "Rice, atta and more — prices already reduced.", ctaLabel: "Shop staples", ctaHref: "/categories/staples", background: "#1e5631", textColor: "#fdfaf2" }],
    trust: ["TrustBadges", { items: [{ icon: "leaf", title: "Farm fresh", text: "Picked the evening before" }, { icon: "truck", title: "Same-day delivery", text: "Order before 12 noon" }, { icon: "return", title: "Freshness promise", text: "Refund within 24 hours" }, { icon: "cod", title: "Pay on delivery", text: "Cash or UPI at your door" }] }],
    faq: ["FAQ", { heading: "Delivery & freshness", source: "store", limit: 6 }],
    newsletter: ["Newsletter", { heading: "What's in season", subheading: "A short weekly note on the best produce and offers.", buttonLabel: "Subscribe" }],
    marquee: ["Marquee", { items: [{ text: "Same-day delivery" }, { text: "Free above ₹499" }, { text: "Farm fresh" }, { text: "Pay on delivery" }] }],
  },
  products: [
    item({ title: "Desi Tomatoes", category: "fruits-vegetables", price: 49, mrp: 60, options: [["Weight", ["500 g", "1 kg"]]], short: "Tangy country tomatoes, ideal for rasam, chutney and curries.", description: desc("Firm, juicy country tomatoes from farms near Chevella, picked just ripe.", ["Store at room temperature, not in the fridge", "Best used within 4–5 days"]), specs: [["Origin", "Chevella, Telangana"], ["Pack", "500 g / 1 kg"], ["Shelf life", "4–5 days at room temperature"]], care: FRESH_CARE, tags: ["vegetables", "healthy"], collections: ["bestsellers", "weekly-essentials"], featured: true, img: { q: "tomatoes", pick: [0, 7] } }),
    item({ title: "Red Onions", category: "fruits-vegetables", price: 39, options: [["Weight", ["1 kg", "2 kg"]]], short: "Medium red onions from Nashik, dry-cured to keep for weeks.", description: desc("A kitchen essential: sharp, sweet when cooked and cured to last.", ["Keep in a basket in a cool, airy spot", "Keeps 3–4 weeks"]), specs: [["Origin", "Nashik, Maharashtra"], ["Pack", "1 kg / 2 kg"], ["Shelf life", "3–4 weeks"]], care: FRESH_CARE, tags: ["vegetables"], collections: ["weekly-essentials", "bestsellers"], img: { q: "onions", pick: [5] } }),
    item({ title: "Potatoes", category: "fruits-vegetables", price: 35, options: [["Weight", ["1 kg", "2 kg"]]], short: "All-purpose potatoes for fries, curries and aloo paratha.", description: desc("Clean, medium-sized potatoes with a floury texture that suits most Indian cooking.", ["Store in a dark, cool place", "Keeps 2–3 weeks"]), specs: [["Origin", "Agra, Uttar Pradesh"], ["Pack", "1 kg / 2 kg"], ["Shelf life", "2–3 weeks"]], care: FRESH_CARE, tags: ["vegetables"], collections: ["weekly-essentials"], img: { q: "potatoes", pick: [1] } }),
    item({ title: "Robusta Bananas (1 dozen)", category: "fruits-vegetables", price: 60, short: "Sweet, naturally ripened bananas. No carbide.", description: desc("Ripened naturally in ventilated chambers, never with calcium carbide.", ["Delivered just ripe, ready in 1–2 days", "Hang or keep in a bowl, not the fridge"]), specs: [["Origin", "Anantapur, Andhra Pradesh"], ["Pack", "12 pieces"], ["Ripening", "Natural, no carbide"]], care: FRESH_CARE, hsn: "0803", tags: ["fruit", "healthy"], collections: ["bestsellers", "breakfast", "healthy-snacking"], featured: true, weightGrams: 1500, img: { q: "bananas", pick: [0] } }),
    item({ title: "Shimla Apples", category: "fruits-vegetables", price: 180, mrp: 220, options: [["Weight", ["500 g", "1 kg"]]], short: "Crisp, juicy apples from orchards in Himachal Pradesh.", description: desc("Royal Delicious apples from Kotgarh, crisp and sweet with a little tartness.", ["Keep in the fridge for up to 3 weeks", "Wash before eating"]), specs: [["Variety", "Royal Delicious"], ["Origin", "Kotgarh, Himachal Pradesh"], ["Pack", "500 g / 1 kg"]], care: FRESH_CARE, hsn: "0808", tags: ["fruit", "healthy"], collections: ["healthy-snacking"], img: { q: "apples", pick: [7, 4] } }),
    item({ title: "Lemons", category: "fruits-vegetables", price: 40, short: "Thin-skinned, juicy lemons. About 8–10 per pack.", description: desc("Juicy lemons for nimbu pani, rice and pickles.", ["Roll on the counter before squeezing for more juice", "Keeps a week in the fridge"]), specs: [["Pack", "250 g (8–10 lemons)"], ["Origin", "Nalgonda, Telangana"]], care: FRESH_CARE, hsn: "0805", tags: ["fruit"], weightGrams: 300, img: { q: "lemons", pick: [0, 2] } }),
    item({ title: "Garlic", category: "fruits-vegetables", price: 60, short: "Plump, aromatic garlic bulbs from Madhya Pradesh.", description: desc("Large, firm bulbs that are easy to peel.", ["Store in a dry, airy place", "Keeps 3–4 weeks"]), specs: [["Pack", "250 g"], ["Origin", "Mandsaur, Madhya Pradesh"]], care: FRESH_CARE, tags: ["vegetables"], collections: ["weekly-essentials"], weightGrams: 300, img: { q: "garlic", pick: [0, 2] } }),
    item({ title: "Farm Eggs (Pack of 12)", category: "dairy-bakery", price: 120, short: "Brown eggs from free-range hens near Shamshabad.", description: desc("Laid by hens that spend their days outdoors, collected and delivered within two days.", ["Refrigerate on arrival", "Best before 14 days from packing"]), specs: [["Pack", "12 eggs"], ["Farming", "Free-range"], ["Best before", "14 days from packing"], FSSAI], care: "Refrigerate at 4–8 °C.", hsn: "0407", tags: ["eggs"], collections: ["bestsellers", "breakfast", "weekly-essentials"], featured: true, weightGrams: 800, img: { q: "eggs", pick: [2, 4] } }),
    item({ title: "A2 Cow Milk, 1 L", category: "dairy-bakery", price: 90, short: "Fresh A2 milk from Gir cows, in a returnable glass bottle.", description: desc("Pasteurised, never homogenised, delivered chilled in a glass bottle you can return.", ["Keep refrigerated, use within 3 days", "Return the bottle with your next order"]), specs: [["Volume", "1 litre"], ["Source", "Gir cows, Medak district"], ["Packaging", "Returnable glass bottle"], FSSAI], care: "Refrigerate at 4 °C. Boil before use.", hsn: "0401", tags: ["milk"], collections: ["breakfast"], weightGrams: 1600, img: { q: "milk", pick: [0] } }),
    item({ title: "Farmhouse Cheddar, 200 g", category: "dairy-bakery", price: 349, short: "A mature cheddar made by a small creamery in the Nilgiris.", description: desc("Aged for six months for a sharp, nutty flavour. Great in sandwiches or on a cheese board.", ["Keep refrigerated", "Use within 10 days of opening"]), specs: [["Weight", "200 g"], ["Aged", "6 months"], ["Made in", "Kotagiri, Tamil Nadu"], FSSAI], care: "Refrigerate. Wrap cut cheese in paper.", hsn: "0406", tags: ["cheese"], weightGrams: 250, img: { q: "cheese", pick: [6, 1] } }),
    item({ title: "Sourdough Loaf", category: "dairy-bakery", price: 180, short: "A slow-fermented sourdough loaf, baked this morning.", description: desc("Naturally leavened over 24 hours with no commercial yeast, for a chewy crumb and crackly crust.", ["Baked fresh every morning", "Keeps 3 days in a cloth bag; freeze sliced"]), specs: [["Weight", "450 g"], ["Flour", "Wheat and whole wheat"], ["Leavening", "Natural sourdough"], FSSAI], care: "Keep in a cloth bag at room temperature.", hsn: "1905", tags: ["bread"], collections: ["breakfast", "bestsellers"], weightGrams: 500, img: { q: "bread", pick: [7, 6] } }),
    item({ title: "Aged Basmati Rice, 5 kg", category: "staples", price: 649, mrp: 799, short: "Long-grain basmati, aged 12 months for fluffy, separate grains.", description: desc("Grown in the foothills of the Himalayas and aged for a year, so grains lengthen and stay separate on cooking.", ["Soak 20 minutes before cooking", "Store in an airtight container"]), specs: [["Weight", "5 kg"], ["Aged", "12 months"], ["Grain", "Extra long"], FSSAI], care: "Store in a cool, dry place in an airtight container.", hsn: "1006", tags: ["rice"], collections: ["weekly-essentials", "bestsellers"], featured: true, weightGrams: 5100, img: { q: "rice", pick: [2, 3] } }),
    item({ title: "Chakki Atta, 5 kg", category: "staples", price: 299, mrp: 340, short: "Whole-wheat flour, stone-ground in small batches.", description: desc("Sharbati wheat from Madhya Pradesh, ground slowly on a stone chakki for soft rotis.", ["100% whole wheat, nothing added", "Use within 3 months"]), specs: [["Weight", "5 kg"], ["Wheat", "Sharbati, Madhya Pradesh"], ["Milling", "Stone-ground"], FSSAI], care: "Store in a cool, dry place.", hsn: "1101", tags: ["flour"], collections: ["weekly-essentials"], weightGrams: 5100, img: { q: "flour", pick: [5] } }),
    item({ title: "Whole Spice Masala Box", category: "staples", price: 399, short: "Seven whole spices for everyday Indian cooking, in a steel dabba.", description: desc("Cumin, mustard, coriander seed, black pepper, cloves, cinnamon and dried red chillies, sourced from growers in Kerala and Rajasthan.", ["Seven spices, 50 g each", "Stainless steel masala dabba", "Refill packs available"]), specs: [["Contents", "7 spices × 50 g"], ["Container", "Stainless steel dabba"], FSSAI], care: "Keep the lid closed; store away from heat.", hsn: "0910", tags: ["spices"], collections: ["bestsellers"], weightGrams: 900, img: { q: "spices", pick: [7, 5] } }),
    item({ title: "Wildflower Honey, 500 g", category: "staples", price: 349, short: "Raw, unprocessed honey from the forests of the Western Ghats.", description: desc("Collected by tribal co-operatives, filtered through cloth and never heated.", ["Raw and unpasteurised", "May crystallise naturally in winter"]), specs: [["Weight", "500 g"], ["Source", "Western Ghats forests"], ["Processing", "Raw, cloth-filtered"], FSSAI], care: "Store at room temperature. Crystallisation is natural; warm gently to liquefy.", hsn: "0409", tags: ["honey", "healthy"], collections: ["breakfast", "healthy-snacking"], weightGrams: 650, img: { q: "honey", pick: [0, 1] } }),
    item({ title: "Whole Wheat Fusilli, 500 g", category: "staples", price: 119, short: "Bronze-cut whole-wheat fusilli that holds sauce well.", description: desc("Made from whole durum wheat, bronze-cut for a rough texture that sauce clings to, and dried slowly.", ["Cooks in 10 minutes", "Store in a dry place"]), specs: [["Weight", "500 g"], ["Wheat", "Whole durum wheat"], ["Cooking time", "10 minutes"], FSSAI], care: "Store in a cool, dry place.", hsn: "1902", tags: ["pasta"], weightGrams: 550, img: { q: "pasta", pick: [7] } }),
    item({ title: "Assam Orthodox Tea, 250 g", category: "beverages", price: 280, short: "Malty, full-bodied whole-leaf tea from a single estate.", description: desc("Second-flush orthodox leaf from an estate near Dibrugarh. Brews a bright, malty cup that takes milk well.", ["Whole-leaf orthodox tea", "Great for masala chai"]), specs: [["Weight", "250 g"], ["Origin", "Dibrugarh, Assam"], ["Flush", "Second flush"], FSSAI], care: "Store in an airtight container away from strong smells.", hsn: "0902", tags: ["tea"], collections: ["breakfast", "bestsellers"], weightGrams: 300, img: { q: "tea", pick: [3, 7] } }),
    item({ title: "Chikmagalur Filter Coffee, 250 g", category: "beverages", price: 320, options: [["Grind", ["Whole beans", "Filter grind"]]], short: "Medium-roast arabica and robusta with 20% chicory, for South Indian filter coffee.", description: desc("Roasted weekly in small batches from beans grown in Chikmagalur. Strong, smooth and chocolaty with milk.", ["80:20 coffee to chicory", "Roasted within the last 7 days"]), specs: [["Weight", "250 g"], ["Blend", "Arabica and robusta, 20% chicory"], ["Roast", "Medium"], FSSAI], care: "Store in an airtight container; use within 4 weeks of opening.", hsn: "0901", tags: ["coffee"], collections: ["breakfast"], weightGrams: 300, img: { q: "coffee beans", pick: [7, 5] } }),
    item({ title: "Cold-Pressed Orange Juice, 1 L", category: "beverages", price: 199, short: "Nagpur oranges, cold-pressed. Nothing added.", description: desc("Pressed the morning of delivery from Nagpur oranges. No sugar, water or preservatives.", ["Keep chilled, drink within 3 days", "Shake before serving"]), specs: [["Volume", "1 litre"], ["Ingredients", "100% orange juice"], ["Shelf life", "3 days refrigerated"], FSSAI], care: "Refrigerate at 4 °C.", hsn: "2009", tags: ["juice", "healthy"], collections: ["healthy-snacking"], weightGrams: 1200, img: { q: "juice", pick: [3] } }),
    item({ title: "Roasted Salted Pistachios, 250 g", category: "snacks", price: 399, mrp: 469, short: "Crunchy in-shell pistachios, dry-roasted with a pinch of sea salt.", description: desc("Large, naturally opened pistachios, slow dry-roasted and lightly salted. A good-for-you snack for work or travel.", ["Dry-roasted, no oil", "Resealable pouch"]), specs: [["Weight", "250 g"], ["Roast", "Dry-roasted, lightly salted"], FSSAI], care: "Store in an airtight container in a cool place.", hsn: "0802", tags: ["nuts", "healthy"], collections: ["healthy-snacking", "bestsellers"], weightGrams: 300, img: { q: "nuts", pick: [0] } }),
    item({ title: "Oat & Jaggery Cookies, 200 g", category: "snacks", price: 149, short: "Crunchy oat cookies sweetened with jaggery, baked in Hyderabad.", description: desc("Made with rolled oats, whole-wheat flour and organic jaggery. No refined sugar, no palm oil.", ["No refined sugar", "Baked in small batches"]), specs: [["Weight", "200 g"], ["Sweetener", "Jaggery"], ["Contains", "Gluten, dairy"], FSSAI], care: "Store in an airtight container.", hsn: "1905", tags: ["cookies", "healthy"], collections: ["healthy-snacking"], weightGrams: 250, img: { q: "cookies", pick: [6, 4] } }),
    item({ title: "70% Dark Chocolate, 100 g", category: "snacks", price: 199, short: "Bean-to-bar dark chocolate made with cacao from Kerala.", description: desc("Single-origin cacao from Idukki, roasted and ground in small batches for a fruity, rich bar.", ["70% cacao", "Made in India, bean to bar"]), specs: [["Weight", "100 g"], ["Cacao", "70%, Idukki, Kerala"], FSSAI], care: "Store below 25 °C, away from sunlight.", hsn: "1806", tags: ["chocolate"], weightGrams: 150, img: { q: "chocolate", pick: [2, 7] } }),
  ],
};

export default spec;
