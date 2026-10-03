import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { getPagesByKind } from "@/features/storefront/server/content";
import { formatAddress, telHref, whatsappUrl } from "@/features/storefront/store-profile";
import { paths } from "@/features/storefront/urls";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage({ params }: PageProps<"/store/[host]/contact">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const s = sf.store;
  const [contactPages, policies] = await Promise.all([getPagesByKind(sf.tenant.tenantId, "contact"), getPagesByKind(sf.tenant.tenantId, "policy")]);
  const wa = whatsappUrl(s.whatsapp);
  const address = formatAddress(s.address);
  return (
    <div className="sf-container sf-section mx-auto max-w-3xl space-y-8">
      <h1 className="sf-heading text-4xl">Contact us</h1>
      <dl className="grid gap-6 @[48rem]:grid-cols-2">
        {s.email ? (
          <div>
            <dt className="sf-eyebrow">Email</dt>
            <dd className="mt-1">
              <a href={`mailto:${s.email}`} className="sf-link">{s.email}</a>
            </dd>
          </div>
        ) : null}
        {s.phone && telHref(s.phone) ? (
          <div>
            <dt className="sf-eyebrow">Phone</dt>
            <dd className="mt-1">
              <a href={telHref(s.phone)!} className="sf-link">{s.phone}</a>
            </dd>
          </div>
        ) : null}
        {wa ? (
          <div>
            <dt className="sf-eyebrow">WhatsApp</dt>
            <dd className="mt-1">
              <a href={wa} rel="noopener noreferrer" target="_blank" className="sf-link">Chat with us</a>
            </dd>
          </div>
        ) : null}
        {address.length ? (
          <div>
            <dt className="sf-eyebrow">Address</dt>
            <dd className="mt-1">
              <address className="not-italic">{address.join(", ")}</address>
            </dd>
          </div>
        ) : null}
      </dl>
      {[...contactPages, ...policies].length ? (
        <ul className="flex flex-wrap gap-2">
          {[...contactPages, ...policies].map((p) => (
            <li key={p.slug}>
              <Link href={paths.page(p.slug)} className="sf-badge">{p.title}</Link>
            </li>
          ))}
          <li>
            <Link href={paths.faq()} className="sf-badge">FAQs</Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
