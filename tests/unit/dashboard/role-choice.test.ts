import { describe, expect, it } from "vitest";
import { encodeRoleChoice, parseRoleChoice } from "@/features/team/role-choice";

describe("role choice", () => {
  it("parses system and custom roles", () => {
    expect(parseRoleChoice("system:catalog_manager")).toEqual({ role: "catalog_manager", customRoleId: null });
    expect(parseRoleChoice("custom:3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toEqual({ role: "custom", customRoleId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" });
  });
  it("never allows assigning the owner role or unknown values", () => {
    for (const v of ["system:owner", "system:root", "custom:not-a-uuid", "admin", "", "system:"]) expect(parseRoleChoice(v)).toBeNull();
  });
  it("round-trips", () => {
    expect(parseRoleChoice(encodeRoleChoice("analyst", null))).toEqual({ role: "analyst", customRoleId: null });
  });
});
