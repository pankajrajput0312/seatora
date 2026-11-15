import { cn } from "@/lib/cn";
import { statCells, statLabel, type StatCell, type StatKey } from "../lib/stat-format";
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

/** The value: short ("₹50 L", read out in full) or full. `nb`: it breaks only after a range's dash (a table cell). */
function Value({ c, full, nb }: { c: StatCell; full?: boolean; nb?: boolean }) {
  const raw = full ? c.full : c.short;
  // "₹1.5 Cr" never splits from its unit; in a table nothing splits but a range ("₹10 L–₹20 L" wraps after its dash).
  const v = nb ? raw.replace(/ /g, "\u00a0") : raw.replace(/ (L|Cr)\b/g, "\u00a0$1");
  return (
    <span className={cn("numeric", c.tone === "muted" ? "text-muted-foreground" : "font-semibold", c.tone === "bond" && "text-sun")}>
      {/* A short value ("₹50 L") is read out in full ("₹50,00,000"). */}
      {full || c.short === c.full ? v : <><span aria-hidden>{v}</span><span className="sr-only">{c.full}</span></>}
      {c.missing && <span className="sr-only"> (not in Seatora&apos;s data)</span>}
    </span>
  );
}

/**
 * "max", "state rule": beside the value on a card (under it when there is no room), on its own line in a table
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
  fee: "Year 1 fee a year for this course and quota. max: the most NBEMS lets a DNB hospital charge, not the college's own fee. above NBEMS max: the hospital declared more than that. GST removed: the college's figure less the 18% GST NBEMS withdrew. at admission: paid when joining. See text: in words only. —: not in Seatora's data.",
  stipend: "Year 1 stipend a month. min: the NBEMS minimum (the pay may be higher). below NBEMS min: declared below it. + DA: plus dearness allowance. NMC list: one figure for every PG year. See text: in words only. —: not in Seatora's data.",
  bond: "Service bond years (1Y: one year). Yes: a bond, years not stated. state rule: the years are the state's rule, not the college's own document's. + state rule: a state rule applies as well. NBEMS rule: no bond at a private DNB hospital. caveat: no bond, with a doubt in the (i). Unknown · state law may apply: the document says no bond, but a state law's service may apply. Unknown or —: not declared or not checked, never read as no bond.",
  bondInr: "What you pay if you do not serve the bond. state rule: the state rule's amount. by specialty: a range over the subjects. computed: per year × years, by Seatora. incl. additional: an amount owed on top included. + words: part in words only. None: no bond. Unknown or —: not known.",
  leaving: "The college's or state's penalty for leaving the seat or course after joining. by specialty, + words: as for Bond ₹. See text: in words only. —: not in Seatora's data.",
};

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
export function TermStatCells({ t, variant = "card", short, of, className, tdClassName }: { t: ProgrammeTerms; variant?: "card" | "table" | "compact"; short?: boolean; of?: string; className?: string; tdClassName?: string }) {
  const cells = statCells(t);
  if (variant !== "card") {
    return cells.map((c) => (
      // The default padding at zero specificity, so a caller's px-/py- wins whatever the CSS order.
      <td key={c.key} data-col={c.key} className={cn("text-right align-top [:where(&)]:px-3 [:where(&)]:py-3", tdClassName)}>
        <StatCellView c={c} t={t} of={of} short={short || variant === "compact"} tip={variant === "table"} />
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
            <Marker c={c} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
