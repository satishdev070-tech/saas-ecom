import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code: string; message: string } | null };
const results: Result[] = [];
const selected: string[] = [];
const logError = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const q = {
        select: (cols: string) => (selected.push(cols), q),
        eq: () => q,
        neq: () => q,
        order: () => q,
        then: (resolve: (r: Result) => unknown) => resolve(results.shift()!),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/features/platform", () => ({ getTenantEntitlements: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  results.length = 0;
  selected.length = 0;
  logError.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxxxxxxxxxxxxxxxxxxx");
  vi.stubEnv("NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN", "buildbrighten.in");
});
afterEach(() => vi.unstubAllEnvs());

const row = { id: "d1", tenant_id: "t1", hostname: "acme.buildbrighten.in", type: "platform_subdomain", status: "verified", is_primary: true };

describe("listTenantDomains", () => {
  it("returns rows normally", async () => {
    results.push({ data: [{ ...row, provider: null, provider_status: null, dns_records: [], redirect_hostname: null }], error: null });
    const { listTenantDomains } = await import("@/features/domains/server/service");
    await expect(listTenantDomains("t1")).resolves.toHaveLength(1);
    expect(selected).toHaveLength(1);
  });

  it("falls back to the pre-migration-21 columns when the database is behind", async () => {
    results.push({ data: null, error: { code: "42703", message: "column domains.provider does not exist" } });
    results.push({ data: [row], error: null });
    const { listTenantDomains } = await import("@/features/domains/server/service");
    const rows = await listTenantDomains("t1");
    expect(rows).toEqual([{ ...row, provider: null, provider_status: null, dns_records: [], redirect_hostname: null }]);
    expect(selected[1]).not.toContain("provider_status");
    expect(logError).toHaveBeenCalledWith("domains.schema_outdated", expect.objectContaining({ tenantId: "t1", code: "42703" }));
  });

  it("still throws on other database errors", async () => {
    results.push({ data: null, error: { code: "42501", message: "permission denied" } });
    const { listTenantDomains } = await import("@/features/domains/server/service");
    await expect(listTenantDomains("t1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("domainSettings", () => {
  it("works without unrelated server secrets (SUPABASE_SECRET_KEY, APP_SECRET)", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("APP_SECRET", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("CUSTOM_DOMAIN_CNAME_TARGET", "Stores.BuildBrighten.in");
    const { domainSettings } = await import("@/features/domains/server/service");
    expect(domainSettings()).toMatchObject({ rootDomain: "buildbrighten.in", cnameTarget: "stores.buildbrighten.in", vercel: null });
  });
});
