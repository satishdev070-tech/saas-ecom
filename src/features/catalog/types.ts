import type { ProductStatus, ProductType } from "./constants";
import type { OptionDraft, VariantDraft } from "./variants";

/**
 * Editor model for a product (all form values as the person typed them). The editor posts
 * this as JSON; the server parses it with `productInputSchema`. `getProductForAdmin`
 * returns the same shape so the editor, duplicate action and CSV importer share it.
 */
export type ProductDraft = {
  id: string | null;
  expectedUpdatedAt: string | null;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  productType: ProductType;
  brand: string;
  categoryId: string | null;
  sizeChartId: string | null;
  status: ProductStatus;
  featured: boolean;
  tags: string[];
  attributes: { fabric: string; style: string; length: string; work: string; pattern: string; occasion: string[]; specs: { label: string; value: string }[] };
  careInstructions: string;
  shippingInfo: string;
  returnInfo: string;
  hsnCode: string;
  seoTitle: string;
  seoDescription: string;
  seoCanonical: string;
  seoNoindex: boolean;
  options: OptionDraft[];
  variants: VariantDraft[];
};

export type ProductMedia = {
  id: string;
  storagePath: string;
  url: string | null;
  altText: string;
  variantId: string | null;
  position: number;
};

export function emptyProductDraft(): ProductDraft {
  return {
    id: null,
    expectedUpdatedAt: null,
    title: "",
    slug: "",
    description: "",
    shortDescription: "",
    productType: "kurta",
    brand: "",
    categoryId: null,
    sizeChartId: null,
    status: "draft",
    featured: false,
    tags: [],
    attributes: { fabric: "", style: "", length: "", work: "", pattern: "", occasion: [], specs: [] },
    careInstructions: "",
    shippingInfo: "",
    returnInfo: "",
    hsnCode: "",
    seoTitle: "",
    seoDescription: "",
    seoCanonical: "",
    seoNoindex: false,
    options: [],
    variants: [
      {
        id: null,
        option1: null,
        option2: null,
        option3: null,
        sku: "",
        barcode: "",
        price: "",
        compareAtPrice: "",
        costPrice: "",
        weightGrams: "500",
        trackInventory: true,
        allowBackorder: false,
        lowStockThreshold: "",
        status: "active",
        initialStock: "",
      },
    ],
  };
}
