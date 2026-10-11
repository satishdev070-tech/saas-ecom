import { describe, expect, it } from "vitest";
import { adminCreateStoreSchema, adminSetPasswordSchema, loginAsStoreSchema } from "@/features/platform/schemas";

const base = { ownerEmail: "Owner@Shop.in", name: "Acme Store", slug: "acme-store" };

describe("super admin store schemas", () => {
  it("accepts an existing-owner store with defaults", () => {
    const r = adminCreateStoreSchema.parse({ ...base });
    expect(r).toMatchObject({ ownerMode: "existing", status: "trial", storeType: "real", launch: "draft", publishTheme: false, notifyOwner: false });
  });

  it("requires a name for a new owner, and a password or the welcome email", () => {
    const missing = adminCreateStoreSchema.safeParse({ ...base, ownerMode: "new" });
    expect(missing.success).toBe(false);
    const paths = missing.success ? [] : missing.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["ownerName", "ownerPassword"]));
    expect(adminCreateStoreSchema.safeParse({ ...base, ownerMode: "new", ownerName: "Asha", notifyOwner: "on" }).success).toBe(true);
    expect(adminCreateStoreSchema.safeParse({ ...base, ownerMode: "new", ownerName: "Asha", ownerPassword: "weakpass" }).success).toBe(false);
    expect(adminCreateStoreSchema.safeParse({ ...base, ownerMode: "new", ownerName: "Asha", ownerPassword: "Str0ngPassword" }).success).toBe(true);
  });

  it("rejects a password for an existing owner, bad slugs and trial days on active stores", () => {
    expect(adminCreateStoreSchema.safeParse({ ...base, ownerPassword: "Str0ngPassword" }).success).toBe(false);
    expect(adminCreateStoreSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
    expect(adminCreateStoreSchema.safeParse({ ...base, status: "active", trialDays: "30" }).success).toBe(false);
    expect(adminCreateStoreSchema.parse({ ...base, trialDays: "30" }).trialDays).toBe(30);
  });

  it("password set needs matching strong passwords and a reason", () => {
    const ids = { tenantId: "10000000-0000-4000-a000-000000000001", userId: "10000000-0000-4000-a000-000000000002" };
    expect(adminSetPasswordSchema.safeParse({ ...ids, password: "Str0ngPassword", confirm: "Str0ngPassword", reason: "Seller lost access to email" }).success).toBe(true);
    expect(adminSetPasswordSchema.safeParse({ ...ids, password: "Str0ngPassword", confirm: "different", reason: "Seller lost access to email" }).success).toBe(false);
    expect(adminSetPasswordSchema.safeParse({ ...ids, password: "Str0ngPassword", confirm: "Str0ngPassword", reason: "short" }).success).toBe(false);
  });

  it("sign-in as requires a reason; member is optional (owner by default)", () => {
    expect(loginAsStoreSchema.safeParse({ tenantId: "10000000-0000-4000-a000-000000000001", reason: "Ticket #42: fix theme" }).success).toBe(true);
    expect(loginAsStoreSchema.safeParse({ tenantId: "10000000-0000-4000-a000-000000000001", userId: "", reason: "Ticket #42: fix theme" }).success).toBe(true);
    expect(loginAsStoreSchema.safeParse({ tenantId: "10000000-0000-4000-a000-000000000001", reason: "" }).success).toBe(false);
  });
});
