/**
 * Media library rules (pure; used by the browser uploader for instant feedback and re-checked
 * on the server, where the file's real bytes are sniffed before it is catalogued).
 */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MIN_DIMENSION = 120;
export const MEDIA_MAX_DIMENSION = 8000;

export const MEDIA_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "image/gif": ["gif"],
} as const satisfies Record<string, readonly string[]>;
export type MediaMime = keyof typeof MEDIA_TYPES;
export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES).join(",");
export const MEDIA_TYPE_LABEL = "JPG, PNG, WebP, AVIF or GIF";

export const MEDIA_FOLDERS = ["general", "products", "collections", "categories", "banners", "theme", "content", "brand"] as const;
export const FOLDER_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isMediaMime(v: string): v is MediaMime {
  return Object.hasOwn(MEDIA_TYPES, v);
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Human-readable size, e.g. 2.4 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export type FileMeta = { name: string; size: number; type: string; width?: number; height?: number };

/** First problem with a file, or null when it's acceptable. */
export function validateMediaFile(f: FileMeta): string | null {
  if (!isMediaMime(f.type)) return `Unsupported file type. Use ${MEDIA_TYPE_LABEL}.`;
  const ext = extensionOf(f.name);
  if (!(MEDIA_TYPES[f.type] as readonly string[]).includes(ext)) return `The file extension “.${ext || "?"}” doesn't match its type.`;
  if (f.size <= 0) return "The file is empty.";
  if (f.size > MEDIA_MAX_BYTES) return `Too large (${formatBytes(f.size)}). The limit is ${formatBytes(MEDIA_MAX_BYTES)}.`;
  if (f.width !== undefined && f.height !== undefined) {
    if (Math.min(f.width, f.height) < MEDIA_MIN_DIMENSION) return `Too small (${f.width}×${f.height}px). Images need at least ${MEDIA_MIN_DIMENSION}px on each side.`;
    if (Math.max(f.width, f.height) > MEDIA_MAX_DIMENSION) return `Too large (${f.width}×${f.height}px). The maximum is ${MEDIA_MAX_DIMENSION}px.`;
  }
  return null;
}

/** Safe display filename (no path, control chars or overlong names). */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "image";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "image";
}
