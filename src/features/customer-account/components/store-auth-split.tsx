import type { ReactNode } from "react";
import { Heart, PackageCheck, Sparkles, Zap } from "lucide-react";
import type { ThemeConfig } from "@/features/theme/schema/config";
import { StoreImage } from "@/features/storefront/components/store-image";

/** The store's own hero art (first Hero slide of the published theme), for the auth visual. */
export function heroImageOf(theme: ThemeConfig): { path: string; alt: string } | null {
  for (const s of theme.templates.home) {
    if (s.type !== "Hero") continue;
    const slide = (s.settings as { slides?: { imagePath?: string; mobileImagePath?: string; alt?: string }[] }).slides?.[0];
    const path = slide?.mobileImagePath || slide?.imagePath;
    if (path) return { path, alt: slide?.alt ?? "" };
  }
  return null;
}

const BENEFITS = [
  { icon: PackageCheck, text: "Track orders and returns" },
  { icon: Heart, text: "Save your wishlist" },
  { icon: Zap, text: "Faster checkout with saved addresses" },
  { icon: Sparkles, text: "Early access to new drops and offers" },
];

/**
 * 60/40 shopper sign-in / sign-up inside the storefront chrome: the store's imagery and a short
 * brand message on the left (hidden on small screens), a short form on the right. Theme tokens only.
 */
export function StoreAuthSplit({ image, storeName, heading, text, showBenefits = false, children }: { image: { path: string; alt: string } | null; storeName: string; heading: string; text: string; showBenefits?: boolean; children: ReactNode }) {
  return (
    <div className="sf-container sf-section">
      <div className="grid overflow-hidden rounded-[var(--sf-radius-card)] @[64rem]:grid-cols-[3fr_2fr] @[64rem]:border @[64rem]:border-[var(--sf-border)]">
        <div className="relative hidden min-h-[560px] bg-[var(--sf-primary)] @[64rem]:block">
          {image ? <StoreImage path={image.path} alt={image.alt} sizes="60vw" /> : null}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-4 p-10 text-white">
            <p className="sf-eyebrow !text-white/80">{storeName}</p>
            <p className="sf-heading text-4xl leading-tight">{heading}</p>
            <p className="max-w-md text-sm text-white/85">{text}</p>
            {showBenefits ? (
              <ul className="grid gap-2.5 pt-2 text-sm @[80rem]:grid-cols-2">
                {BENEFITS.map((b) => (
                  <li key={b.text} className="flex items-center gap-2.5">
                    <b.icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                    {b.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col justify-center px-0 py-4 @[64rem]:px-12 @[64rem]:py-14">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
