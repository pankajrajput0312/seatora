import { cn } from "@/lib/cn";
import { feeBandText, statCells, statLabel, yearValue, type Level, type StatCell, type StatKey } from "../lib/stat-format";
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
            {l.href ? <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sky underline">{l.text}<span className="sr-only"> (opens in a new tab)</span></a> : l.text}
            {d && <SourceRef doc={d} />}
            {l.rules && NBEMS_BOND_RULES.map((r) => <SourceRef key={r.url} doc={{ name: r.label, url: r.url, type: "OFFICIAL" }} />)}
          </span>
        );
      })}
    </InfoTip>
  );
}

/** A value's colour by its level (lib/stat-format.ts Level; the colour key: colour-legend.tsx). */
export const levelClass: Record<Level, string> = { good: "text-leaf", caution: "text-sun", strong: "text-flame", heavy: "text-ember" };

/** The value: short ("₹50 L", read out in full) or full. `nb`: it breaks only after a range's dash (a table cell). */
function Value({ c, full, nb }: { c: StatCell; full?: boolean; nb?: boolean }) {
  const raw = full ? c.full : c.short;
  // "₹1.5 Cr" never splits from its unit; in a table nothing splits but a range ("₹10 L–₹20 L" wraps after its dash).
  const v = nb ? raw.replace(/ /g, "\u00a0") : raw.replace(/ (L|Cr)\b/g, "\u00a0$1");
  if (c.href)
    return (
      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">
        {raw}<span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  return (
    <span className={cn("numeric", c.tone === "muted" && !c.level ? "text-muted-foreground" : "font-semibold", c.level ? levelClass[c.level] : c.tone === "bond" && "text-sun")}>
      {/* A short value ("₹50 L") is read out in full ("₹50,00,000"). */}
      {full || c.short === c.full ? v : <><span aria-hidden>{v}</span><span className="sr-only">{c.full}</span></>}
      {c.missing && <span className="sr-only"> (not in Seatora&apos;s data)</span>}
      {/* The fee band is colour on screen: in words for screen readers (the (i) says it too). */}
      {c.key === "fee" && c.levelWord && <span className="sr-only"> ({c.levelWord})</span>}
    </span>
  );
}

/**
 * "below NBEMS min", "state law may apply" (the only two): beside the value on a card (under it when there is no room), on its own line in a table
 * (`block`: the column stays narrow). A long one ("state law may apply") wraps inside its cell, never past its rule.
 */
const Marker = ({ c, block }: { c: StatCell; block?: boolean }) =>
  c.marker && <span className={cn("text-[11px] leading-snug font-normal", block ? "block" : "ml-1 inline-block", c.markerWarn ? "text-sun" : "text-muted-foreground")}>{c.marker}</span>;

/**
 * One cell's value with its (i), the marker on the line under it (`tip={false}`: no (i), for a table whose header has
 * StatHead). For a cell of the page's own (Compare's rows); TermStatCells' table cells are this. `short`: the cards' value.
 */
export function StatCellView({ c, t, of, short, tip = true }: { c: StatCell; t: ProgrammeTerms; of?: string; short?: boolean; tip?: boolean }) {
  return (
    <>
      <span className="inline-flex items-center gap-0.5">
        <Value c={c} full={!short} nb />
        {tip && <CellTip c={c} t={t} of={of} />}
      </span>
      <Marker c={c} block />
    </>
  );
}

/** A compact table's column notes (its header (i)): what the values and markers mean. */
const columnNote: Record<StatKey, string> = {
  fee: "Year 1 fee a year for this course and quota. Up to / ≤ ₹1.25 L: a DNB hospital that declared none; the most NBEMS lets it charge. Varies by subject, On college website, Ask college: the profile gives no one figure for these seats (its words are in the institute's Fees tab). —: not in Seatora's data. Colour: green a low fee, red a high one, for the course type (" + feeBandText + ").",
  stipend: "Year 1 stipend a month. From / ≥: the NBEMS minimum (the pay may be higher). below NBEMS min: declared below it. Ask college: no figure published. —: not in Seatora's data. Colour: amber below the NBEMS minimum.",
  bond: "Service bond years (1Y: one year). Yes: a bond, years not stated. Not published: no bond declared, or no clear answer; never read as no bond. state law may apply: the document says no bond, but a state law's service may apply. —: not checked. Colour: green no bond, amber 1-2 years, orange 3 years or more, grey not published.",
  bondInr: "What you pay if you do not serve the bond. ≤ at most, ≥ at least; a range where it varies by specialty; + more conditions. A short phrase (Refund stipend, Rest of course fee, Ask college…): no ₹ figure. None: no bond. Colour: red ₹25 L or more, amber below that, green none.",
  leaving: "The college's or state's penalty for leaving the seat or course after joining. ≤, ≥, + and the short phrases (Per state rule, No money penalty…): as for Bond penalty. —: not in Seatora's data. Colour: red ₹25 L or more.",
};

/** Year 2 or 3's fee or stipend in a table column: the full figure, its marker under it; a 2-year course's year 3 says so. */
function YearCell({ t, pick, year, className }: { t: ProgrammeTerms; pick: "fee" | "stipend"; year: number; className: string }) {
  const v = yearValue(t, pick, year);
  return (
    <td data-col={`${pick}${year}`} className={className}>
      {!v ? (
        <span className="text-muted-foreground">—<span className="sr-only">no year {year}: a {t.durationYears}-year course</span></span>
      ) : (
        <>
          <span className={cn("numeric", v.text === "—" ? "text-muted-foreground" : "font-semibold")}>
            {v.text.replace(/ /g, "\u00a0")}
            {v.text === "—" && <span className="sr-only"> (not stated)</span>}
          </span>
          {v.marker && <span className="block text-[11px] leading-snug font-normal text-muted-foreground">{v.marker}</span>}
        </>
      )}
    </td>
  );
}

/** A compact table's column header: "Fee" and one (i) for the whole column (the cells have none). */
export function StatHead({ k }: { k: StatKey }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {statLabel[k]}
      <InfoTip label={`${statLabel[k]} column`}>
        {columnNote[k]} Each figure&apos;s exact words and sources: the cards, or the institute&apos;s Fees tab.
      </InfoTip>
    </span>
  );
}

/**
 * card (default): a ruled strip of five cells, short values ("₹50 L"), value over its label and (i); at 390px Fee and
 * Stipend share the first row, the bond cells the second. table: five `<td>`s (`data-col`: the cell key) with full
 * values (`short`: the cards' short ones, read out in full) and an (i) each, for a row whose header uses `statKeys` /
 * `statLabel`. compact: short values and no (i) per cell, under StatHead headers (one (i) a column), for a long table.
 * Table cells break only after a range's dash, their marker on its own line; `tdClassName`'s padding wins over theirs.
 * `of`: the row ("AIIMS Delhi, MD Anaesthesiology"), so each (i) button is named "About fee, AIIMS Delhi, …".
 */
export function TermStatCells({ t, variant = "card", short, of, className, tdClassName, years }: { t: ProgrammeTerms; variant?: "card" | "table" | "compact"; short?: boolean; of?: string; className?: string; tdClassName?: string; years?: boolean }) {
  const cells = statCells(t);
  if (variant !== "card") {
    // The default padding at zero specificity, so a caller's px-/py- wins whatever the CSS order.
    const td = cn("text-right align-top [:where(&)]:px-3 [:where(&)]:py-2", tdClassName);
    return cells.flatMap((c) => [
      <td key={c.key} data-col={c.key} className={td}>
        <StatCellView c={c} t={t} of={of} short={short || variant === "compact"} tip={variant === "table"} />
      </td>,
      // `years`: Fee and Stipend's years 2 and 3 as columns of their own (YearHeads), after year 1's cell.
      ...(years && (c.key === "fee" || c.key === "stipend") ? [2, 3].map((y) => <YearCell key={`${c.key}${y}`} t={t} pick={c.key as "fee" | "stipend"} year={y} className={td} />) : []),
    ]);
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
          <dd className="text-[0.9375rem] leading-snug sm:text-sm">
            <Value c={c} />
            <Marker c={c} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
