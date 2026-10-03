/**
 * Store-branded transactional email layout. PURE (unit tested).
 *
 * Every dynamic value is HTML-escaped here; callers pass plain text except `bodyHtml`, which
 * must come from `renderHtmlBody` (escapes template + values) or from this module's helpers.
 * Table-based, inline styles, 600px max width, single column: renders in Gmail/Outlook/iOS and
 * collapses on phones.
 */
import { escapeHtml, isSafeEmailUrl } from "../templates";

export type EmailBrand = {
  storeName: string;
  logoUrl?: string | null;
  /** #rrggbb; anything else falls back to the default. */
  accent?: string | null;
  storeUrl?: string | null;
  supportEmail?: string | null;
};

export type EmailLine = { title: string; variant?: string | null; quantity: number; total: string };
export type EmailInfoRow = { label: string; value: string; href?: string | null };

export type EmailLayoutInput = {
  brand: EmailBrand;
  /** Hidden inbox preview text. */
  preheader?: string;
  heading: string;
  bodyHtml: string;
  info?: EmailInfoRow[];
  lines?: EmailLine[];
  totals?: EmailInfoRow[];
  cta?: { label: string; url: string | null | undefined } | null;
  /** Small print under the card (plain text). */
  footnote?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const DEFAULT_ACCENT = "#111111";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function safeColor(value: string | null | undefined): string {
  return value && HEX_RE.test(value) ? value.toLowerCase() : DEFAULT_ACCENT;
}

/** Black or white text, whichever reads better on `hex`. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111111" : "#ffffff";
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function infoTable(rows: EmailInfoRow[], bold = false): string {
  if (!rows.length) return "";
  const tr = rows
    .map((r) => {
      const value = r.href && isSafeEmailUrl(r.href) ? `<a href="${escapeHtml(r.href)}" style="color:inherit">${escapeHtml(r.value)}</a>` : escapeHtml(r.value);
      return `<tr><td style="padding:6px 0;color:#555;font-size:14px">${escapeHtml(r.label)}</td><td style="padding:6px 0;text-align:right;font-size:14px${bold ? ";font-weight:600" : ""}">${value}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${tr}</table>`;
}

function linesTable(lines: EmailLine[]): string {
  if (!lines.length) return "";
  const tr = lines
    .map(
      (l) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px">${escapeHtml(l.title)}${l.variant ? `<br><span style="color:#777;font-size:13px">${escapeHtml(l.variant)}</span>` : ""}<br><span style="color:#777;font-size:13px">Qty ${Number(l.quantity) || 0}</span></td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;white-space:nowrap;vertical-align:top">${escapeHtml(l.total)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 4px;border-top:1px solid #eee">${tr}</table>`;
}

export function renderLayout(input: EmailLayoutInput): string {
  const accent = safeColor(input.brand.accent);
  const onAccent = contrastText(accent);
  const name = escapeHtml(input.brand.storeName);
  const logo =
    input.brand.logoUrl && isSafeEmailUrl(input.brand.logoUrl)
      ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${name}" height="40" style="display:block;height:40px;max-width:200px;border:0;outline:none">`
      : `<span style="font-size:20px;font-weight:600;color:#111">${name}</span>`;
  const header = input.brand.storeUrl && isSafeEmailUrl(input.brand.storeUrl) ? `<a href="${escapeHtml(input.brand.storeUrl)}" style="text-decoration:none">${logo}</a>` : logo;
  const cta =
    input.cta?.url && isSafeEmailUrl(input.cta.url)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:6px;background:${accent}"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:${onAccent};text-decoration:none;border-radius:6px">${escapeHtml(input.cta.label)}</a></td></tr></table>`
      : "";
  const support = input.brand.supportEmail ? ` Questions? Reply to this email or write to ${escapeHtml(input.brand.supportEmail)}.` : " Questions? Just reply to this email.";
  const preheader = input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.heading)}</title></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};color:#111;-webkit-text-size-adjust:100%">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="padding:0 4px 16px">${header}</td></tr><tr><td style="background:#ffffff;border-radius:10px;border-top:4px solid ${accent};padding:28px 24px;font-size:15px;line-height:1.55"><h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600">${escapeHtml(input.heading)}</h1>${input.bodyHtml}${infoTable(input.info ?? [])}${linesTable(input.lines ?? [])}${infoTable(input.totals ?? [], true)}${cta}</td></tr><tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#777">${input.footnote ? `${escapeHtml(input.footnote)} ` : ""}Sent by ${name}.${support}</td></tr></table></td></tr></table></body></html>`;
}

/** text/plain alternative built from the same input (body text passed in already rendered). */
export function renderLayoutText(input: Omit<EmailLayoutInput, "bodyHtml"> & { bodyText: string }): string {
  const parts: string[] = [input.heading, "", input.bodyText];
  const rows = (rs?: EmailInfoRow[]) => (rs ?? []).map((r) => `${r.label}: ${r.value}${r.href && r.href !== r.value ? ` (${r.href})` : ""}`);
  if (input.info?.length) parts.push("", ...rows(input.info));
  if (input.lines?.length) parts.push("", ...input.lines.map((l) => `- ${l.title}${l.variant ? ` (${l.variant})` : ""} x ${l.quantity}: ${l.total}`));
  if (input.totals?.length) parts.push("", ...rows(input.totals));
  if (input.cta?.url && isSafeEmailUrl(input.cta.url)) parts.push("", `${input.cta.label}: ${input.cta.url}`);
  parts.push("", "--", `${input.footnote ? `${input.footnote} ` : ""}Sent by ${input.brand.storeName}.${input.brand.supportEmail ? ` Questions? Write to ${input.brand.supportEmail}.` : ""}`);
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
