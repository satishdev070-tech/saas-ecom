import { beforeEach, describe, expect, it, vi } from "vitest";

let result: { data: unknown; error: { code: string; message: string } | null } = { data: null, error: null };
let cookieValue: string | undefined;
const verify = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("@/features/theme/server/preview", () => ({ verifyPreviewToken: (...a: unknown[]) => verify(...a) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

beforeEach(() => {
  vi.resetModules();
  cookieValue = undefined;
  verify.mockReset();
});

const load = () => import("@/features/stores/launch");

describe("store launch status", () => {
  it("parses only 'draft' as draft", async () => {
    const { parseLaunchStatus } = await load();
    expect(parseLaunchStatus("draft")).toBe("draft");
    expect(parseLaunchStatus("live")).toBe("live");
    expect(parseLaunchStatus(undefined)).toBe("live");
    expect(parseLaunchStatus("weird")).toBe("live");
  });

  it("fails open to live when the column is missing or the query fails", async () => {
    result = { data: null, error: { code: "42703", message: "column stores.launch_status does not exist" } };
    const { getLaunchStatus, isHiddenDraft } = await load();
    expect(await getLaunchStatus("t1")).toBe("live");
    expect(await isHiddenDraft("t1")).toBe(false);
  });

  it("hides a draft store from visitors", async () => {
    result = { data: { launch_status: "draft" }, error: null };
    const { isHiddenDraft } = await load();
    expect(await isHiddenDraft("t1")).toBe(true);
  });

  it("shows a draft store to its owner with a valid preview token for that store", async () => {
    result = { data: { launch_status: "draft" }, error: null };
    cookieValue = "signed-token";
    verify.mockImplementation((token: string, tenantId: string) => (token === "signed-token" && tenantId === "t1" ? { tenantId } : null));
    const { isHiddenDraft } = await load();
    expect(await isHiddenDraft("t1")).toBe(false);
    expect(await isHiddenDraft("t2")).toBe(true);
  });

  it("leaves live stores visible", async () => {
    result = { data: { launch_status: "live" }, error: null };
    const { isHiddenDraft } = await load();
    expect(await isHiddenDraft("t1")).toBe(false);
  });
});
