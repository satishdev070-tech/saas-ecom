import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin, storeRootDomain } from "@/features/marketing-site/site";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { CTA_CREATE, PRICING_HREF, SIGNUP_HREF, THEMES_HREF } from "@/features/marketing-site/content";
import { ButtonLink, Container, SectionHeading } from "@/features/marketing-site/components/ui";
import { FinalCta } from "@/features/marketing-site/components/home-sections";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({
    title: "How it works",
    description: "From sign-up to your first sale: create an account, add your business details, pick a theme, add products, set up payments and shipping, and publish.",
    path: "/how-it-works",
    origin: siteOrigin(),
  });
}

type Guide = { title: string; body: string; needs?: string; link?: { href: string; label: string } };

function guide(rootDomain: string): Guide[] {
  return [
    { title: "Register", body: "Create your account with your email and a password, or with Google. If we ask you to confirm your email, open the link on the same device.", link: { href: SIGNUP_HREF, label: "Create your account" } },
    { title: "Enter your business details", body: `Add your business name and category, then choose your store's web address, such as yourstore.${rootDomain}. The address must be unique and some names are reserved.` },
    { title: "Select a theme", body: "Choose a design suited to your category. It's saved as a draft, so you can change it any time before or after you publish.", link: { href: THEMES_HREF, label: "Browse themes" } },
    { title: "Add products", body: "Add products with photos, prices, variants such as size or colour, and stock. Larger catalogues can be imported from a CSV file." },
    {
      title: "Configure payments and shipping",
      body: "Turn on cash on delivery, or connect your own Razorpay, Cashfree or PayU account for online payments. Then set your shipping rates and PIN code rules, or connect a courier such as Delhivery.",
      needs: "Online payments need your own account with a payment provider, and customers can't pay online until it's connected. Cash on delivery needs no provider account.",
    },
    {
      title: "Connect a custom domain (optional)",
      body: "On plans that include custom domains, add your domain in Settings → Domains and create the DNS records shown there. HTTPS is set up automatically once the domain is verified.",
      needs: "You need to own the domain and be able to edit its DNS records. DNS changes can take a few minutes to a few hours to spread.",
      link: { href: PRICING_HREF, label: "See which plans include custom domains" },
    },
    { title: "Preview and publish", body: "Preview your store on desktop and mobile. When everything looks right, publish it from your dashboard. Until then, visitors see a ‘coming soon’ page." },
  ];
}

export default async function HowItWorksPage() {
  const trialDays = maxTrialDays(await getMarketingPlans());
  const steps = guide(storeRootDomain());
  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft/70 to-white pt-16 pb-10 sm:pt-20">
        <Container>
          <SectionHeading as="h1" eyebrow="How it works" title="Your store, step by step" body="What setting up a Build Brighten store involves, including what you need to have ready." />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={SIGNUP_HREF} size="lg" track={{ id: "create_store", location: "how_it_works_page" }}>
              {CTA_CREATE}
            </ButtonLink>
            <ButtonLink href={THEMES_HREF} variant="secondary" size="lg" track={{ id: "explore_themes", location: "how_it_works_page" }}>
              Explore Themes
            </ButtonLink>
          </div>
        </Container>
      </section>
      <section className="pb-20" aria-label="Setup steps">
        <Container className="max-w-3xl">
          <ol className="relative space-y-6 border-l-2 border-brand-soft pl-8 sm:pl-10">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="absolute -left-[3.05rem] top-5 grid size-9 place-items-center rounded-full bg-brand font-brand text-sm font-bold text-white ring-4 ring-white sm:-left-[3.55rem]" aria-hidden>
                  {i + 1}
                </span>
                <article className="rounded-brand-lg border border-border bg-white p-6">
                  <h2 className="font-brand text-xl font-bold text-brand-ink">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h2>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                  {s.needs ? (
                    <p className="mt-4 flex gap-2.5 rounded-brand-md bg-brand-accent-soft px-4 py-3 text-sm text-brand-ink">
                      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <strong className="font-semibold">Before you start: </strong>
                        {s.needs}
                      </span>
                    </p>
                  ) : null}
                  {s.link ? (
                    <Link href={s.link.href} className="mt-4 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
                      {s.link.label} →
                    </Link>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <FinalCta trialDays={trialDays} />
    </>
  );
}
