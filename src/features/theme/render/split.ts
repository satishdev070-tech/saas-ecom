import type { SectionInstance } from "@/features/theme/sections/types";

/** Splits a collection/product template at the PageContent marker: [before, after]. No marker → all after. */
export function splitAtPageContent(sections: SectionInstance[]): [SectionInstance[], SectionInstance[]] {
  const i = sections.findIndex((x) => x.type === "PageContent");
  return i < 0 ? [[], sections] : [sections.slice(0, i), sections.slice(i + 1)];
}
