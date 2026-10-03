import { Boxes, Globe2, LineChart, LockKeyhole, Palette, ScrollText, ShieldCheck, Timer } from "lucide-react";
import { PLATFORM_NAME } from "@/config/platform";
import { BrandLogo } from "@/features/marketing-site/components/brand-logo";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";

function Wordmark({ sub }: { sub: string }) {
  return (
    <div>
      <p className="font-display text-2xl tracking-tight">{PLATFORM_NAME}</p>
      <p className="mt-1 text-overline text-[#f4efe9]/55">{sub}</p>
    </div>
  );
}

const MERCHANT_POINTS = [
  { icon: Palette, title: "Themes for your kind of business", body: "Pick a design, change colours and sections, and preview before you publish." },
  { icon: Boxes, title: "Products, orders and stock", body: "Variants, inventory, orders, returns and GST invoices in one dashboard." },
  { icon: LineChart, title: "Payments and shipping", body: "Your own Razorpay, Cashfree or PayU account, cash on delivery, and shipping rules." },
  { icon: Globe2, title: "Your own web address", body: "A free store address from day one; connect your own domain on eligible plans." },
];

const ASIDE_THEME = MARKETPLACE_THEMES.find((t) => t.key === "contemporary-ethnic") ?? MARKETPLACE_THEMES[0];

/** Left panel for merchant sign-in / sign-up (Build Brighten brand). Value statements only, no invented numbers. */
export function MerchantAside({ mode }: { mode: "login" | "register" }) {
  return (
    <>
      <BrandLogo />
      <div className="max-w-lg py-10">
        <h2 className="font-brand text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-brand-ink">
          {mode === "register" ? "Your brand. Your store. Your next big beginning." : "Welcome back to your store."}
        </h2>
        <ul className="mt-8 space-y-5">
          {MERCHANT_POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-brand-md bg-white text-brand shadow-brand-card">
                <p.icon aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block font-semibold text-brand-ink">{p.title}</span>
                <span className="block text-small text-muted">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {ASIDE_THEME ? (
        <div className="hidden max-h-56 max-w-md overflow-hidden rounded-brand-md border border-border bg-white shadow-brand-float [@media(min-height:900px)]:block" aria-hidden>
          <ThemeMockup preset={ASIDE_THEME.preset} name={ASIDE_THEME.name.split(" ")[0]!} />
        </div>
      ) : null}
    </>
  );
}

const CONSOLE_POINTS = [
  { icon: ShieldCheck, title: "Staff accounts only", body: "Access is granted per person by a super admin and checked on every request." },
  { icon: ScrollText, title: "Every privileged action is audited", body: "Store status, plan, flag and user changes are written to the platform audit log." },
  { icon: Timer, title: "Time-boxed support access", body: "Viewing a store requires a stated reason, is read-only and expires automatically." },
  { icon: LockKeyhole, title: "Store data stays isolated", body: "Row-level security separates every store's data, including from staff tools." },
];

/** Left panel for the platform console sign-in. Security posture, no live business data pre-login. */
export function ConsoleAside() {
  return (
    <>
      <Wordmark sub="Platform console" />
      <div className="max-w-lg">
        <h2 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight">
          Platform operations,
          <br />
          <span className="text-[#7ea2ff]">secured.</span>
        </h2>
        <ul className="mt-10 space-y-6">
          {CONSOLE_POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-[#7ea2ff]/20 bg-[#7ea2ff]/5">
                <p.icon aria-hidden className="size-4 text-[#7ea2ff]" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-body font-medium">{p.title}</span>
                <span className="block text-small text-[#e5e8ee]/55">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-[#e5e8ee]/40">
        <span className="size-1.5 rounded-full bg-[#4ade80]" aria-hidden /> Restricted system · Authorised staff only
      </p>
    </>
  );
}
