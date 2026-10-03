import { Boxes, Globe2, LineChart, LockKeyhole, Palette, ScrollText, ShieldCheck, Timer } from "lucide-react";
import { PLATFORM_NAME } from "@/config/platform";

function Wordmark({ sub }: { sub: string }) {
  return (
    <div>
      <p className="font-display text-2xl tracking-tight">{PLATFORM_NAME}</p>
      <p className="mt-1 text-overline text-[#f4efe9]/55">{sub}</p>
    </div>
  );
}

const MERCHANT_POINTS = [
  { icon: Palette, title: "A storefront that looks like your label", body: "Editorial themes, your fonts and colours, live preview before you publish." },
  { icon: Boxes, title: "Built for fashion catalogues", body: "Sizes and colours as variants, size charts, stock per size, bulk CSV import." },
  { icon: LineChart, title: "Run it from one place", body: "Orders, COD and online payments, returns, customers and analytics." },
  { icon: Globe2, title: "Your own domain", body: "Start on a free store address, connect www.yourbrand.in when you're ready." },
];

/** Left panel for merchant sign-in / sign-up. Value statements only, no invented numbers. */
export function MerchantAside({ mode }: { mode: "login" | "register" }) {
  return (
    <>
      <Wordmark sub="Seller centre" />
      <div className="max-w-lg">
        <h2 className="font-display text-[2.75rem] leading-[1.08] tracking-tight">
          {mode === "register" ? (
            <>
              Build the fashion store
              <br />
              your brand deserves.
            </>
          ) : (
            <>
              Welcome back to
              <br />
              your studio.
            </>
          )}
        </h2>
        <ul className="mt-10 space-y-6">
          {MERCHANT_POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-[#f4efe9]/15 bg-[#f4efe9]/5">
                <p.icon aria-hidden className="size-4 text-[#e8a37f]" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-body font-medium">{p.title}</span>
                <span className="block text-small text-[#f4efe9]/60">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-small text-[#f4efe9]/50">Made for Indian fashion labels, from block-print kurtas to bridal couture.</p>
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
