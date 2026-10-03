import { describe, expect, it } from "vitest";
import { z } from "zod";
import { gstin, indianMobile, parseInput, pincode, slug } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";

describe("common validators", () => {
  it("normalises Indian mobiles to E.164", () => {
    expect(indianMobile.parse("98765 43210")).toBe("+919876543210");
    expect(indianMobile.parse("+91-98765-43210")).toBe("+919876543210");
    expect(indianMobile.parse("09876543210")).toBe("+919876543210");
    expect(indianMobile.safeParse("12345").success).toBe(false);
    expect(indianMobile.safeParse("5876543210").success).toBe(false);
  });

  it("validates PIN codes", () => {
    expect(pincode.safeParse("302001").success).toBe(true);
    expect(pincode.safeParse("002001").success).toBe(false);
    expect(pincode.safeParse("30200").success).toBe(false);
  });

  it("validates GSTIN structure", () => {
    expect(gstin.safeParse("08aabcu9603r1zm").success).toBe(true);
    expect(gstin.safeParse("08AABCU9603R1ZX1").success).toBe(false);
  });

  it("validates slugs", () => {
    expect(slug.parse("  Anarkali-Kurta-Sets ")).toBe("anarkali-kurta-sets");
    expect(slug.safeParse("bad--slug").success).toBe(false);
    expect(slug.safeParse("bad slug").success).toBe(false);
  });
});

describe("parseInput", () => {
  it("throws a VALIDATION AppError with field errors", () => {
    const schema = z.object({ name: z.string().min(1), price: z.number() });
    try {
      parseInput(schema, { name: "", price: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe("VALIDATION");
      expect(Object.keys(err.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "price"]));
    }
  });
});
