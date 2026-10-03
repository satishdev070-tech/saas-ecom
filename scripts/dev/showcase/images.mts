/**
 * DEV ONLY — real, reusable photography for the showcase stores.
 *
 * Source: Openverse (api.openverse.org), filtered to CC0 1.0 (public-domain dedication, no
 * attribution required, commercial use allowed), StockSnap by default. Nothing is scraped from
 * retailers. Credits are still recorded and published on each store's "Image credits" page.
 *
 *   pnpm exec tsx scripts/dev/showcase/images.mts <slug> [--sheet]
 *
 * Search results are cached in scripts/dev/showcase/.cache; --sheet writes contact sheets
 * (every candidate numbered) so a human can vet and set `pick` in the store's data file.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Img, ShowcaseSpec } from "./types";

type SharpInst = {
  resize(w: number, h?: number, o?: { fit?: string; position?: string }): SharpInst;
  composite(layers: { input: Buffer; left: number; top: number }[]): SharpInst;
  jpeg(o: { quality: number }): SharpInst;
  webp(o: { quality: number }): SharpInst;
  png(): SharpInst;
  toBuffer(): Promise<Buffer>;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  metadata(): Promise<{ width?: number; height?: number }>;
};
type Sharp = ((input?: Buffer | { create: { width: number; height: number; channels: 3; background: string } }) => SharpInst);
export const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp") as Sharp;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, ".cache");

export type Hit = { id: string; url: string; thumbnail: string; title: string; creator: string | null; creator_url: string | null; foreign_landing_url: string; license: string; license_version: string; source: string; width: number | null; height: number | null };

const exists = (p: string) => access(p).then(() => true, () => false);
const keyOf = (img: Img) => `${img.source ?? "stocksnap"}__${img.q.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** Licences we accept: public domain (CC0, PDM) and CC BY (attribution; credits are published). No NC / ND / SA. */
const LICENSES = new Set(["cc0", "pdm", "by"]);

async function query(q: string, params: Record<string, string>): Promise<Hit[]> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.searchParams.set("q", q);
  u.searchParams.set("page_size", "20");
  u.searchParams.set("category", "photograph");
  u.searchParams.set("mature", "false");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(u, { headers: { "User-Agent": "paliya-dev-showcase/1.0 (demo seed; open licences only)" } });
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    if (!res.ok) throw new Error(`openverse ${q} → ${res.status}`);
    const j = (await res.json()) as { results: Hit[] };
    return j.results.filter((h) => LICENSES.has(h.license) && (h.width ?? 1000) >= 800);
  }
}

/** Openverse search (StockSnap CC0 first, then other open-licence photos), cached on disk. */
export async function search(img: Img): Promise<Hit[]> {
  await mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, `${keyOf(img)}.v2.json`);
  if (await exists(file)) return JSON.parse(await readFile(file, "utf8")) as Hit[];
  const first = await query(img.q, { license: "cc0", source: img.source ?? "stocksnap" });
  const rest = img.source ? [] : await query(img.q, { license: "cc0,pdm,by", source: "rawpixel,wikimedia,flickr" });
  const seen = new Set<string>();
  const hits = [...first, ...rest].filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true))).slice(0, 16);
  await writeFile(file, JSON.stringify(hits, null, 1));
  return hits;
}

/** Downloads (cached) and returns the raw bytes of an image URL. */
export async function download(url: string): Promise<Buffer> {
  await mkdir(path.join(CACHE, "img"), { recursive: true });
  const file = path.join(CACHE, "img", url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.]+/g, "_").slice(-150));
  if (await exists(file)) return readFile(file);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "paliya-dev-showcase/1.0" } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      return buf;
    }
    if (attempt >= 3) throw new Error(`download ${url} → ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

/** The vetted hits for an image slot (default: the first result). */
export async function picked(img: Img, n = 1): Promise<Hit[]> {
  const hits = await search(img);
  const idx = img.pick ?? Array.from({ length: n }, (_, i) => i);
  const out = idx.map((i) => hits[i]).filter((h): h is Hit => !!h);
  if (!out.length) throw new Error(`no CC0 image for "${img.q}"`);
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Contact sheets: one row per item, candidates numbered 0…N-1, the current pick outlined. */
async function sheets(spec: ShowcaseSpec, outDir: string) {
  const filter = process.env.SHEET_FILTER ? new RegExp(process.env.SHEET_FILTER, "i") : null;
  const items: { label: string; img: Img }[] = [
    ...Object.entries(spec.images).map(([k, img]) => ({ label: `image:${k}`, img })),
    ...spec.products.map((p, i) => ({ label: `#${i} ${p.title}`, img: p.img })),
  ].filter((x) => !filter || filter.test(x.label) || filter.test(x.img.q));
  const COLS = 8;
  const T = 150;
  const LABEL = 250;
  const ROWS = 9;
  await mkdir(outDir, { recursive: true });
  for (let s = 0; s * ROWS < items.length; s++) {
    const chunk = items.slice(s * ROWS, s * ROWS + ROWS);
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [r, it] of chunk.entries()) {
      const hits = await search(it.img);
      const pick = new Set(it.img.pick ?? [0]);
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL}" height="${T}"><rect width="100%" height="100%" fill="#fff"/><foreignObject/><text x="8" y="22" font-family="Helvetica" font-size="15" font-weight="bold">${esc(it.label.slice(0, 28))}</text><text x="8" y="44" font-family="Helvetica" font-size="13" fill="#555">${esc(it.label.slice(28, 58))}</text><text x="8" y="70" font-family="Helvetica" font-size="12" fill="#888">q: ${esc(it.img.q.slice(0, 30))}</text><text x="8" y="90" font-family="Helvetica" font-size="12" fill="#888">${hits.length} results</text></svg>`);
      layers.push({ input: await sharp(label).png().toBuffer(), left: 0, top: r * (T + 6) });
      for (let c = 0; c < COLS && c < hits.length; c++) {
        try {
          const raw = await download(hits[c]!.thumbnail || hits[c]!.url);
          const thumb = await sharp(raw).resize(T - 8, T - 8, { fit: "cover", position: "attention" }).png().toBuffer();
          const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><rect width="100%" height="100%" fill="${pick.has(c) ? "#e11d48" : "#fff"}"/></svg>`);
          layers.push({ input: await sharp(frame).png().toBuffer(), left: LABEL + c * T, top: r * (T + 6) });
          layers.push({ input: thumb, left: LABEL + c * T + 4, top: r * (T + 6) + 4 });
          const num = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="22"><rect width="26" height="22" fill="#000" opacity="0.75"/><text x="13" y="16" text-anchor="middle" font-family="Helvetica" font-size="14" fill="#fff">${c}</text></svg>`);
          layers.push({ input: await sharp(num).png().toBuffer(), left: LABEL + c * T + 4, top: r * (T + 6) + 4 });
        } catch (e) {
          console.warn(`  thumb failed ${it.label} #${c}: ${String(e).slice(0, 80)}`);
        }
      }
    }
    const W = LABEL + COLS * T;
    const H = chunk.length * (T + 6);
    const out = path.join(outDir, `${spec.slug}-${String(s + 1).padStart(2, "0")}.jpg`);
    await writeFile(out, await sharp({ create: { width: W, height: H, channels: 3, background: "#f3f3f3" } }).composite(layers).jpeg({ quality: 78 }).toBuffer());
    console.log(`  sheet ${out}`);
  }
}

/** Review sheet of the CHOSEN images only, larger, to check for logos and quality. */
async function picksSheet(spec: ShowcaseSpec, outDir: string) {
  const items: { label: string; hit: Hit }[] = [];
  for (const [k, img] of Object.entries(spec.images)) for (const h of await picked(img)) items.push({ label: k, hit: h });
  for (const [i, p] of spec.products.entries()) for (const h of await picked(p.img)) items.push({ label: `#${i}`, hit: h });
  const S = 300;
  const COLS = 5;
  const PER = COLS * 4;
  await mkdir(outDir, { recursive: true });
  for (let s = 0; s * PER < items.length; s++) {
    const chunk = items.slice(s * PER, s * PER + PER);
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [n, it] of chunk.entries()) {
      const x = (n % COLS) * S;
      const y = Math.floor(n / COLS) * S;
      const raw = await download(it.hit.url);
      layers.push({ input: await sharp(raw).resize(S - 6, S - 6, { fit: "cover", position: "attention" }).png().toBuffer(), left: x + 3, top: y + 3 });
      const tag = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S - 6}" height="22"><rect width="100%" height="22" fill="#000" opacity="0.7"/><text x="6" y="16" font-family="Helvetica" font-size="13" fill="#fff">${esc(`${it.label} · ${it.hit.source} · ${it.hit.license}`)}</text></svg>`);
      layers.push({ input: await sharp(tag).png().toBuffer(), left: x + 3, top: y + 3 });
    }
    const out = path.join(outDir, `${spec.slug}-picks-${s + 1}.jpg`);
    await writeFile(out, await sharp({ create: { width: COLS * S, height: Math.ceil(chunk.length / COLS) * S, channels: 3, background: "#ddd" } }).composite(layers).jpeg({ quality: 80 }).toBuffer());
    console.log(`  picks ${out}`);
  }
}

export async function loadSpec(slug: string): Promise<ShowcaseSpec> {
  const mod = (await import(`./data/${slug}.ts`)) as { default: ShowcaseSpec };
  return mod.default;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) throw new Error("usage: images.mts <slug> [--sheet]");
  const spec = await loadSpec(slug);
  const all = [...Object.values(spec.images), ...spec.products.map((p) => p.img)];
  for (const img of all) {
    const hits = await search(img);
    if (hits.length < 3) console.warn(`  few results (${hits.length}) for "${img.q}"`);
  }
  if (flags.includes("--sheet")) await sheets(spec, process.env.SHEET_DIR ?? path.join(CACHE, "sheets"));
  if (flags.includes("--picks")) await picksSheet(spec, process.env.SHEET_DIR ?? path.join(CACHE, "sheets"));
  console.log(`${spec.name}: ${all.length} image searches cached`);
}
