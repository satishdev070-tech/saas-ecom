import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { listBlogPosts } from "@/features/storefront/server/content";
import { buildPageMetadata } from "@/features/storefront/seo";
import { paths } from "@/features/storefront/urls";
import { StoreImage } from "@/features/storefront/components/store-image";

export async function generateMetadata({ params }: PageProps<"/store/[host]/blog">): Promise<Metadata> {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  return buildPageMetadata({ primaryHost: sf.tenant.primaryHost, path: paths.blog(), title: "Journal", siteName: sf.store.name });
}

export default async function BlogIndex({ params, searchParams }: PageProps<"/store/[host]/blog">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  if (!sf.features.blog) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(500, Number(typeof sp.page === "string" ? sp.page : 1) || 1));
  const { posts, total } = await listBlogPosts(sf.tenant.tenantId, page);
  const pages = Math.ceil(total / 12);
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-heading mb-8 text-4xl">Journal</h1>
      {posts.length ? (
        <ul className="grid gap-8 @[48rem]:grid-cols-2 @[64rem]:grid-cols-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={paths.blogPost(p.slug)} className="group block space-y-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--sf-radius-card)]">
                  <StoreImage path={p.coverPath} alt="" sizes="(min-width: 1024px) 33vw, 100vw" className="transition group-hover:scale-105" />
                </div>
                {p.publishedAt ? <p className="sf-eyebrow">{new Date(p.publishedAt).toLocaleDateString("en-IN", { dateStyle: "long" })}</p> : null}
                <h2 className="sf-heading text-2xl">{p.title}</h2>
                {p.excerpt ? <p className="sf-muted text-sm">{p.excerpt}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted">No stories yet.</p>
      )}
      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex justify-center gap-3 text-sm">
          {page > 1 ? <Link href={`/blog?page=${page - 1}`} className="sf-btn sf-btn-outline min-h-10 py-2">Newer</Link> : null}
          {page < pages ? <Link href={`/blog?page=${page + 1}`} className="sf-btn sf-btn-outline min-h-10 py-2">Older</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
