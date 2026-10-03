/**
 * Renders plain product copy nicely: blank-line separated paragraphs, "•"/"-" lines as bullet
 * lists (a lone "•" line is joined to the text after it), and short "Heading:"-style lines bold.
 * Pure and server-safe; never renders HTML from the text.
 */
type Block = { kind: "p" | "h"; text: string } | { kind: "ul"; items: string[] };

export function parseRichText(input: string): Block[] {
  const lines = input.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const joined: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^[•·\-*]$/.test(l)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      if (j < lines.length) {
        joined.push(`• ${lines[j]}`);
        i = j;
        continue;
      }
    }
    joined.push(l);
  }
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const l of joined) {
    const bullet = l.match(/^[•·\-*]\s+(.+)$/);
    if (!l) {
      flush();
    } else if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(bullet[1]!);
      else blocks.push({ kind: "ul", items: [bullet[1]!] });
    } else if (l.length <= 40 && !/[.!?,]$/.test(l) && !/:\s*\S/.test(l) && /^[A-Z]/.test(l)) {
      flush();
      blocks.push({ kind: "h", text: l.replace(/:$/, "") });
    } else {
      para.push(l);
    }
  }
  flush();
  return blocks;
}

export function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[var(--sf-accent)]">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : b.kind === "h" ? (
          <p key={i} className="pt-1 font-medium text-[var(--sf-text)]">
            {b.text}
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}
