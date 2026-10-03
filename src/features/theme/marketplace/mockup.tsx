import { FONT_STACKS, type FontKey } from "../schema/tokens";
import type { ThemePreset } from "./catalog";

/**
 * Live, token-driven preview of a theme (no screenshots to go stale): header, hero and a product
 * row drawn with the theme's own colours, fonts, button shape and card style. Decorative only.
 */
const RADIUS: Record<string, string> = { none: "0", sm: "4px", md: "8px", lg: "14px" };
const BTN: Record<string, string> = { square: "0", rounded: "6px", pill: "999px" };

export function ThemeMockup({ preset, name, size = "card" }: { preset: ThemePreset; name: string; size?: "card" | "large" | "phone" }) {
  const t = preset.tokens as Record<string, unknown> & { colors: Record<string, string> };
  const c = t.colors;
  const heading = FONT_STACKS[(t.headingFont as FontKey) ?? "editorial-serif"]?.stack;
  const body = FONT_STACKS[(t.bodyFont as FontKey) ?? "modern-sans"]?.stack;
  const upper = t.headingCase === "uppercase";
  const radius = RADIUS[String(t.cardRadius)] ?? "0";
  const btnRadius = BTN[String(t.buttonShape)] ?? "0";
  const outline = t.buttonVariant === "outline";
  const phone = size === "phone";
  const center = phone || preset.headerLayout === "logo-center";
  const heroDark = preset.hero.textTone === "light";
  const cards = size === "large" ? 4 : phone ? 2 : 3;
  const tall = String(preset.productCard.imageRatio) === "tall" ? "3/4.4" : String(preset.productCard.imageRatio) === "square" ? "1/1" : "3/4";
  const footerBg = preset.footerTone === "dark" ? c.primary : preset.footerTone === "muted" ? c.border : c.background;

  return (
    <div aria-hidden className="overflow-hidden select-none" style={{ background: c.background, color: c.text, fontFamily: body, fontSize: size === "large" ? 12 : 9 }}>
      <div style={{ background: preset.announcementTone === "accent" ? c.accent : preset.announcementTone === "light" ? c.background : c.primary, color: preset.announcementTone === "light" ? c.text : "#fff", textAlign: "center", padding: "3px 0", fontSize: "0.8em", letterSpacing: "0.08em" }}>
        FREE SHIPPING ACROSS INDIA
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: center ? "center" : "space-between", gap: 12, padding: "8px 12px", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: heading, fontSize: "1.5em", textTransform: upper ? "uppercase" : "none", letterSpacing: upper ? "0.08em" : 0, color: c.primary }}>{name}</span>
        {!center ? (
          <span style={{ display: "flex", gap: 10, opacity: 0.7 }}>
            <span>New</span>
            <span>Shop</span>
            <span>Sale</span>
          </span>
        ) : null}
      </div>
      <div
        style={{
          position: "relative",
          padding: size === "large" ? "44px 24px" : "22px 14px",
          background: heroDark ? `linear-gradient(135deg, ${c.primary}, ${c.secondary})` : `linear-gradient(135deg, ${c.border}, ${c.background})`,
          color: heroDark ? "#fff" : c.text,
          textAlign: preset.hero.align === "center" ? "center" : "left",
        }}
      >
        <div style={{ fontSize: "0.75em", letterSpacing: "0.18em", opacity: 0.85 }}>NEW SEASON</div>
        <div style={{ fontFamily: heading, fontSize: size === "large" ? "2.6em" : "2em", lineHeight: 1.05, margin: "4px 0 8px", textTransform: upper ? "uppercase" : "none" }}>Made by hand</div>
        <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: btnRadius, background: outline ? "transparent" : heroDark ? "#fff" : c.primary, color: outline ? "inherit" : heroDark ? c.primary : "#fff", border: `1px solid ${heroDark ? "#fff" : c.primary}`, fontSize: "0.85em" }}>Shop now</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards}, 1fr)`, gap: 8, padding: 12 }}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} style={{ textAlign: preset.productCard.textAlign === "center" ? "center" : "left" }}>
            <div style={{ aspectRatio: tall, borderRadius: radius, background: [c.border, c.secondary, c.accent, c.primary][i % 4], opacity: i % 2 ? 0.55 : 0.85, position: "relative" }}>
              {i === 1 ? <span style={{ position: "absolute", top: 4, left: 4, background: c.sale, color: "#fff", padding: "1px 4px", fontSize: "0.7em", borderRadius: preset.productCard.badgeStyle === "filled" ? 3 : 0 }}>SALE</span> : null}
            </div>
            <div style={{ marginTop: 4, height: 5, width: "70%", background: c.text, opacity: 0.25, marginInline: preset.productCard.textAlign === "center" ? "auto" : 0 }} />
            <div style={{ marginTop: 3, fontWeight: 600, color: c.primary }}>₹{[2490, 1890, 3450, 1290][i]}</div>
          </div>
        ))}
      </div>
      <div style={{ background: footerBg, height: size === "large" ? 24 : 14 }} />
    </div>
  );
}
