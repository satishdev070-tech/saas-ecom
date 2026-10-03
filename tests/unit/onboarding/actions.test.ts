import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
});
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), redirect: (u: string) => redirect(u) }));

const user = { id: "u1", email: "a@example.com", displayName: "A" };
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => user }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(), clientIpKey: async () => "ip" }));
vi.mock("@/lib/tenant/active", () => ({ setActiveTenant: vi.fn() }));
const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/env/public", () => ({ publicEnv: () => ({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "buildbrighten.in" }) }));
const applyTheme = vi.fn(async (_ctx: unknown, key: string) => ({ theme: { key, version: "1.0.0" } }));
vi.mock("@/features/theme/server/apply-marketplace", () => ({ applyMarketplaceThemeToDraft: (ctx: unknown, key: string) => applyTheme(ctx, key) }));

// Owned stores + owner context: the user owns t-own only.
const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
vi.mock("@/features/onboarding/server", () => ({
  listOwnedStores: async () => [{ tenantId: OWN, slug: "asha-crafts", name: "Asha Crafts" }],
  ownerContext: async (_u: unknown, id: string) => (id === OWN ? { tenantId: OWN, user, permissions: new Set(["theme.edit", "settings.write"]) } : null),
}));

let rpcResult: { data: unknown; error: { code: string; message: string } | null } = { data: OWN, error: null };
const updates: unknown[] = [];
const updateUser = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async () => rpcResult,
    auth: { updateUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cat-1" } }) }) }),
      update: (v: unknown) => ({ eq: async () => (updates.push(v), { error: null }) }),
    }),
  }),
}));

beforeEach(() => {
  redirect.mockClear();
  audit.mockClear();
  applyTheme.mockClear();
  updateUser.mockClear();
  updates.length = 0;
  rpcResult = { data: OWN, error: null };
});

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const redirectedTo = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow("NEXT_REDIRECT");
  return redirect.mock.calls.at(-1)?.[0];
};

describe("saveBusinessAction", () => {
  it("creates the store as a draft, sets the category and continues to the theme step with the choices", async () => {
    const { saveBusinessAction } = await import("@/features/onboarding/actions");
    const to = await redirectedTo(saveBusinessAction(null, fd({ name: "Asha Crafts", category: "handicrafts", slug: "asha-crafts", plan: "growth", theme: "earth-artisan" })));
    expect(to).toBe(`/onboarding?step=theme&store=${OWN}&plan=growth&theme=earth-artisan`);
    expect(updates).toContainEqual({ launch_status: "draft" });
    expect(updates).toContainEqual({ category_id: "cat-1" });
  });

  it("resumes the user's own store when the same address is submitted twice (no duplicate)", async () => {
    rpcResult = { data: null, error: { code: "23505", message: "duplicate" } };
    const { saveBusinessAction } = await import("@/features/onboarding/actions");
    const to = await redirectedTo(saveBusinessAction(null, fd({ name: "Asha Crafts", category: "handicrafts", slug: "asha-crafts" })));
    expect(to).toBe(`/onboarding?step=theme&store=${OWN}`);
    expect(updates).not.toContainEqual({ launch_status: "draft" });
  });

  it("reports a taken address that belongs to someone else", async () => {
    rpcResult = { data: null, error: { code: "23505", message: "duplicate" } };
    const { saveBusinessAction } = await import("@/features/onboarding/actions");
    const res = await saveBusinessAction(null, fd({ name: "Other", category: "fashion", slug: "someone-else" }));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.fieldErrors?.slug?.[0]).toContain("taken");
  });

  it("validates reserved and malformed addresses on the server", async () => {
    const { saveBusinessAction } = await import("@/features/onboarding/actions");
    for (const slug of ["admin", "a", "bad--slug", "-x-", "Shop!"]) {
      const res = await saveBusinessAction(null, fd({ name: "Asha", category: "fashion", slug }));
      expect(res.ok, slug).toBe(false);
    }
    const res = await saveBusinessAction(null, fd({ name: "Asha", category: "not-a-category", slug: "asha-shop" }));
    expect(!res.ok && res.error.fieldErrors?.category).toBeTruthy();
  });

  it("rejects editing a store the user doesn't own", async () => {
    const { saveBusinessAction } = await import("@/features/onboarding/actions");
    const res = await saveBusinessAction(null, fd({ store: OTHER, category: "fashion" }));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
    expect(updates).toHaveLength(0);
  });
});

describe("chooseThemeAction / choosePlanAction", () => {
  it("applies the theme as a draft on the owned store", async () => {
    const { chooseThemeAction } = await import("@/features/onboarding/actions");
    const to = await redirectedTo(chooseThemeAction(null, fd({ store: OWN, choice: "minimal-d2c", plan: "growth" })));
    expect(applyTheme).toHaveBeenCalledWith(expect.objectContaining({ tenantId: OWN }), "minimal-d2c");
    expect(to).toBe(`/onboarding?step=plan&store=${OWN}&plan=growth`);
  });

  it("skips without applying anything", async () => {
    const { chooseThemeAction } = await import("@/features/onboarding/actions");
    await redirectedTo(chooseThemeAction(null, fd({ store: OWN, choice: "minimal-d2c", skip: "1" })));
    expect(applyTheme).not.toHaveBeenCalled();
  });

  it("never touches a store the user doesn't own", async () => {
    const { chooseThemeAction, choosePlanAction } = await import("@/features/onboarding/actions");
    expect((await chooseThemeAction(null, fd({ store: OTHER, choice: "minimal-d2c" }))).ok).toBe(false);
    expect((await choosePlanAction(null, fd({ store: OTHER, choice: "growth" }))).ok).toBe(false);
    expect(applyTheme).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("records a plan preference without changing entitlements", async () => {
    const { choosePlanAction } = await import("@/features/onboarding/actions");
    const to = await redirectedTo(choosePlanAction(null, fd({ store: OWN, choice: "growth" })));
    expect(to).toBe(`/onboarding?step=ready&store=${OWN}`);
    expect(updateUser).toHaveBeenCalledWith({ data: { requested_plan: "growth" } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.plan_requested", metadata: { plan: "growth" } }));
    // No write to tenants/plan_id anywhere in this action.
    expect(updates).toHaveLength(0);
  });

  it("rejects unknown plan codes", async () => {
    const { choosePlanAction } = await import("@/features/onboarding/actions");
    const res = await choosePlanAction(null, fd({ store: OWN, choice: "free-forever" }));
    expect(res.ok).toBe(false);
  });
});
