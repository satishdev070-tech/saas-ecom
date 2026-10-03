import type { CreativeTemplate, TemplateField } from "./engine";

/**
 * Built-in template library (version 1). Seeded into creative_templates by migration
 * 20260927001600; the platform can add new versions there. Original layouts, no third-party art.
 */
const F = {
  headline: (placeholder: string, max = 48): TemplateField => ({ key: "headline", label: "Headline", max, placeholder, required: true }),
  sub: (placeholder: string, max = 90): TemplateField => ({ key: "subheadline", label: "Supporting line", max, placeholder }),
  price: { key: "price", label: "Price", max: 16, placeholder: "₹2,490" } as TemplateField,
  compareAt: { key: "compareAt", label: "Original price", max: 16, placeholder: "₹3,290" } as TemplateField,
  discount: (placeholder = "30% OFF"): TemplateField => ({ key: "discount", label: "Offer", max: 16, placeholder }),
  cta: (placeholder = "Shop now"): TemplateField => ({ key: "cta", label: "Button text", max: 22, placeholder }),
  date: (placeholder: string): TemplateField => ({ key: "date", label: "Date / timing", max: 40, placeholder }),
  image: { key: "image", label: "Product image", max: 300, placeholder: "" } as TemplateField,
};

export const BUILTIN_TEMPLATES: CreativeTemplate[] = [
  {
    key: "new-arrival-split", version: 1, name: "New arrival — split", category: "new_arrival", width: 1080, height: 1080,
    spec: {
      fields: [F.image, F.headline("Just landed"), F.sub("Hand block-printed cotton kurta sets"), F.price, F.cta()],
      layers: [
        { type: "image", x: 0, y: 0, w: 600, h: 1080 },
        { type: "logo", x: 660, y: 70, w: 360, h: 60, color: "primary" },
        { type: "text", x: 660, y: 300, w: 360, text: "NEW ARRIVAL", size: 26, font: "body", weight: 700, color: "accent", tracking: 4 },
        { type: "text", x: 660, y: 350, w: 370, field: "headline", size: 76, font: "heading", weight: 600, color: "text", maxLines: 3, lineHeight: 1.05 },
        { type: "text", x: 660, y: 640, w: 360, field: "subheadline", size: 30, font: "body", color: "text", maxLines: 3, lineHeight: 1.3 },
        { type: "text", x: 660, y: 810, w: 360, field: "price", size: 44, font: "body", weight: 700, color: "primary" },
        { type: "badge", x: 660, y: 900, w: 280, h: 76, field: "cta", fill: "primary", color: "white", size: 26, radius: 6 },
      ],
    },
  },
  {
    key: "sale-bold", version: 1, name: "Sale — bold", category: "sale", width: 1080, height: 1080,
    spec: {
      fields: [F.image, F.discount("UP TO 50% OFF"), F.headline("End of season sale", 36), F.date("Ends Sunday midnight"), F.cta("Shop the sale")],
      layers: [
        { type: "image", x: 0, y: 0, w: 1080, h: 1080 },
        { type: "rect", x: 0, y: 560, w: 1080, h: 520, fill: "sale", opacity: 0.94 },
        { type: "text", x: 60, y: 600, w: 960, field: "discount", size: 120, font: "heading", weight: 800, color: "white", align: "middle", uppercase: true },
        { type: "text", x: 60, y: 760, w: 960, field: "headline", size: 48, font: "body", weight: 600, color: "white", align: "middle", maxLines: 1 },
        { type: "text", x: 60, y: 840, w: 960, field: "date", size: 30, font: "body", color: "white", align: "middle" },
        { type: "badge", x: 390, y: 930, w: 300, h: 76, field: "cta", fill: "white", color: "sale", size: 26 },
        { type: "logo", x: 40, y: 40, w: 300, h: 60, color: "white" },
      ],
    },
  },
  {
    key: "festival-frame", version: 1, name: "Festival — framed", category: "festival", width: 1080, height: 1350,
    spec: {
      fields: [F.image, F.headline("Diwali edit is here", 40), F.sub("Festive silks and brocades for the season of light"), F.discount("Flat 20% off"), F.cta("Explore")],
      layers: [
        { type: "rect", x: 0, y: 0, w: 1080, h: 1350, fill: "primary" },
        { type: "rect", x: 36, y: 36, w: 1008, h: 1278, fill: "accent", radius: 4, opacity: 0.35 },
        { type: "rect", x: 52, y: 52, w: 976, h: 1246, fill: "primary", radius: 2 },
        { type: "image", x: 110, y: 170, w: 860, h: 700, radius: 430 },
        { type: "logo", x: 110, y: 80, w: 860, h: 60, color: "white", align: "middle" },
        { type: "text", x: 110, y: 910, w: 860, field: "headline", size: 72, font: "heading", weight: 600, color: "white", align: "middle", maxLines: 2, lineHeight: 1.05 },
        { type: "text", x: 150, y: 1080, w: 780, field: "subheadline", size: 30, font: "body", color: "white", align: "middle", maxLines: 2, lineHeight: 1.3 },
        { type: "badge", x: 390, y: 1190, w: 300, h: 70, field: "discount", fill: "accent", color: "white", size: 26 },
      ],
    },
  },
  {
    key: "product-highlight-card", version: 1, name: "Product highlight", category: "product_highlight", width: 1080, height: 1080,
    spec: {
      fields: [F.image, F.headline("The Indigo Anarkali", 40), F.sub("Hand-dyed in Bagru. 100% cotton."), F.price, F.compareAt],
      layers: [
        { type: "rect", x: 0, y: 0, w: 1080, h: 1080, fill: "background" },
        { type: "image", x: 90, y: 90, w: 900, h: 680, radius: 24 },
        { type: "text", x: 90, y: 810, w: 640, field: "headline", size: 56, font: "heading", weight: 600, color: "text", maxLines: 1 },
        { type: "text", x: 90, y: 890, w: 640, field: "subheadline", size: 28, font: "body", color: "text", maxLines: 2, lineHeight: 1.3 },
        { type: "text", x: 740, y: 815, w: 250, field: "price", size: 52, font: "body", weight: 700, color: "primary", align: "end" },
        { type: "text", x: 740, y: 885, w: 250, field: "compareAt", size: 30, font: "body", color: "text", align: "end", strike: true },
        { type: "logo", x: 90, y: 990, w: 400, h: 50, color: "primary" },
      ],
    },
  },
  {
    key: "collection-launch-editorial", version: 1, name: "Collection launch", category: "collection_launch", width: 1080, height: 1350,
    spec: {
      fields: [F.image, F.headline("Monsoon Stories", 32), F.sub("A new collection in hand-woven chanderi"), F.date("Launching 5 Oct, 7 pm"), F.cta("Get notified")],
      layers: [
        { type: "image", x: 0, y: 0, w: 1080, h: 1350 },
        { type: "rect", x: 0, y: 0, w: 1080, h: 1350, fill: "black", opacity: 0.28 },
        { type: "logo", x: 60, y: 60, w: 960, h: 60, color: "white", align: "middle" },
        { type: "text", x: 60, y: 820, w: 960, text: "INTRODUCING", size: 28, font: "body", weight: 600, color: "white", align: "middle", tracking: 8 },
        { type: "text", x: 60, y: 870, w: 960, field: "headline", size: 104, font: "heading", weight: 500, color: "white", align: "middle", maxLines: 2, lineHeight: 1 },
        { type: "text", x: 120, y: 1100, w: 840, field: "subheadline", size: 32, font: "body", color: "white", align: "middle", maxLines: 2 },
        { type: "text", x: 120, y: 1200, w: 840, field: "date", size: 30, font: "body", weight: 700, color: "white", align: "middle" },
      ],
    },
  },
  {
    key: "bestseller-stamp", version: 1, name: "Bestseller", category: "bestseller", width: 1080, height: 1080,
    spec: {
      fields: [F.image, F.headline("Back in stock", 32), F.sub("Our most-loved kurta, in 6 new colours"), F.price, F.cta("Shop now")],
      layers: [
        { type: "image", x: 0, y: 0, w: 1080, h: 1080 },
        { type: "rect", x: 700, y: 60, w: 320, h: 320, fill: "accent", radius: 160 },
        { type: "text", x: 700, y: 170, w: 320, text: "BEST", size: 56, font: "heading", weight: 700, color: "white", align: "middle" },
        { type: "text", x: 700, y: 235, w: 320, text: "SELLER", size: 44, font: "heading", weight: 700, color: "white", align: "middle" },
        { type: "rect", x: 60, y: 780, w: 960, h: 240, fill: "background", radius: 16, opacity: 0.95 },
        { type: "text", x: 100, y: 810, w: 620, field: "headline", size: 54, font: "heading", weight: 600, color: "text", maxLines: 1 },
        { type: "text", x: 100, y: 890, w: 620, field: "subheadline", size: 28, font: "body", color: "text", maxLines: 2, lineHeight: 1.3 },
        { type: "text", x: 740, y: 830, w: 240, field: "price", size: 48, font: "body", weight: 700, color: "primary", align: "end" },
        { type: "badge", x: 760, y: 920, w: 220, h: 64, field: "cta", fill: "primary", color: "white", size: 22 },
      ],
    },
  },
  {
    key: "limited-edition-dark", version: 1, name: "Limited edition", category: "limited_edition", width: 1080, height: 1350,
    spec: {
      fields: [F.image, F.headline("Only 25 pieces", 30), F.sub("Hand-embroidered by a single artisan over 40 days"), F.price, F.cta("Reserve yours")],
      layers: [
        { type: "rect", x: 0, y: 0, w: 1080, h: 1350, fill: "black" },
        { type: "image", x: 140, y: 140, w: 800, h: 800, radius: 8 },
        { type: "text", x: 60, y: 60, w: 960, text: "LIMITED EDITION", size: 26, font: "body", weight: 700, color: "accent", align: "middle", tracking: 10 },
        { type: "text", x: 60, y: 990, w: 960, field: "headline", size: 80, font: "heading", weight: 500, color: "white", align: "middle", maxLines: 1 },
        { type: "text", x: 140, y: 1100, w: 800, field: "subheadline", size: 30, font: "body", color: "white", align: "middle", maxLines: 2, lineHeight: 1.3 },
        { type: "text", x: 60, y: 1225, w: 960, field: "price", size: 40, font: "body", weight: 700, color: "accent", align: "middle" },
        { type: "logo", x: 60, y: 1285, w: 960, h: 40, color: "white", align: "middle" },
      ],
    },
  },
  {
    key: "discount-code", version: 1, name: "Discount code", category: "discount", width: 1080, height: 1080,
    spec: {
      fields: [F.discount("Extra 15% off"), F.headline("Use code FESTIVE15", 30), F.sub("On orders above ₹1,999. Valid till 31 Oct."), F.cta("Shop now"), F.image],
      layers: [
        { type: "rect", x: 0, y: 0, w: 1080, h: 1080, fill: "accent" },
        { type: "image", x: 540, y: 0, w: 540, h: 1080 },
        { type: "rect", x: 0, y: 0, w: 620, h: 1080, fill: "accent" },
        { type: "logo", x: 70, y: 80, w: 480, h: 60, color: "white" },
        { type: "text", x: 70, y: 300, w: 500, field: "discount", size: 96, font: "heading", weight: 800, color: "white", maxLines: 2, lineHeight: 1 },
        { type: "rect", x: 70, y: 560, w: 480, h: 110, fill: "white", radius: 12 },
        { type: "text", x: 70, y: 590, w: 480, field: "headline", size: 38, font: "body", weight: 700, color: "text", align: "middle", maxLines: 1 },
        { type: "text", x: 70, y: 710, w: 480, field: "subheadline", size: 28, font: "body", color: "white", maxLines: 3, lineHeight: 1.3 },
        { type: "badge", x: 70, y: 900, w: 260, h: 70, field: "cta", fill: "primary", color: "white", size: 24 },
      ],
    },
  },
  {
    key: "announcement-minimal", version: 1, name: "Announcement", category: "announcement", width: 1080, height: 1080,
    spec: {
      fields: [F.headline("Free shipping across India", 60), F.sub("On every order, no minimum. Easy 7-day returns."), F.cta("Shop now")],
      layers: [
        { type: "rect", x: 0, y: 0, w: 1080, h: 1080, fill: "background" },
        { type: "rect", x: 80, y: 80, w: 920, h: 920, fill: "primary", radius: 0, opacity: 0.06 },
        { type: "logo", x: 80, y: 150, w: 920, h: 70, color: "primary", align: "middle" },
        { type: "text", x: 140, y: 380, w: 800, field: "headline", size: 84, font: "heading", weight: 600, color: "text", align: "middle", maxLines: 3, lineHeight: 1.05 },
        { type: "text", x: 180, y: 700, w: 720, field: "subheadline", size: 32, font: "body", color: "text", align: "middle", maxLines: 2, lineHeight: 1.35 },
        { type: "badge", x: 390, y: 850, w: 300, h: 76, field: "cta", fill: "primary", color: "white", size: 26 },
      ],
    },
  },
];
