/**
 * Full-page screenshots of a store's key pages (desktop + mobile) for before/after comparison.
 *   pnpm exec tsx scripts/dev/protect/visual-baseline.mts <origin> <out-dir>
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [origin = "http://the-paliya.localhost:3000", out = "visual-baseline"] = process.argv.slice(2);
const PAGES = ["/", "/categories/collections", "/products/blue-lehariya-dress", "/pages/about", "/faq", "/cart"];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]] as const) {
  const page = await browser.newPage({ ...opts, reducedMotion: "reduce" });
  for (const p of PAGES) {
    await page.goto(origin + p, { waitUntil: "networkidle", timeout: 120000 });
    // Freeze moving parts (marquees, autoplay, reels) so screenshots are comparable.
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important} video{visibility:hidden!important}" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}${p.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log("saved to", out);
