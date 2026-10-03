import { afterEach, describe, expect, it, vi } from "vitest";

const unstableCache = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ unstable_cache: unstableCache, revalidateTag }));

async function load(env: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env);
  return import("@/lib/cache/storefront");
}

afterEach(() => {
  vi.unstubAllEnvs();
  unstableCache.mockReset();
  revalidateTag.mockReset();
});

describe("storefront cache", () => {
  it("is bypassed outside production (next dev always reads the DB)", async () => {
    const { cachedStorefront } = await load("development");
    const fn = vi.fn(async (id: string) => `v-${id}`);
    const cached = cachedStorefront("x", fn, (id) => [id]);
    expect(cached).toBe(fn);
    await expect(cached("t1")).resolves.toBe("v-t1");
    expect(unstableCache).not.toHaveBeenCalled();
  });

  it("caches per argument with the tenant tag, the global tag and a TTL", async () => {
    unstableCache.mockImplementation((fn: (...a: string[]) => Promise<unknown>) => fn);
    const { cachedStorefront, storefrontTag, ALL_STOREFRONTS_TAG, STOREFRONT_CACHE_SECONDS } = await load("production");
    const fn = vi.fn(async (id: string) => `v-${id}`);
    const cached = cachedStorefront("store-profile", fn, (id) => [storefrontTag(id)]);
    await expect(cached("tenant-a")).resolves.toBe("v-tenant-a");
    await expect(cached("tenant-b")).resolves.toBe("v-tenant-b");
    // Arguments are part of unstable_cache's key, so tenants can't share an entry.
    expect(fn).toHaveBeenNthCalledWith(1, "tenant-a");
    expect(fn).toHaveBeenNthCalledWith(2, "tenant-b");
    expect(unstableCache).toHaveBeenNthCalledWith(1, fn, ["sf", "store-profile"], {
      tags: [ALL_STOREFRONTS_TAG, "tenant:tenant-a:storefront"],
      revalidate: STOREFRONT_CACHE_SECONDS,
    });
    expect(unstableCache.mock.calls[1]?.[2].tags).toContain("tenant:tenant-b:storefront");
  });

  it("revalidates the tenant and the directory immediately (no stale window)", async () => {
    const { revalidateStorefront, revalidateAllStorefronts } = await load("production");
    revalidateStorefront("t1");
    expect(revalidateTag).toHaveBeenCalledWith("tenant:t1:storefront", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("tenant-directory", { expire: 0 });
    revalidateAllStorefronts();
    expect(revalidateTag).toHaveBeenCalledWith("storefront-all", { expire: 0 });
  });
});
