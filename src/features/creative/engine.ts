/**
 * Creative Studio template engine (pure; runs in the browser for live preview and on the server
 * for the final PNG, so both always match). A template is a list of layers positioned on a fixed
 * canvas; text layers pull from fields the seller fills in, colours pull from the store's brand.
 */

export type ColorRef = "primary" | "secondary" | "accent" | "background" | "text" | "sale" | "white" | "black" | `#${string}`;
export type FieldKey = "headline" | "subheadline" | "price" | "compareAt" | "discount" | "cta" | "image" | "date";

export type Layer =
  | { type: "rect"; x: number; y: number; w: number; h: number; fill: ColorRef; radius?: number; opacity?: number }
  | { type: "image"; x: number; y: number; w: number; h: number; radius?: number }
  | { type: "text"; x: number; y: number; w: number; field?: FieldKey; text?: string; size: number; font: "heading" | "body"; weight?: number; color: ColorRef; align?: "start" | "middle" | "end"; uppercase?: boolean; tracking?: number; maxLines?: number; lineHeight?: number; strike?: boolean }
  | { type: "badge"; x: number; y: number; w: number; h: number; field?: FieldKey; text?: string; fill: ColorRef; color: ColorRef; size: number; radius?: number }
  | { type: "logo"; x: number; y: number; w: number; h: number; color: ColorRef; align?: "start" | "middle" | "end" };

export type TemplateField = { key: FieldKey; label: string; max: number; placeholder: string; required?: boolean };
export type TemplateSpec = { fields: TemplateField[]; layers: Layer[] };
export type CreativeTemplate = { key: string; version: number; name: string; category: string; width: number; height: number; spec: TemplateSpec };

export type Brand = { name: string; colors: Record<"primary" | "secondary" | "accent" | "background" | "text" | "sale", string>; headingSerif: boolean; bodySerif: boolean; logoHref: string | null };
export type CreativeValues = Partial<Record<FieldKey, string>>;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function color(ref: ColorRef, brand: Brand): string {
  if (ref === "white") return "#ffffff";
  if (ref === "black") return "#111111";
  if (ref.startsWith("#")) return HEX.test(ref) ? ref : "#000000";
  const c = brand.colors[ref as keyof Brand["colors"]];
  return c && HEX.test(c) ? c : "#000000";
}

/** Greedy word wrap using an average glyph width (0.56 em sans, 0.52 em serif); ellipsis past maxLines. */
export function wrapText(text: string, width: number, size: number, maxLines: number, serif: boolean): string[] {
  const perLine = Math.max(1, Math.floor(width / (size * (serif ? 0.52 : 0.56))));
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > perLine ? `${w.slice(0, perLine - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, perLine - 1)).replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function textValue(l: { field?: FieldKey; text?: string }, values: CreativeValues, fields: TemplateField[]): string {
  if (!l.field) return l.text ?? "";
  const f = fields.find((x) => x.key === l.field);
  const v = (values[l.field] ?? "").trim();
  return (v || f?.placeholder || "").slice(0, f?.max ?? 200);
}

/**
 * Renders the template to an SVG string. `imageHref` is the product image (an https URL in the
 * browser, a data: URI on the server). All text is XML-escaped; colours are validated hex.
 */
export function renderCreativeSvg(t: CreativeTemplate, brand: Brand, values: CreativeValues, imageHref: string | null): string {
  const out: string[] = [];
  const defs: string[] = [];
  let clip = 0;
  for (const l of t.spec.layers) {
    if (l.type === "rect") {
      out.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}" fill="${color(l.fill, brand)}"${l.opacity !== undefined ? ` fill-opacity="${Math.min(1, Math.max(0, l.opacity))}"` : ""}/>`);
    } else if (l.type === "image") {
      if (!imageHref) {
        out.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}" fill="${color("secondary", brand)}" fill-opacity="0.25"/>`);
        continue;
      }
      const id = `c${clip++}`;
      defs.push(`<clipPath id="${id}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}"/></clipPath>`);
      out.push(`<image href="${escapeXml(imageHref)}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
    } else if (l.type === "text") {
      let s = textValue(l, values, t.spec.fields);
      if (!s) continue;
      if (l.uppercase) s = s.toUpperCase();
      const serif = l.font === "heading" ? brand.headingSerif : brand.bodySerif;
      const lines = wrapText(s, l.w, l.size, l.maxLines ?? 1, serif);
      const anchor = l.align ?? "start";
      const x = anchor === "middle" ? l.x + l.w / 2 : anchor === "end" ? l.x + l.w : l.x;
      const lh = l.size * (l.lineHeight ?? 1.15);
      const tspans = lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${escapeXml(line)}</tspan>`).join("");
      out.push(`<text x="${x}" y="${l.y + l.size}" font-family="${serif ? SERIF : SANS}" font-size="${l.size}" font-weight="${l.weight ?? 400}" fill="${color(l.color, brand)}" text-anchor="${anchor}"${l.tracking ? ` letter-spacing="${l.tracking}"` : ""}${l.strike ? ' text-decoration="line-through"' : ""}>${tspans}</text>`);
    } else if (l.type === "badge") {
      const s = textValue(l, values, t.spec.fields);
      if (!s) continue;
      out.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? l.h / 2}" fill="${color(l.fill, brand)}"/>`);
      out.push(`<text x="${l.x + l.w / 2}" y="${l.y + l.h / 2 + l.size * 0.35}" font-family="${SANS}" font-size="${l.size}" font-weight="700" fill="${color(l.color, brand)}" text-anchor="middle">${escapeXml(s.toUpperCase().slice(0, 24))}</text>`);
    } else if (l.type === "logo") {
      if (brand.logoHref) {
        const align = l.align === "middle" ? "xMidYMid" : l.align === "end" ? "xMaxYMid" : "xMinYMid";
        out.push(`<image href="${escapeXml(brand.logoHref)}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="${align} meet"/>`);
      } else {
        const anchor = l.align ?? "start";
        const x = anchor === "middle" ? l.x + l.w / 2 : anchor === "end" ? l.x + l.w : l.x;
        const size = Math.round(l.h * 0.62);
        out.push(`<text x="${x}" y="${l.y + l.h / 2 + size * 0.35}" font-family="${brand.headingSerif ? SERIF : SANS}" font-size="${size}" font-weight="600" fill="${color(l.color, brand)}" text-anchor="${anchor}" letter-spacing="1">${escapeXml(brand.name.slice(0, 40))}</text>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${t.width}" height="${t.height}" viewBox="0 0 ${t.width} ${t.height}"><defs>${defs.join("")}</defs><rect width="100%" height="100%" fill="${color("background", brand)}"/>${out.join("")}</svg>`;
}

/** Validates seller input against a template's fields (lengths; required). */
export function validateValues(t: CreativeTemplate, values: Record<string, unknown>): { values: CreativeValues; errors: Record<string, string[]> } {
  const out: CreativeValues = {};
  const errors: Record<string, string[]> = {};
  for (const f of t.spec.fields) {
    if (f.key === "image") continue;
    const v = typeof values[f.key] === "string" ? (values[f.key] as string).replace(/[\u0000-\u001f]/g, " ").trim() : "";
    if (v.length > f.max) errors[f.key] = [`At most ${f.max} characters`];
    else if (f.required && !v) errors[f.key] = [`${f.label} is required`];
    else if (v) out[f.key] = v;
  }
  return { values: out, errors };
}
