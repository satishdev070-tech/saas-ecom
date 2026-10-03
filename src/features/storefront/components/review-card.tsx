import Link from "next/link";
import type { Review } from "@/features/storefront/server/content";
import { paths } from "@/features/storefront/urls";
import { StoreImage } from "./store-image";

/** Review UI in the familiar "maps review" style: initial avatar, name, relative date, gold stars. */

const AVATAR = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#12b5cb", "#9334e6", "#f29900"];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length]!;
}

export function relativeDate(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

export function GoldStars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - (i - 1)));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`g${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="#fbbc04" />
                <stop offset={`${fill * 100}%`} stopColor="#dadce0" />
              </linearGradient>
            </defs>
            <path fill={`url(#g${i}-${Math.round(fill * 100)})`} d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        );
      })}
    </span>
  );
}

export function ReviewCard({ review, showProduct = true }: { review: Review; showProduct?: boolean }) {
  const initial = review.authorName.trim().charAt(0).toUpperCase() || "?";
  return (
    <article className="sf-review-card flex h-full flex-col">
      <header className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-base font-medium text-white" style={{ background: avatarColor(review.authorName) }}>
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{review.authorName}</p>
          <p className="sf-muted text-xs">{relativeDate(review.createdAt)}</p>
        </div>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GoldStars rating={review.rating} />
        {review.sample ? <span className="sf-review-tag sf-review-tag-sample">Sample review</span> : review.verified ? <span className="sf-review-tag">✓ Verified buyer</span> : null}
      </div>
      {review.title ? <p className="mt-2 text-sm font-semibold">{review.title}</p> : null}
      {review.body ? <p className="mt-1.5 line-clamp-5 flex-1 text-sm leading-relaxed text-[color-mix(in_srgb,var(--sf-text)_82%,transparent)]">{review.body}</p> : <div className="flex-1" />}
      {showProduct && review.product ? (
        <Link href={paths.product(review.product.slug)} className="sf-border mt-4 flex items-center gap-2 border-t pt-3 text-xs">
          {review.product.imagePath ? (
            <span className="relative size-9 shrink-0 overflow-hidden rounded">
              <StoreImage path={review.product.imagePath} alt="" sizes="36px" />
            </span>
          ) : null}
          <span className="sf-link-quiet line-clamp-1">{review.product.title}</span>
        </Link>
      ) : null}
    </article>
  );
}

export function ReviewSummary({ average, count, className = "" }: { average: number; count: number; className?: string }) {
  if (!count) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="sf-heading text-4xl leading-none">{average.toFixed(1)}</span>
      <span className="space-y-1">
        <GoldStars rating={average} size={18} />
        <span className="sf-muted block text-xs">
          Based on {count} review{count === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  );
}
