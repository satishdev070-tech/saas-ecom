import { Check } from "lucide-react";
import { DEMO_ROWS, SECTION_IDS, type DemoRow } from "../content";
import { DemoBadge, Section, SectionHeading } from "./ui";

/**
 * Illustrations of seller tasks, drawn as simplified dashboard panels. Names, prices and order
 * numbers are invented sample values and every panel carries a "Demo data" label; nothing here
 * presents itself as a real store's figures.
 */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-brand-lg border border-border bg-white shadow-brand-float" aria-hidden>
      <div className="flex items-center justify-between border-b border-border bg-brand-canvas px-4 py-3">
        <span className="text-sm font-semibold text-brand-ink">{title}</span>
        <DemoBadge />
      </div>
      <div className="p-5 text-sm">{children}</div>
    </div>
  );
}

const Field = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
  <div className={wide ? "col-span-2" : ""}>
    <p className="text-xs font-medium text-muted">{label}</p>
    <p className="mt-1 rounded-brand-sm border border-border px-3 py-2 text-brand-ink">{value}</p>
  </div>
);

function ProductsVisual() {
  return (
    <Panel title="New product">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" value="Hand-painted ceramic mug" wide />
        <Field label="Price" value="₹ 649" />
        <Field label="Stock" value="24" />
      </div>
      <p className="mt-4 text-xs font-medium text-muted">Variants</p>
      <div className="mt-2 divide-y divide-border rounded-brand-sm border border-border">
        {[
          ["Indigo · 350 ml", "₹ 649", "12"],
          ["Ochre · 350 ml", "₹ 649", "8"],
          ["Indigo · 500 ml", "₹ 749", "4"],
        ].map(([v, p, s]) => (
          <div key={v} className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 text-brand-ink">
            <span>{v}</span>
            <span className="text-muted">{p}</span>
            <span className="w-6 text-right tabular-nums">{s}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ThemeVisual() {
  const sections = ["Announcement bar", "Header", "Hero banner", "Featured collection", "Testimonials", "Newsletter", "Footer"];
  return (
    <Panel title="Theme editor">
      <div className="grid grid-cols-[1fr_1.1fr] gap-4">
        <ul className="space-y-1.5">
          {sections.map((s, i) => (
            <li key={s} className={`rounded-brand-sm px-3 py-1.5 ${i === 2 ? "bg-brand-soft font-semibold text-brand" : "text-brand-ink"}`}>
              {s}
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">Colours</p>
          <div className="flex gap-2">
            {["#4338ca", "#f5a524", "#0b1b3f", "#e7f7ef"].map((c) => (
              <span key={c} className="size-7 rounded-full border border-border" style={{ background: c }} />
            ))}
          </div>
          <p className="text-xs font-medium text-muted">Heading font</p>
          <p className="rounded-brand-sm border border-border px-3 py-2 text-brand-ink">Manrope</p>
          <div className="flex gap-2 pt-1">
            <span className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-brand-ink">Preview</span>
            <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Publish</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OrdersVisual() {
  const rows = [
    ["#1042", "Paid · UPI", "To pack", "bg-brand-accent-soft text-brand-ink"],
    ["#1041", "COD", "Shipped", "bg-brand-soft text-brand"],
    ["#1040", "Paid · Card", "Delivered", "bg-brand-mint text-[#15803d]"],
    ["#1039", "Paid · UPI", "Return requested", "bg-brand-canvas text-brand-ink"],
  ];
  return (
    <Panel title="Orders">
      <div className="divide-y divide-border">
        {rows.map(([id, pay, status, tone]) => (
          <div key={id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="font-semibold text-brand-ink">{id}</span>
            <span className="text-muted">{pay}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DomainVisual({ rootDomain }: { rootDomain: string }) {
  return (
    <Panel title="Domains">
      <p className="text-xs font-medium text-muted">Store address</p>
      <p className="mt-1 flex items-center justify-between rounded-brand-sm border border-border px-3 py-2 text-brand-ink">
        yourstore.{rootDomain} <span className="rounded-full bg-brand-mint px-2 py-0.5 text-xs font-semibold text-[#15803d]">Live</span>
      </p>
      <p className="mt-4 text-xs font-medium text-muted">Custom domain</p>
      <p className="mt-1 flex items-center justify-between rounded-brand-sm border border-border px-3 py-2 text-brand-ink">
        www.yourbrand.in <span className="rounded-full bg-brand-accent-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">Waiting for DNS</span>
      </p>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-brand-sm bg-brand-canvas p-3 font-mono text-xs text-brand-ink">
        <span className="text-muted">TYPE</span>
        <span className="text-muted">NAME → VALUE</span>
        <span>CNAME</span>
        <span>www → (shown in your dashboard)</span>
      </div>
    </Panel>
  );
}

const VISUALS: Record<DemoRow["key"], (p: { rootDomain: string }) => React.ReactElement> = { products: ProductsVisual, theme: ThemeVisual, orders: OrdersVisual, domain: DomainVisual };

export function ProductDemos({ rootDomain }: { rootDomain: string }) {
  return (
    <Section id={SECTION_IDS.demos} labelledBy="demos-title">
      <SectionHeading id="demos-title" eyebrow="Inside your dashboard" title="Simple tools for everyday selling" body="A quick look at what running your store involves. Panels show sample data." />
      <div className="mt-14 space-y-16 sm:space-y-24">
        {DEMO_ROWS.map((row, i) => {
          const Visual = VISUALS[row.key];
          return (
            <div key={row.key} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 ? "lg:order-2" : ""}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">{row.eyebrow}</p>
                <h3 className="mt-3 font-brand text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">{row.title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-muted">{row.body}</p>
                <ul className="mt-6 space-y-3">
                  {row.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-brand-ink">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden>
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 ? "lg:order-1" : ""}>
                <Visual rootDomain={rootDomain} />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
