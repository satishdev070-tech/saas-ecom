import { LoaderBrand } from "./route-progress";
import "./loader.css";

/**
 * Loading skeletons for the storefront route loading.tsx files, one per page type. They render
 * inside the store layout's <main> (header and footer stay), use only theme tokens, fade in after
 * a beat so quick navigations don't flash them, and stop shimmering under prefers-reduced-motion.
 */

function Shell({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="sf-loading sf-container sf-section" role="status" aria-busy="true" aria-label={label}>
      <LoaderBrand />
      <div className="mt-6">{children}</div>
    </div>
  );
}

const Skel = ({ className = "" }: { className?: string }) => <span aria-hidden className={`sf-skel ${className}`} />;
const Line = ({ className = "" }: { className?: string }) => <span aria-hidden className={`sf-skel sf-skel-line ${className}`} />;

function Cards({ count, className = "" }: { count: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-4 @[64rem]:grid-cols-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`space-y-3 ${i >= 2 ? "hidden @[64rem]:block" : ""}`}>
          <Skel className="aspect-[3/4] w-full" />
          <Line className="w-3/4" />
          <Line className="w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Home and generic pages: hero band plus a product row. */
export function HomeSkeleton() {
  return (
    <Shell>
      <Skel className="aspect-[4/5] w-full @[48rem]:aspect-[21/9]" />
      <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3">
        <Line className="h-5 w-2/3" />
        <Line className="w-1/2" />
      </div>
      <Cards count={4} className="mt-8" />
    </Shell>
  );
}

/** Collection, category and search listings: title, filter bar, product grid. */
export function ListingSkeleton() {
  return (
    <Shell label="Loading products">
      <Line className="h-6 w-48" />
      <div className="mt-6 flex gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <Cards count={8} className="mt-8" />
    </Shell>
  );
}

/** Product page: gallery and buy box. */
export function ProductSkeleton() {
  return (
    <Shell label="Loading product">
      <div className="grid gap-8 @[64rem]:grid-cols-2">
        <div className="space-y-3">
          <Skel className="aspect-[3/4] w-full" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skel key={i} className="aspect-square w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Line className="w-24" />
          <Line className="h-7 w-4/5" />
          <Line className="h-5 w-1/3" />
          <div className="flex gap-2 pt-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skel key={i} className="size-11 rounded-full" />
            ))}
          </div>
          <Skel className="mt-4 h-12 w-full rounded-[var(--sf-radius-btn)]" />
          <div className="space-y-2 pt-6">
            <Line className="w-full" />
            <Line className="w-11/12" />
            <Line className="w-2/3" />
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** Text pages (about, FAQ, blog, contact): heading and paragraphs. */
export function ArticleSkeleton() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-4">
        <Line className="h-7 w-2/3" />
        <Line className="w-1/4" />
        <Skel className="my-6 aspect-[16/7] w-full" />
        {["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-2/3"].map((w, i) => (
          <Line key={i} className={w} />
        ))}
      </div>
    </Shell>
  );
}

/** Cart, checkout, account and order pages: line items and a summary panel. */
export function PanelSkeleton() {
  return (
    <Shell>
      <Line className="h-6 w-40" />
      <div className="mt-8 grid gap-8 @[64rem]:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <Skel className="aspect-[3/4] w-20 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Line className="w-2/3" />
                <Line className="w-1/4" />
              </div>
            </div>
          ))}
        </div>
        <Skel className="h-56 w-full" />
      </div>
    </Shell>
  );
}
