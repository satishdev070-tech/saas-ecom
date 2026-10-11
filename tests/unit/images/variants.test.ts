import { describe, expect, it, vi, beforeEach } from "vitest";
import { isVariantable, pickVariantWidth, storeAssetPathFromUrl, variantPath, variantPathsFor } from "@/lib/storage/variants";
import imageLoader from "@/lib/images/loader";

const T = "tenant/0b9e7c2a-3f7e-4b55-9f43-2b0c8d1a7e11";
const URL_BASE = "https://abc.supabase.co/storage/v1/object/public/store-assets/";

describe("image variants", () => {
  it("names copies next to the original and lists them for deletion", () => {
    expect(variantPath(`${T}/products/a.jpg`, 960)).toBe(`${T}/products/a__w960.webp`);
    expect(variantPathsFor(`${T}/products/a.PNG`)).toEqual([`${T}/products/a__w480.webp`, `${T}/products/a__w960.webp`, `${T}/products/a__w1600.webp`]);
    expect(variantPathsFor(`${T}/media/clip.mp4`)).toEqual([]);
  });

  it("only makes copies of tenant raster originals", () => {
    expect(isVariantable(`${T}/products/a.webp`)).toBe(true);
    expect(isVariantable(`${T}/products/a__w960.webp`)).toBe(false);
    expect(isVariantable(`${T}/products/anim.gif`)).toBe(false);
    expect(isVariantable(`${T}/products/logo.svg`)).toBe(false);
    expect(isVariantable(`${T}/../other/a.jpg`)).toBe(false);
    expect(isVariantable("branding/header_logo/x.png")).toBe(false);
  });

  it("picks the smallest copy at least as wide as requested", () => {
    expect(pickVariantWidth(96)).toBe(480);
    expect(pickVariantWidth(640)).toBe(960);
    expect(pickVariantWidth(1080)).toBe(1600);
    expect(pickVariantWidth(1920)).toBe(1600);
  });

  it("loader sends store images to /api/img and leaves everything else alone", () => {
    expect(imageLoader({ src: `${URL_BASE}${T}/products/a.jpg`, width: 640 })).toBe(`/api/img?p=${encodeURIComponent(`${T}/products/a.jpg`)}&w=960`);
    expect(imageLoader({ src: `${URL_BASE}${T}/products/anim.gif`, width: 640 })).toBe(`${URL_BASE}${T}/products/anim.gif`);
    expect(imageLoader({ src: "/illustrations/lotus.svg", width: 640 })).toBe("/illustrations/lotus.svg");
    expect(storeAssetPathFromUrl(`${URL_BASE}${T}/products/my%20photo.jpg`)).toBe(`${T}/products/my photo.jpg`);
  });
});

const ensureVariant = vi.fn();
vi.mock("@/lib/storage/variants-server", () => ({ ensureVariant: (...a: unknown[]) => ensureVariant(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => undefined), clientIpKey: vi.fn(async () => "ip") }));
vi.mock("@/lib/storage/assets", () => ({ assetUrl: (p: string) => `${URL_BASE}${p}` }));

describe("/api/img", () => {
  beforeEach(() => ensureVariant.mockReset());
  const call = async (q: string) => {
    const { GET } = await import("@/app/api/img/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest(`https://www.thepaliya.com/api/img?${q}`));
  };

  it("permanently redirects to the copy, cached for a year", async () => {
    ensureVariant.mockResolvedValue(`${URL_BASE}${T}/products/a__w960.webp`);
    const res = await call(`p=${encodeURIComponent(`${T}/products/a.jpg`)}&w=640`);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${URL_BASE}${T}/products/a__w960.webp`);
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(ensureVariant).toHaveBeenCalledWith(`${T}/products/a.jpg`, 960);
  });

  it("falls back to the original briefly when the copy can't be made", async () => {
    ensureVariant.mockResolvedValue(null);
    const res = await call(`p=${encodeURIComponent(`${T}/products/a.jpg`)}&w=640`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${URL_BASE}${T}/products/a.jpg`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("rejects paths outside tenant images", async () => {
    expect((await call("p=../etc/passwd&w=640")).status).toBe(404);
    expect((await call(`p=${encodeURIComponent("branding/x.png")}&w=640`)).status).toBe(404);
    expect(ensureVariant).not.toHaveBeenCalled();
  });
});

describe("renderVariant", () => {
  it("makes a WebP no wider than asked and never enlarges", async () => {
    vi.doUnmock("@/lib/storage/variants-server");
    const sharp = (await import("sharp")).default;
    const { renderVariant } = await vi.importActual<typeof import("@/lib/storage/variants-server")>("@/lib/storage/variants-server");
    const big = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c81e5a" } }).jpeg().toBuffer();
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#c81e5a" } }).png().toBuffer();
    const a = await sharp(await renderVariant(big, 960)).metadata();
    const b = await sharp(await renderVariant(small, 960)).metadata();
    expect([a.format, a.width, a.height]).toEqual(["webp", 960, 640]);
    expect([b.format, b.width]).toEqual(["webp", 300]);
  });
});
