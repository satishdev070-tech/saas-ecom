/**
 * Screenshots of the Ramya storefront (home, a collection, a product, cart) at 1440 and 375.
 *   pnpm exec tsx scripts/dev/ramya/shots.mts <out-dir> [origin]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [out = "ramya-shots", origin = "http://ramya-by-ayushi-paliya.localhost:3000"] = process.argv.slice(2);
const PAGES = (process.env.PAGES ?? "/,/collections/new-arrival-products,/products/blue-lehariya-dress,/cart").split(",");
const SIZES = (process.env.SIZES ?? "1440,375").split(",").map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const w of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: w > 500 ? 900 : 812 }, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: w < 500, hasTouch: w < 500 });
  for (const p of PAGES) {
    await page.goto(origin + p, { waitUntil: "networkidle", timeout: 120000 });
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    // Lazy images: scroll through the page once.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
      const imgs = [...document.images].filter((i) => !i.complete);
      await Promise.race([Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))), new Promise((r) => setTimeout(r, 8000))]);
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${w}${p === "/" ? "_home" : p.replace(/\//g, "_")}.jpg`, fullPage: true, quality: 70, type: "jpeg" });
  }
  await page.close();
}
await browser.close();
console.log("saved to", out);
