/**
 * DEV ONLY — responsive screenshots for visual QA.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/shots.mts \
 *     --out /tmp/shots --widths 375,1440 [--as owner@aangan.test] [--origin http://localhost:3000] [--dark] [--full] \
 *     /dashboard /dashboard/products http://aangan.localhost:3000/
 *
 * `--as` signs a seed account in with a one-time link from the Supabase admin API (no password).
 * Paths are resolved against --origin; absolute URLs are used as-is.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const out = opt("out", "/tmp/shots")!;
const widths = opt("widths", "375,1440")!.split(",").map(Number);
const asEmail = opt("as");
const origin = opt("origin", "http://localhost:3000")!;
const dark = flag("dark");
const full = flag("full");
const urls = args.map((u) => (u.startsWith("http") ? u : `${origin}${u}`));
mkdirSync(out, { recursive: true });

async function signInUrl(email: string, siteOrigin: string, next: string): Promise<string> {
  const key = process.env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const j = (await res.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const hash = j.hashed_token ?? j.properties?.hashed_token;
  if (!hash) throw new Error(`generate_link failed for ${email}`);
  const path = new URL(siteOrigin).hostname === "localhost" ? "/auth/confirm" : "/account/auth/callback";
  return `${siteOrigin}${path}?token_hash=${hash}&type=magiclink&next=${encodeURIComponent(next)}`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
if (dark) await context.addInitScript(() => localStorage.setItem("paliya-appearance", "dark"));
const page = await context.newPage();
if (asEmail) {
  const first = new URL(urls[0]!);
  await page.goto(await signInUrl(asEmail, first.origin, "/"), { waitUntil: "networkidle", timeout: 120_000 });
}
for (const url of urls) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
    await page.waitForTimeout(400);
    const name = `${new URL(url).host}${new URL(url).pathname}`.replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "") + `-${w}${dark ? "-dark" : ""}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: full });
    console.log(`${out}/${name}`);
  }
}
await browser.close();
