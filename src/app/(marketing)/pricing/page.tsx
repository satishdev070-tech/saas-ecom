import type { Metadata } from "next";
import { buildMarketingMetadata, faqJsonLd, serializeJsonLd, softwareApplicationJsonLd } from "@/features/marketing-site/seo";
import { siteOrigin } from "@/features/marketing-site/site";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { PricingTable } from "@/features/marketing-site/components/pricing-table";
import { PlanComparison } from "@/features/marketing-site/components/plan-comparison";
import { Section, SectionHeading } from "@/features/marketing-site/components/ui";
import { FaqSection, FinalCta } from "@/features/marketing-site/components/home-sections";
import type { Faq } from "@/features/marketing-site/content";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({
    title: "Pricing",
    description: "Compare Build Brighten plans: product, staff, storage and custom-domain limits, with prices in rupees and monthly or yearly billing.",
    path: "/pricing",
    origin: siteOrigin(),
  });
}

/** Billing answers that describe the product as it is: trial on signup, no online plan purchase yet. */
function pricingFaqs(trialDays: number): Faq[] {
  return [
    {
      question: "What happens when I sign up?",
      answer:
        trialDays > 0
          ? `Your store starts on a ${trialDays}-day free trial of our entry plan. You won't be asked for card details.`
          : "Your store starts on our entry plan. You won't be asked for card details.",
    },
    {
      question: "Can I pay for a plan online?",
      answer: "Not yet. Online plan checkout isn't available, so nothing is charged when you sign up or choose a plan. The plan you pick is saved with your sign-up, and our team applies plan changes to your store.",
    },
    {
      question: "Does choosing a plan here unlock its features?",
      answer: "No. Features are unlocked by the plan actually assigned to your store, not by the plan you pick on this page.",
    },
    {
      question: "Are there transaction fees?",
      answer: "Online payments are processed by your own payment provider account (Razorpay, Cashfree or PayU), which charges its own fees under your agreement with them.",
    },
    {
      question: "What's the difference between monthly and yearly?",
      answer: "Yearly prices are shown per month for comparison, along with the yearly total and the saving against twelve monthly payments, calculated from the listed prices.",
    },
  ];
}

export default async function PricingPage() {
  const plans = await getMarketingPlans();
  const trialDays = maxTrialDays(plans);
  const faqs = pricingFaqs(trialDays);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([softwareApplicationJsonLd(siteOrigin(), plans), faqJsonLd(faqs)]) }} />
      <section className="bg-gradient-to-b from-brand-soft/70 to-white pt-16 pb-6 sm:pt-20" aria-labelledby="pricing-title">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading as="h1" id="pricing-title" eyebrow="Pricing" title="Simple plans for every stage of your business" body={trialDays > 0 ? `Prices in Indian rupees. New stores start with a ${trialDays}-day free trial — no card details needed.` : "Prices in Indian rupees. No card details needed to sign up."} />
          <div className="mt-12">
            <PricingTable plans={plans} headingLevel="h2" />
          </div>
        </div>
      </section>
      <Section labelledBy="compare-title">
        <SectionHeading id="compare-title" title="Compare plans" body="Limits and features per plan, as enforced in your store." />
        <div className="mt-10">
          <PlanComparison plans={plans} />
        </div>
        <p className="mt-4 text-center text-sm text-muted">All plans include the theme editor, checkout, order management, discounts, GST invoices and cash on delivery.</p>
      </Section>
      <FaqSection faqs={faqs} title="Plans and billing" />
      <FinalCta trialDays={trialDays} />
    </>
  );
}
