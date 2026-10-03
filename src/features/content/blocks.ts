import { z } from "zod";

/**
 * Structured content blocks for pages and blog posts (stored in pages.body / blog_posts.body).
 * STABLE CONTRACT: the storefront (src/features/storefront) renders these. Never raw HTML;
 * every string is rendered as text. Add new block types only in a backwards-compatible way.
 *
 *   heading   { type, level: 2|3|4, text }
 *   paragraph { type, text }                  newlines = line breaks
 *   image     { type, path, alt, caption? }    path = store-assets storage path; render with assetUrl(path)
 *   list      { type, style: "bullet"|"number", items: string[] }
 *   quote     { type, text, cite? }
 *   button    { type, label, href, style: "primary"|"secondary" }   href = same-origin path or https URL
 *   divider   { type }
 */

/** Same-origin absolute path ("/collections/sale") or an https:// URL. Rejects //host, backslashes, other schemes. */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > 500) return false;
  if (/[\s\\\u0000-\u001f]/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    const u = new URL(href);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Storage path inside the public store-assets bucket (tenant/{uuid}/...). */
export const STORAGE_PATH_RE = /^tenant\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z]+\/[A-Za-z0-9._-]+$/;

const text = (max: number) => z.string().trim().min(1, "Required").max(max);

export const headingBlockSchema = z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2), text: text(200) });
export const paragraphBlockSchema = z.object({ type: z.literal("paragraph"), text: text(5000) });
export const imageBlockSchema = z.object({
  type: z.literal("image"),
  path: z.string().regex(STORAGE_PATH_RE, "Upload an image"),
  alt: z.string().trim().max(300).default(""),
  caption: z.string().trim().max(300).optional(),
});
export const listBlockSchema = z.object({
  type: z.literal("list"),
  style: z.enum(["bullet", "number"]).default("bullet"),
  items: z.array(text(500)).min(1, "Add at least one item").max(50),
});
export const quoteBlockSchema = z.object({ type: z.literal("quote"), text: text(1000), cite: z.string().trim().max(120).optional() });
export const buttonBlockSchema = z.object({
  type: z.literal("button"),
  label: text(60),
  href: z.string().trim().refine(isSafeHref, "Use a link starting with / or https://"),
  style: z.enum(["primary", "secondary"]).default("primary"),
});
export const dividerBlockSchema = z.object({ type: z.literal("divider") });

export const contentBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  imageBlockSchema,
  listBlockSchema,
  quoteBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
]);

export const MAX_BLOCKS = 100;
export const contentBlocksSchema = z.array(contentBlockSchema).max(MAX_BLOCKS, `At most ${MAX_BLOCKS} blocks`);

export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type ContentBlockType = ContentBlock["type"];
export const CONTENT_BLOCK_TYPES = ["heading", "paragraph", "image", "list", "quote", "button", "divider"] as const satisfies readonly ContentBlockType[];

/** Lenient read for rendering stored JSON: invalid blocks are dropped instead of failing the page. */
export function parseStoredBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  const out: ContentBlock[] = [];
  for (const raw of value.slice(0, MAX_BLOCKS)) {
    const r = contentBlockSchema.safeParse(raw);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** True when every image block points at this tenant's own storage prefix. */
export function blocksBelongToTenant(blocks: ContentBlock[], tenantId: string): boolean {
  return blocks.every((b) => b.type !== "image" || b.path.startsWith(`tenant/${tenantId}/`));
}

/** Plain-text excerpt from blocks (for SEO descriptions / previews). */
export function blocksToPlainText(blocks: ContentBlock[], max = 300): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph" || b.type === "quote") parts.push(b.text);
    else if (b.type === "list") parts.push(b.items.join(", "));
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
