import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for AI-written text (Decision briefs): headings, paragraphs,
 * bullet/numbered lists, blockquotes, tables, **bold**, *italic* and `code`.
 * Builds React elements only (never raw HTML), so model output can't inject markup.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  const collect = (test: (line: string) => boolean) => {
    const taken: string[] = [];
    while (i < lines.length && test(lines[i])) taken.push(lines[i++]);
    return taken;
  };

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blocks.length}`;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      i++;
      const level = heading[1].length;
      const content = inline(heading[2], key);
      blocks.push(
        level <= 2 ? (
          <h3 key={key} className="mt-5 font-heading text-base font-semibold first:mt-0">
            {content}
          </h3>
        ) : (
          <h4 key={key} className="mt-4 text-sm font-semibold first:mt-0">
            {content}
          </h4>
        ),
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = collect((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="border-l-2 pl-3 text-muted-foreground italic">
          {quote.map((q, j) => (
            <p key={j}>{inline(q, `${key}-${j}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = collect((l) => /^\s*[-*+]\s+/.test(l));
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it.replace(/^\s*[-*+]\s+/, ""), `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = collect((l) => /^\s*\d+[.)]\s+/.test(l));
      blocks.push(
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it.replace(/^\s*\d+[.)]\s+/, ""), `${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows = collect((l) => l.trim().startsWith("|")).map(cells);
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                {header.map((h, j) => (
                  <th key={j} className="py-1.5 pr-3 font-medium">
                    {inline(h, `${key}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b last:border-0 align-top">
                  {row.map((c, j) => (
                    <td key={j} className="py-1.5 pr-3">
                      {inline(c, `${key}-${r}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const para = collect(
      (l) =>
        l.trim() !== "" &&
        !/^(#{1,6})\s/.test(l) &&
        !/^\s*(>|[-*+]\s|\d+[.)]\s|\|)/.test(l),
    );
    if (para.length === 0) {
      // A lone line that looked like a block start but wasn't (e.g. "|" without a table).
      para.push(lines[i++]);
    }
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }

  return <div className="space-y-3 text-sm leading-relaxed">{blocks}</div>;
}
