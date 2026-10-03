import { z } from "zod";
import { pincode, uuid } from "@/lib/validation/common";

export const addToCartSchema = z.object({
  variantId: uuid,
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  buyNow: z.enum(["1", "0", "true", "false"]).optional(),
});

export const updateItemSchema = z.object({ itemId: uuid, quantity: z.coerce.number().int().min(0).max(20) });
export const itemSchema = z.object({ itemId: uuid });
export const saveForLaterSchema = z.object({ itemId: uuid, saved: z.enum(["1", "0"]) });
export const couponSchema = z.object({ code: z.string().trim().min(1, "Enter a code").max(40) });
export const noteSchema = z.object({ note: z.string().trim().max(500, "Keep the note under 500 characters").optional() });
export const pincodeSchema = z.object({ pincode });
