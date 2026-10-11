import Link from "next/link";
import { FESTIVE_PRESETS, type FestiveCampaign } from "../festive";
import { FestivePetals } from "./festive-petals";

/** Decorative garland strip (marigold toran, diyas, stars, …) drawn as a repeating inline SVG. */
export function garlandBackground(motif: string, accent: string, bg: string): string {
  const a = encodeURIComponent(accent);
  const b = encodeURIComponent(bg);
  const svg: Record<string, string> = {
    // Marigold toran: a swag of flowers with hanging mango leaves.
    toran: `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='26'><path d='M0 4 Q24 18 48 4' fill='none' stroke='${b}' stroke-width='2'/><circle cx='6' cy='7' r='4' fill='${a}'/><circle cx='16' cy='11' r='4' fill='%23ff7a00'/><circle cx='24' cy='12' r='4.5' fill='${a}'/><circle cx='32' cy='11' r='4' fill='%23ff7a00'/><circle cx='42' cy='7' r='4' fill='${a}'/><path d='M24 15 q-4 6 0 10 q4 -4 0 -10z' fill='%23228b22'/></svg>`,
    diya: `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='24'><path d='M8 16 q14 9 28 0 z' fill='${a}'/><path d='M22 14 q-3 -5 0 -10 q3 5 0 10z' fill='%23ff6a00'/><circle cx='4' cy='6' r='1.5' fill='${a}'/><circle cx='40' cy='5' r='1.5' fill='${a}'/></svg>`,
    stars: `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'><path d='M10 3 l2 5 5 .5 -4 3 1.5 5 -4.5 -3 -4.5 3 1.5 -5 -4 -3 5 -.5z' fill='${a}'/><circle cx='30' cy='10' r='1.6' fill='${a}'/></svg>`,
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='16'><circle cx='6' cy='8' r='4' fill='${a}'/><circle cx='18' cy='8' r='4' fill='%232ec4b6'/><circle cx='30' cy='8' r='4' fill='%23ffbe0b'/></svg>`,
    tricolour: `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='12'><rect width='30' height='4' fill='%23ff9933'/><rect y='4' width='30' height='4' fill='%23ffffff'/><rect y='8' width='30' height='4' fill='%23138808'/></svg>`,
  };
  return `url("data:image/svg+xml,${svg[motif] ?? svg.dots}")`;
}

/** Announcement bar shown above the header while a campaign runs. */
export function FestiveBanner({ c }: { c: FestiveCampaign }) {
  const p = FESTIVE_PRESETS[c.preset];
  const text = c.message || p.message;
  return (
    <div role="region" aria-label={`${p.label} announcement`} className="px-4 py-2 text-center text-sm font-medium" style={{ background: p.bg, color: p.fg }}>
      {c.link ? (
        <Link href={c.link} className="underline-offset-4 hover:underline" style={{ color: p.fg }}>
          {text} <span aria-hidden>→</span>
        </Link>
      ) : (
        text
      )}
    </div>
  );
}

/** Garland under the header (decorative). */
export function FestiveGarland({ c }: { c: FestiveCampaign }) {
  const p = FESTIVE_PRESETS[c.preset];
  const height = p.motif === "toran" ? 26 : p.motif === "tricolour" ? 12 : 20;
  return <div aria-hidden className="pointer-events-none w-full" style={{ height, backgroundImage: garlandBackground(p.motif, p.accent, p.bg), backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }} />;
}

/** Everything a running campaign adds to the storefront, split around the header. */
export function FestiveTop({ c }: { c: FestiveCampaign | null }) {
  return c?.banner ? <FestiveBanner c={c} /> : null;
}
export function FestiveBelowHeader({ c }: { c: FestiveCampaign | null }) {
  if (!c) return null;
  const p = FESTIVE_PRESETS[c.preset];
  return (
    <>
      {c.garland ? <FestiveGarland c={c} /> : null}
      {c.petals ? <FestivePetals color={p.petals} /> : null}
    </>
  );
}
