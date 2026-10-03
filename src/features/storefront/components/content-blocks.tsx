import Link from "next/link";
import type { ContentBlock } from "@/features/content/blocks";
import { StoreImage } from "./store-image";

/** Renders validated structured content blocks. Never renders raw HTML. */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="sf-prose space-y-5">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const H = (`h${b.level}` as "h2" | "h3" | "h4");
            return (
              <H key={i} className="sf-heading text-2xl">
                {b.text}
              </H>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-line leading-relaxed">
                {b.text}
              </p>
            );
          case "image":
            return (
              <figure key={i}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--sf-radius-card)]">
                  <StoreImage path={b.path} alt={b.alt} sizes="(min-width: 768px) 720px, 100vw" />
                </div>
                {b.caption ? <figcaption className="sf-muted mt-2 text-sm">{b.caption}</figcaption> : null}
              </figure>
            );
          case "list": {
            const L = b.style === "number" ? "ol" : "ul";
            return (
              <L key={i} className={b.style === "number" ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </L>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="sf-border border-l-2 pl-4 italic">
                <p>{b.text}</p>
                {b.cite ? <footer className="sf-muted mt-1 text-sm not-italic">— {b.cite}</footer> : null}
              </blockquote>
            );
          case "button":
            return (
              <p key={i}>
                <Link href={b.href} className={b.style === "secondary" ? "sf-btn sf-btn-outline" : "sf-btn"}>
                  {b.label}
                </Link>
              </p>
            );
          case "divider":
            return <hr key={i} className="sf-border" />;
        }
      })}
    </div>
  );
}
