import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/storage/assets", () => ({
  assetUrl: (p: string | null | undefined) => (p ? `https://abc.supabase.co/storage/v1/object/public/store-assets/${p}` : null),
}));

const { StoreArtImage } = await import("@/features/storefront/components/store-image");

describe("StoreArtImage (hero slides with a separate phone image)", () => {
  it("renders ONE <img> in a <picture>, so each device downloads only its own file", () => {
    const html = renderToStaticMarkup(createElement(StoreArtImage, { path: "tenant/a/desk.jpg", mobilePath: "tenant/a/phone.jpg", alt: "Sale", sizes: "100vw", priority: true, natural: true }));
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('<source media="(max-width: 47.99rem)"');
    expect(html).toMatch(/media="\(max-width: 47\.99rem\)" srcSet="[^"]*phone\.jpg/);
    expect(html).toMatch(/media="\(min-width: 48rem\)" srcSet="[^"]*desk\.jpg/);
    expect(html).toContain('alt="Sale"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).not.toContain('loading="lazy"');
  });

  it("falls back to a single image when there is no phone image", () => {
    const html = renderToStaticMarkup(createElement(StoreArtImage, { path: "tenant/a/desk.jpg", mobilePath: null, alt: "Sale", sizes: "100vw" }));
    expect(html).not.toContain("<picture");
    expect(html).toContain('loading="lazy"');
    expect(html.match(/<img/g)).toHaveLength(1);
  });
});
