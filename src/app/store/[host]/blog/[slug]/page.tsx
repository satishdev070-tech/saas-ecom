import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { getBlogPostBySlug } from "@/features/storefront/server/content";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";
import { buildPageMetadata, jsonLdString, toDescription } from "@/features/storefront/seo";
import { canonicalUrl, paths } from "@/features/storefront/urls";
import { assetUrl } from "@/lib/storage/assets";
import { ContentBlocks } from "@/features/storefront/components/content-blocks";
import { Breadcrumbs } from "@/features/storefront/components/breadcrumbs";
import { StoreImage } from "@/features/storefront/components/store-image";

export async function generateMetadata({ params }: PageProps<"/store/[host]/blog/[slug]">): Promise<Metadata> {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const post = await getBlogPostBySlug(sf.tenant.tenantId, slug);
  if (!post) return {};
  return buildPageMetadata({
    primaryHost: sf.tenant.primaryHost,
    path: paths.blogPost(post.slug),
    title: post.seo.title || post.title,
    description: toDescription(post.seo.description || post.excerpt),
    imageUrl: assetUrl(post.seo.ogImagePath || post.coverPath),
    siteName: sf.store.name,
    type: "article",
    noindex: post.seo.noindex,
  });
}

export default async function BlogPostPage({ params }: PageProps<"/store/[host]/blog/[slug]">) {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  if (!sf.features.blog) notFound();
  const post = await getBlogPostBySlug(sf.tenant.tenantId, slug);
  if (!post) return redirectOrNotFound(sf.tenant.tenantId, paths.blogPost(slug));
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    author: post.authorName ? { "@type": "Person", name: post.authorName } : { "@type": "Organization", name: sf.store.name },
    image: assetUrl(post.coverPath) ?? undefined,
    mainEntityOfPage: canonicalUrl(sf.tenant.primaryHost, paths.blogPost(post.slug)),
  };
  return (
    <article className="sf-container sf-section mx-auto max-w-3xl space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <Breadcrumbs primaryHost={sf.tenant.primaryHost} items={[{ name: "Home", path: "/" }, { name: "Journal", path: paths.blog() }, { name: post.title, path: paths.blogPost(post.slug) }]} />
      <header className="space-y-3">
        {post.publishedAt ? <p className="sf-eyebrow">{new Date(post.publishedAt).toLocaleDateString("en-IN", { dateStyle: "long" })}</p> : null}
        <h1 className="sf-heading text-4xl @[64rem]:text-5xl">{post.title}</h1>
        {post.authorName ? <p className="sf-muted text-sm">By {post.authorName}</p> : null}
      </header>
      {post.coverPath ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--sf-radius-card)]">
          <StoreImage path={post.coverPath} alt="" sizes="(min-width: 768px) 768px, 100vw" priority />
        </div>
      ) : null}
      <ContentBlocks blocks={post.blocks} />
    </article>
  );
}
