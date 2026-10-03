import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_CONFIG } from "@/features/theme/default-theme";
import { resolveThemeConfig, parseThemeConfigStrict, type ThemeConfig } from "@/features/theme/schema/config";
import { MARKETPLACE_THEMES, findMarketplaceTheme } from "@/features/theme/marketplace/catalog";
import { applyThemePreset, isStyleSetting } from "@/features/theme/marketplace/apply";
import { THEME_STYLES } from "@/features/theme/marketplace/types";
import { PROTECTED_TENANT_IDS, canPreviewThemes, isShowcaseSlug } from "@/features/theme/marketplace/showcase";
import { isPreviewKeyShape, livePreviewUrl } from "@/features/theme/marketplace/live-preview";
import { INDUSTRY_SLUGS, isIndustry } from "@/features/stores/industries";

const TENANT = "10000000-0000-4000-a000-00000000000a";
const img = `tenant/${TENANT}/theme/hero.webp`;

function storeConfig(): ThemeConfig {
  const c = structuredClone(DEFAULT_THEME_CONFIG);
  const hero = c.templates.home.find((s) => s.type === "Hero");
  if (hero) (hero.settings as { slides: Record<string, unknown>[] }).slides = [{ ...(hero.settings as { slides: Record<string, unknown>[] }).slides[0], heading: "Our own heading", imagePath: img }];
  const ann = c.layout.header.find((s) => s.type === "AnnouncementBar");
  if (ann) (ann.settings as { messages: unknown[] }).messages = [{ text: "Free shipping over ₹999", href: "" }];
  return c;
}

describe("theme marketplace", () => {
  it("ships distinct themes with unique keys, industries and styles", () => {
    const keys = MARKETPLACE_THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(MARKETPLACE_THEMES.map((t) => JSON.stringify(t.preset.tokens))).size).toBe(keys.length);
    for (const t of MARKETPLACE_THEMES) {
      expect(isIndustry(t.industry)).toBe(true);
      expect(THEME_STYLES).toContain(t.style);
      expect(t.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (t.demo) expect(isShowcaseSlug(t.demo)).toBe(true);
    }
    expect(findMarketplaceTheme("minimal-d2c")?.demo).toBe("studioneel");
    expect(findMarketplaceTheme("nope")).toBeNull();
  });

  it("has at least five structurally different themes per priority industry", () => {
    for (const industry of INDUSTRY_SLUGS.filter((i) => i !== "handicrafts")) {
      const list = MARKETPLACE_THEMES.filter((t) => t.industry === industry);
      expect(list.length, industry).toBeGreaterThanOrEqual(5);
      // Different home compositions (section order), not just colours.
      const layouts = new Set(list.map((t) => t.preset.home.map(([type]) => type).join(">")));
      expect(layouts.size, industry).toBe(list.length);
      const headers = new Set(list.map((t) => `${t.preset.headerLayout}/${t.preset.inlineMenu}/${t.preset.menuStyle ?? "bar"}/${t.preset.tokens.headingFont}`));
      expect(headers.size, industry).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses each named slot with one section family per industry", () => {
    const family = (t: string) => (t === "ProductGrid" || t === "ProductCarousel" ? "products" : t);
    const seen = new Map<string, string>();
    for (const t of MARKETPLACE_THEMES) {
      for (const [type, , slot] of [...t.preset.home, ...(t.preset.collection ?? []), ...(t.preset.product ?? [])]) {
        if (!slot) continue;
        const k = `${t.industry}:${slot}`;
        const prev = seen.get(k);
        expect(prev === undefined || prev === family(type), `${t.key}: slot "${slot}" is ${type} but ${prev} elsewhere`).toBe(true);
        seen.set(k, family(type));
      }
    }
  });

  it("fills named content slots from a demo store's content pool", () => {
    const current = storeConfig();
    const grid = current.templates.home.find((s) => s.type === "ProductGrid" || s.type === "ProductCarousel")!;
    const deals = { ...structuredClone(grid), id: "slot-deals", type: "ProductGrid" as const, settings: { ...grid.settings, heading: "Deals of the day" } };
    const trending = { ...structuredClone(grid), id: "slot-trending", type: "ProductCarousel" as const, settings: { ...grid.settings, heading: "Trending now" } };
    current.templates.home.push(deals, trending);
    const theme = findMarketplaceTheme("tech-deals")!;
    const { config } = resolveThemeConfig(applyThemePreset(current, theme.preset));
    const got = config.templates.home.find((s) => s.id === "slot-deals");
    expect(got?.settings.heading).toBe("Deals of the day");
    expect(got?.settings.columns).toBe(4);
    // Slots are never consumed by an unrelated item.
    expect(config.templates.home.filter((s) => s.settings.heading === "Trending now").length).toBeLessThanOrEqual(1);
  });

  it("keeps unused slots hidden so switching themes again still finds them", () => {
    const current = storeConfig();
    const grid = current.templates.home.find((s) => s.type === "ProductGrid" || s.type === "ProductCarousel")!;
    const slot = (name: string, heading: string) => ({ ...structuredClone(grid), id: `slot-${name}`, type: "ProductGrid" as const, settings: { ...grid.settings, heading } });
    current.templates.home.push(slot("audio", "Audio picks"), slot("deals", "Deals of the day"));
    const minimal = resolveThemeConfig(applyThemePreset(current, findMarketplaceTheme("minimal-electronics")!.preset)).config;
    const deals = minimal.templates.home.find((s) => s.id === "slot-deals");
    expect(deals?.visibility).toEqual({ desktop: false, mobile: false });
    expect(minimal.templates.home.find((s) => s.id === "slot-audio")?.visibility).toEqual({ desktop: true, mobile: true });
    // Switch again: the hidden slot comes back, visible, with its content.
    const deal = resolveThemeConfig(applyThemePreset(minimal, findMarketplaceTheme("tech-deals")!.preset)).config;
    const back = deal.templates.home.find((s) => s.id === "slot-deals");
    expect(back?.visibility).toEqual({ desktop: true, mobile: true });
    expect(back?.settings.heading).toBe("Deals of the day");
    expect(new Set(deal.templates.home.map((s) => s.id)).size).toBe(deal.templates.home.length);
  });

  it("shows hidden pool slots picked up by type by a theme without slot names", () => {
    const current = storeConfig();
    const grid = current.templates.home.find((s) => s.type === "ProductGrid" || s.type === "ProductCarousel")!;
    current.templates.home = current.templates.home.filter((s) => s.type !== "ProductGrid" && s.type !== "ProductCarousel");
    current.templates.home.push({ ...structuredClone(grid), id: "slot-new", type: "ProductGrid", settings: { ...grid.settings, heading: "New arrivals" }, visibility: { desktop: false, mobile: false } });
    const { config } = resolveThemeConfig(applyThemePreset(current, findMarketplaceTheme("jaipur-boutique")!.preset));
    const got = config.templates.home.find((s) => s.settings.heading === "New arrivals");
    expect(got?.type).toBe("ProductCarousel");
    expect(got?.visibility).toEqual({ desktop: true, mobile: true });
    expect(got?.settings.heading).toBe("New arrivals");
  });

  it("only allows Live Preview on showcase tenants, never on protected real stores", () => {
    expect(canPreviewThemes({ tenantId: "00000000-0000-4000-a000-000000000001", slug: "voltnest" })).toBe(true);
    expect(canPreviewThemes({ tenantId: "00000000-0000-4000-a000-000000000001", slug: "the-paliya" })).toBe(false);
    expect(canPreviewThemes({ tenantId: TENANT, slug: "aangan" })).toBe(false);
    // Even if a protected tenant somehow had a showcase slug.
    expect(canPreviewThemes({ tenantId: "71458ab4-6b05-4798-bc95-acfe1fd15420", slug: "voltnest" })).toBe(false);
    expect(PROTECTED_TENANT_IDS.has("71458ab4-6b05-4798-bc95-acfe1fd15420")).toBe(true);
    expect(isShowcaseSlug("the-paliya")).toBe(false);
  });

  it("builds Live Preview URLs and validates keys", () => {
    expect(livePreviewUrl("http://voltnest.localhost:3000", "tech-deals")).toBe("http://voltnest.localhost:3000/?sf_theme=tech-deals");
    expect(livePreviewUrl("https://x.example", "a-b", "//evil")).toBe("https://x.example/?sf_theme=a-b");
    expect(isPreviewKeyShape("tech-deals")).toBe(true);
    expect(isPreviewKeyShape("exit")).toBe(false);
    expect(isPreviewKeyShape("../x")).toBe(false);
    expect(isPreviewKeyShape("A")).toBe(false);
    expect(isPreviewKeyShape(null)).toBe(false);
  });

  it("classifies style vs content settings", () => {
    expect(isStyleSetting("Hero", "height")).toBe(true);
    expect(isStyleSetting("ProductGrid", "columns")).toBe(true);
    expect(isStyleSetting("ProductGrid", "source")).toBe(false);
    expect(isStyleSetting("ProductGrid", "heading")).toBe(false);
  });

  for (const theme of MARKETPLACE_THEMES) {
    it(`applies ${theme.name} to a store without losing its content`, () => {
      const current = storeConfig();
      const raw = applyThemePreset(current, theme.preset);
      const strict = parseThemeConfigStrict(raw);
      if (!strict.ok) throw new Error(JSON.stringify(strict.issues.slice(0, 3)));
      const next = resolveThemeConfig(raw).config;
      expect(next.tokens.colors.primary).toBe(theme.preset.tokens.colors.primary);
      expect(next.tokens.headingFont).toBe(theme.preset.tokens.headingFont);
      const hero = next.templates.home.find((s) => s.type === "Hero");
      if (hero) {
        const slide = (hero.settings as { slides: { heading: string; imagePath: string }[] }).slides[0]!;
        expect(slide.heading).toBe("Our own heading");
        expect(slide.imagePath).toBe(img);
      }
      const ann = next.layout.header.find((s) => s.type === "AnnouncementBar")!;
      expect((ann.settings as { messages: { text: string }[] }).messages[0]!.text).toBe("Free shipping over ₹999");
      // Content from other stores never leaks in: no foreign tenant paths.
      expect(JSON.stringify(next)).not.toMatch(/tenant\/(?!10000000-0000-4000-a000-00000000000a)/);
    });
  }
});
