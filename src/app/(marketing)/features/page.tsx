import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin, storeRootDomain } from "@/features/marketing-site/site";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { CTA_CREATE, SIGNUP_HREF } from "@/features/marketing-site/content";
import { ButtonLink, Container, Section, SectionHeading } from "@/features/marketing-site/components/ui";
import { Benefits, FinalCta } from "@/features/marketing-site/components/home-sections";
import { ProductDemos } from "@/features/marketing-site/components/product-demos";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({
    title: "Features",
    description: "Store themes and a visual editor, products and inventory, orders and GST invoices, payments, shipping, custom domains, SEO and analytics.",
    path: "/features",
    origin: siteOrigin(),
  });
}

/** Detailed capability list; each group maps to a dashboard area that exists today. */
const GROUPS: { title: string; items: string[] }[] = [
  { title: "Store design", items: ["Themes for 20 business categories", "Visual editor for colours, fonts and sections", "Separate desktop and mobile visibility", "Drafts, publishing and version rollback"] },
  { title: "Catalogue", items: ["Variants with their own price, SKU and stock", "Categories and rule-based collections", "Size charts", "CSV import and export"] },
  { title: "Orders", items: ["Order timeline from payment to delivery", "Returns, exchanges and refunds", "GST invoices", "Stock reserved at checkout"] },
  { title: "Payments", items: ["Razorpay, Cashfree or PayU on your own account", "UPI, cards and netbanking", "Cash on delivery with order limits and fees", "PIN code rules for COD"] },
  { title: "Shipping", items: ["Your own shipping rates", "PIN code delivery checks", "Delhivery integration", "Tracking updates on each order"] },
  { title: "Growth", items: ["Discount codes and automatic offers", "SEO titles, descriptions and sitemaps", "Sales and conversion analytics", "Product reviews"] },
  { title: "Team & security", items: ["Staff accounts with roles", "Audit log of sensitive actions", "Each store's data kept separate", "Secure email sign-in"] },
  { title: "Domains", items: ["Free store address on day one", "Custom domains on eligible plans", "Automatic HTTPS certificates", "DNS records shown step by step"] },
];

export default async function FeaturesPage() {
  const trialDays = maxTrialDays(await getMarketingPlans());
  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft/70 to-white pt-16 sm:pt-20">
        <Container>
          <SectionHeading as="h1" eyebrow="Features" title="Everything you need to run your online store" body="Design your storefront, manage products and orders, and get paid, all from one dashboard." />
          <div className="mt-8 flex justify-center">
            <ButtonLink href={SIGNUP_HREF} size="lg" track={{ id: "create_store", location: "features_page" }}>
              {CTA_CREATE}
            </ButtonLink>
          </div>
        </Container>
      </section>
      <Benefits />
      <ProductDemos rootDomain={storeRootDomain()} />
      <Section tone="canvas" labelledBy="all-features-title">
        <SectionHeading id="all-features-title" title="All features" body="Some features depend on your plan; see pricing for limits." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="rounded-brand-lg border border-border bg-white p-6">
              <h3 className="font-brand text-base font-bold text-brand-ink">{g.title}</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-muted marker:text-brand">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <FinalCta trialDays={trialDays} />
    </>
  );
}
