import Link from "next/link";
import type { ReactNode } from "react";

// A tiny markdown renderer for the assistant's answers: paragraphs, ### headings, lists, tables, fenced blocks, **bold**,
// _italic_, `code` and [links](...). It builds React elements (text is escaped by React), never HTML strings. Links: only
// Seatora paths (/decide…) and https URLs; anything else stays plain text.

/** A safe href, or null: a site path (not "//host") or an https URL. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?![/\\])/.test(h)) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])_([^_]+)_(?!\w))/g;

export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2] != null) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3] != null) out.push(<code key={k} className="rounded bg-muted px-1 text-[0.9em]">{m[3]}</code>);
    else if (m[4] != null) {
      const href = safeHref(m[5]);
      if (!href) out.push(m[4]);
      else if (href.startsWith("/")) out.push(<Link key={k} href={href} className="text-sky underline decoration-sky/40 underline-offset-2 hover:decoration-sky">{m[4]}</Link>);
      else out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-sky underline decoration-sky/40 underline-offset-2 hover:decoration-sky">{m[4]}</a>);
    } else if (m[6] != null) out.push(<em key={k}>{inline(m[6], k)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);

export type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; title: string; text: string };

/** Lines → blocks (pure; tested). An unclosed fence (mid-stream) runs to the end. */
export function blocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^```\s*(.*)$/.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      out.push({ kind: "code", title: fence[1], text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push({ kind: "table", head, rows });
      continue;
    }
    const li = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const kind = /\d/.test(li[1]) ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && (/\d/.test(m[1]) ? "ol" : "ul") === kind) items.push(m[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      out.push({ kind, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+[.)])\s)/.test(lines[i]) && !(lines[i].trim().startsWith("|") && isRule(lines[i + 1] ?? ""))) para.push(lines[i++]);
    out.push({ kind: "p", text: para.join("\n") });
  }
  return out;
}

export function Markdown({ text, codeAction }: { text: string; codeAction?: (b: { title: string; text: string }) => ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3 text-[0.9375rem] leading-relaxed break-words">
      {blocks(text).map((b, n) => {
        const k = `b${n}`;
        switch (b.kind) {
          case "h":
            return <p key={k} className={b.level <= 2 ? "mt-2 text-lg leading-snug font-bold tracking-tight" : b.level === 3 ? "mt-1 font-semibold" : "text-sm font-semibold text-muted-foreground"}>{inline(b.text, k)}</p>;
          case "p":
            return <p key={k} className="whitespace-pre-line">{inline(b.text, k)}</p>;
          case "ul":
          case "ol": {
            const L = b.kind;
            return (
              <L key={k} className={`grid gap-1.5 pl-5 marker:text-muted-foreground ${L === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((it, j) => <li key={j} className="pl-1">{inline(it, `${k}-${j}`)}</li>)}
              </L>
            );
          }
          case "table":
            return (
              <div key={k} tabIndex={0} role="region" aria-label="Table, scrolls sideways" className="max-w-full overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>{b.head.map((c, j) => <th key={j} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">{inline(c, `${k}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t border-border align-top even:bg-muted/50">
                        {r.map((c, x) => <td key={x} className={`numeric px-3 py-2 ${c.length > 14 ? "min-w-[10rem]" : "whitespace-nowrap"}`}>{inline(c, `${k}-${j}-${x}`)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <div key={k} className="rounded-lg border border-border bg-muted">
                  {(b.title || codeAction) && (
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                      <span>{b.title}</span>
                      {codeAction?.(b)}
                    </div>
                  )}
                  <pre className="overflow-x-auto px-3 py-2 text-sm whitespace-pre-wrap">{b.text}</pre>
              </div>
            );
        }
      })}
    </div>
  );
}
