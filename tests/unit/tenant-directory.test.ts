import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code: string; message: string; details: string | null; hint: string | null } | null };
const results: Result[] = [];
const logError = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => results.shift() };
    return { from: () => query };
  },
}));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/env/public", () => ({ publicEnv: () => ({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store" }) }));

beforeEach(() => {
  vi.resetModules();
  results.length = 0;
  logError.mockReset();
});

const load = () => import("@/lib/tenant/directory");

describe("tenantDirectory.findByHost", () => {
  it("returns null for a hostname with no verified domain row (genuine not found)", async () => {
    results.push({ data: null, error: null }, { data: null, error: null }); // host, then its www partner
    const { tenantDirectory } = await load();
    await expect(tenantDirectory.findByHost("unknown.example.com")).resolves.toBeNull();
    expect(logError).not.toHaveBeenCalled();
  });

  it("resolves a verified store host", async () => {
    results.push({ data: { hostname: "www.thepaliya.com", tenant_id: "t1", tenants: { id: "t1", slug: "the-paliya", status: "active", stores: [{ name: "The Paliya" }] } }, error: null });
    results.push({ data: { hostname: "www.thepaliya.com" }, error: null });
    const { tenantDirectory } = await load();
    await expect(tenantDirectory.findByHost("www.thepaliya.com")).resolves.toMatchObject({ tenantId: "t1", slug: "the-paliya", name: "The Paliya", primaryHost: "www.thepaliya.com" });
  });

  it("throws (5xx) and logs diagnostics when the lookup query fails, instead of reporting not found", async () => {
    results.push({ data: null, error: { code: "PGRST301", message: "JWT could not be decoded", details: null, hint: null } });
    const { tenantDirectory, TenantDirectoryError } = await load();
    await expect(tenantDirectory.findByHost("acme.paliya.store")).rejects.toBeInstanceOf(TenantDirectoryError);
    expect(logError).toHaveBeenCalledWith("tenant_directory.lookup_failed", expect.objectContaining({ host: "acme.paliya.store", code: "PGRST301" }));
  });

  it("throws when the primary-domain query fails rather than caching a wrong canonical host", async () => {
    results.push({ data: { hostname: "acme.paliya.store", tenant_id: "t2", tenants: { id: "t2", slug: "acme", status: "active", stores: null } }, error: null });
    results.push({ data: null, error: { code: "08006", message: "connection failure", details: null, hint: null } });
    const { tenantDirectory, TenantDirectoryError } = await load();
    await expect(tenantDirectory.findByHost("acme.paliya.store")).rejects.toBeInstanceOf(TenantDirectoryError);
  });
});

describe("www / apex partner of a custom domain", () => {
  const paliya = (hostname: string, type: string) => ({ data: { hostname, type, tenant_id: "t1", tenants: { id: "t1", slug: "the-paliya", status: "active", stores: [{ name: "The Paliya" }] } }, error: null });

  it("serves www.brand.com from the verified brand.com (canonical stays on the primary)", async () => {
    results.push({ data: null, error: null }, paliya("thepaliya.com", "custom"), { data: { hostname: "thepaliya.com" }, error: null });
    const { tenantDirectory } = await load();
    await expect(tenantDirectory.findByHost("www.thepaliya.com")).resolves.toMatchObject({ tenantId: "t1", host: "www.thepaliya.com", primaryHost: "thepaliya.com" });
  });

  it("serves brand.com from the verified www.brand.com", async () => {
    results.push({ data: null, error: null }, paliya("www.thepaliya.com", "custom"), { data: null, error: null });
    const { tenantDirectory } = await load();
    await expect(tenantDirectory.findByHost("thepaliya.com")).resolves.toMatchObject({ tenantId: "t1", host: "thepaliya.com", primaryHost: "www.thepaliya.com" });
  });

  it("never borrows a platform subdomain or a non-custom row", async () => {
    const { companionCustomHost } = await load();
    expect(companionCustomHost("acme.paliya.store", "paliya.store")).toBeNull();
    expect(companionCustomHost("paliya.store", "paliya.store")).toBeNull();
    expect(companionCustomHost("www.com", "paliya.store")).toBeNull();
    expect(companionCustomHost("thepaliya.com", "paliya.store")).toBe("www.thepaliya.com");
    expect(companionCustomHost("www.x", "paliya.store")).toBeNull();
    results.push({ data: null, error: null }, paliya("thepaliya.com", "platform_subdomain"), { data: null, error: null });
    const { tenantDirectory } = await load();
    await expect(tenantDirectory.findByHost("www.thepaliya.com")).resolves.toBeNull();
  });
});
