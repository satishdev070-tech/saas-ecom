/**
 * DEV ONLY — screenshots a showcase store in each of its industry's themes via Live Preview
 * (?sf_theme=<key>), desktop + mobile, to check layouts. Read-only.
 *   pnpm exec tsx scripts/dev/showcase/shots.mts <slug> <outDir> [path] [themeKey…]
 */
import { chromium, devices } from "@playwright/test";
import { MARKETPLACE_THEMES } from "../../../src/features/theme/marketplace/catalog";
import { SHOWCASE_STORES } from "../../../src/features/theme/marketplace/showcase";

const [slug, out, path = "/", ...keys] = process.argv.slice(2);
if (!slug || !out) throw new Error("usage: shots.mts <slug> <outDir> [path] [themeKey…]");
const industry = SHOWCASE_STORES[slug]!.industry;
const themes = keys.length ? keys : MARKETPLACE_THEMES.filter((t) => t.industry === industry && t.demo === slug).map((t) => t.key);
const browser = await chromium.launch();
for (const [name, ctxOpts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]] as const) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const key of themes) {
    await page.goto(`http://${slug}.localhost:3000${path}${path.includes("?") ? "&" : "?"}sf_theme=${key}`, { waitUntil: "load", timeout: 180_000 });
    // A busy dev server may never go fully idle: wait a while for it, then carry on.
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${out}/${slug}-${key}-${name}.jpg`, fullPage: true, quality: 60, type: "jpeg" });
    console.log(`${name} ${key}${overflow > 1 ? `  ⚠ horizontal overflow ${overflow}px` : ""}`);
  }
  if (errors.length) console.log(`  page errors (${name}):`, errors.slice(0, 5));
  await ctx.close();
}
await browser.close();
