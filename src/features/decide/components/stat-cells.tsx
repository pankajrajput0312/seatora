import { cn } from "@/lib/cn";
import { statCells, type StatCell } from "../lib/stat-format";
import type { ProgrammeTerms } from "../server/terms";
import { NBEMS_BOND_RULES, termDocs } from "./fees";
import { InfoTip } from "./info-tip";
import { SourceRef } from "./page-sources";

// One course's terms as number cells: Fee | Stipend | Bond | Bond ₹ | Leaving (lib/stat-format.ts says what each shows).
// Server- and client-safe (no "use client"; InfoTip and SourceRef are the client parts). Sources go to the page's one
// "Sources (N)" footer: each (i) cites them by number.

/** The (i) of one cell: its full value, then the exact words, each line with its source number. `of`: the row, for the button's name. */
function CellTip({ c, t, of }: { c: StatCell; t: ProgrammeTerms; of?: string }) {
  const doc = (n: number) => termDocs([{ sources: t.sources.filter((s) => s.n === n) }])[0];
  return (
    <InfoTip label={of ? `${c.about}, ${of}` : c.about}>
      {/* Spans only: the panel may sit inside a <p> (a card's meta line). */}
      <span className="block font-semibold">{c.label}: <span className="numeric">{c.full}</span></span>
      {c.tip.map((l, i) => {
        const d = l.src != null ? doc(l.src) : undefined;
        return (
          <span key={i} className={cn("mt-1 block", l.warn && "text-sun", l.quote && "border-l-2 border-border pl-2 text-muted-foreground")}>
            {l.text}
            {d && <SourceRef doc={d} />}
            {l.rules && NBEMS_BOND_RULES.map((r) => <SourceRef key={r.url} doc={{ name: r.label, url: r.url, type: "OFFICIAL" }} />)}
          </span>
        );
      })}
    </InfoTip>
  );
}

function Value({ c, full }: { c: StatCell; full?: boolean }) {
  // "₹1.5 Cr" never splits from its unit: a range wraps only after its dash.
  const v = (full ? c.full : c.short).replace(/ (L|Cr)\b/g, "\u00a0$1");
  return (
    <>
      <span className={cn("numeric", c.tone === "muted" ? "text-muted-foreground" : "font-semibold", c.tone === "bond" && "text-sun")}>
        {/* A short value ("₹50 L") is read out in full ("₹50,00,000"). */}
        {full || c.short === c.full ? v : <><span aria-hidden>{v}</span><span className="sr-only">{c.full}</span></>}
        {c.missing && <span className="sr-only"> (not in Seatora&apos;s data)</span>}
      </span>
      {c.marker && <span className={cn("ml-1 inline-block whitespace-nowrap text-[11px] font-normal", c.markerWarn ? "text-sun" : "text-muted-foreground")}>{c.marker}</span>}
    </>
  );
}

/**
 * card (default): a ruled strip of five cells, short values ("₹50 L"), value over its label and (i); at 390px Fee and
 * Stipend share the first row, the bond cells the second. table: five `<td>`s (`data-col`: the cell key) with full
 * values (`short`: the cards' short ones, read out in full; for a wide table), for a row whose header uses `statKeys` /
 * `statLabel`. `of`: the row ("AIIMS Delhi, MD Anaesthesiology"), so each (i) button is named "About fee, AIIMS Delhi, …".
 */
export function TermStatCells({ t, variant = "card", short, of, className, tdClassName }: { t: ProgrammeTerms; variant?: "card" | "table"; short?: boolean; of?: string; className?: string; tdClassName?: string }) {
  const cells = statCells(t);
  if (variant === "table") {
    return cells.map((c) => (
      <td key={c.key} data-col={c.key} className={cn("px-4 py-3 text-right align-top", tdClassName)}>
        <span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">
          <span><Value c={c} full={!short} /></span>
          <CellTip c={c} t={t} of={of} />
        </span>
      </td>
    ));
  }
  return (
    <dl className={cn("grid grid-cols-6 border-t border-border sm:grid-cols-5", className)}>
      {cells.map((c, i) => (
        <div
          key={c.key}
          className={cn(
            "flex min-w-0 flex-col-reverse justify-end gap-0.5 px-2 py-2 sm:col-span-1",
            i < 2 ? "col-span-3" : "col-span-2 border-t border-border sm:border-t-0",
            i === 2 ? "sm:border-l sm:border-border" : i > 0 && "border-l border-border",
          )}
        >
          <dt className="flex items-center gap-0.5 text-xs text-muted-foreground">
            {c.label}
            <CellTip c={c} t={t} of={of} />
          </dt>
          <dd className="text-sm leading-snug">
            <Value c={c} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
