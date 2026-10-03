import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PLATFORM_NAME } from "@/config/platform";
import { AppearanceToggle } from "@/components/ui/appearance-toggle";
import { cn } from "@/lib/cn";

/**
 * 60/40 authentication layout for platform users. The left panel carries brand/value content
 * (hidden below lg, where a compact brand row replaces it); the right panel holds the form.
 * `variant="console"` switches to the platform-staff visual system.
 */
export function AuthSplit({ variant, aside, children, back }: { variant: "merchant" | "console"; aside: ReactNode; children: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className={cn("grid min-h-dvh flex-1 lg:grid-cols-[3fr_2fr]", variant === "console" && "theme-console")}>
      <aside data-theme="dark" className={cn("relative hidden overflow-hidden lg:flex", variant === "merchant" ? "bg-[#17110e]" : "bg-[#080b10]")}>
        {variant === "merchant" ? <MerchantArt /> : <ConsoleArt />}
        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-[#f4efe9] xl:p-16">{aside}</div>
      </aside>
      <main className="flex min-w-0 flex-col bg-surface px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          {back ? (
            <Link href={back.href} className="inline-flex items-center gap-1.5 text-small text-muted hover:text-foreground">
              <ArrowLeft aria-hidden className="size-4" /> {back.label}
            </Link>
          ) : (
            <Link href="/" className="text-small font-semibold lg:invisible">
              {PLATFORM_NAME}
            </Link>
          )}
          <AppearanceToggle compact />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <footer className="flex flex-wrap justify-between gap-2 text-caption text-subtle">
          <span>© {new Date().getFullYear()} {PLATFORM_NAME}</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </span>
        </footer>
      </main>
    </div>
  );
}

/** Heading block shared by all auth forms. */
export function AuthHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-2 text-overline text-accent">{eyebrow}</p> : null}
      <h1 className="text-h1">{title}</h1>
      {description ? <p className="mt-2 text-body text-muted">{description}</p> : null}
    </div>
  );
}

/** Hand-block-print inspired motif: repeating stamped florets in madder and indigo on charcoal. */
function MerchantArt() {
  return (
    <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 900">
      <defs>
        <pattern id="floret" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
          <g transform="translate(60 60)">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse key={a} cx="0" cy="-12" rx="5.5" ry="10" transform={`rotate(${a})`} fill="#a4432a" opacity=".5" />
            ))}
            <circle r="5" fill="#d9a441" opacity=".7" />
            <circle r="2" fill="#17110e" />
          </g>
          <g transform="translate(0 0)" fill="#3c5a8a" opacity=".45">
            <circle r="3" />
          </g>
          <g transform="translate(120 120)" fill="#3c5a8a" opacity=".45">
            <circle r="3" />
          </g>
        </pattern>
        <radialGradient id="fade" cx="30%" cy="35%" r="85%">
          <stop offset="0" stopColor="#17110e" stopOpacity=".2" />
          <stop offset=".65" stopColor="#17110e" stopOpacity=".85" />
          <stop offset="1" stopColor="#17110e" />
        </radialGradient>
      </defs>
      <rect width="800" height="900" fill="url(#floret)" opacity=".5" />
      <rect width="800" height="900" fill="url(#fade)" />
    </svg>
  );
}

/** Security visual: fine grid, concentric rings and a few connected nodes. */
function ConsoleArt() {
  return (
    <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 900">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0v40" fill="none" stroke="#1d2533" strokeWidth="1" />
        </pattern>
        <radialGradient id="glow" cx="72%" cy="38%" r="55%">
          <stop offset="0" stopColor="#2f5bd3" stopOpacity=".28" />
          <stop offset="1" stopColor="#080b10" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="900" fill="url(#grid)" />
      <rect width="800" height="900" fill="url(#glow)" />
      <g fill="none" stroke="#3d5a9e" strokeOpacity=".35">
        {[90, 160, 230, 300].map((r) => (
          <circle key={r} cx="580" cy="340" r={r} />
        ))}
      </g>
      <g stroke="#7ea2ff" strokeOpacity=".5" strokeWidth="1.2">
        <path d="M580 340 L470 200 M580 340 L700 250 M580 340 L660 520 M580 340 L420 470" />
      </g>
      <g fill="#7ea2ff">
        {[
          [580, 340, 6],
          [470, 200, 3.5],
          [700, 250, 3.5],
          [660, 520, 3.5],
          [420, 470, 3.5],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
    </svg>
  );
}
