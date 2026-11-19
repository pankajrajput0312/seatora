import { cn } from "@/lib/cn";
import { beCareful, costKeys, costLine, feeBandText, feeRange, MISSING_WORDS, NOT_PUBLISHED, statCells, statLabel, yearValue, type CostKey, type Level, type StatCell, type StatKey } from "../lib/stat-format";
import type { ProgrammeTerms } from "../server/terms";
import { NBEMS_BOND_RULES, termDocs } from "./fees";
import { InfoTip } from "./info-tip";
import { SourceRef } from "./page-sources";
import { ExamWords, PgOr } from "./round-name";

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
      {/* The bond row's plain line first, then the record's own words under "Source". */}
      {c.lead && (
        <>
          <span className="mt-1 block">{c.lead}</span>
          <span className="mt-2 block border-t border-border pt-1 font-semibold">Source</span>
        </>
      )}
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
  return (
    <span className={cn("numeric", c.tone === "muted" && !c.level ? "text-muted-foreground" : "font-semibold", c.level ? levelClass[c.level] : c.tone === "bond" && "text-sun")}>
      {/* A short value ("₹50 L") is read out in full ("₹50,00,000"). */}
      {full || c.short === c.full ? v : <><span aria-hidden>{v}</span><span className="sr-only">{c.full}</span></>}
      {/* The fee band is colour on screen: in words for screen readers (the (i) says it too). */}
      {c.key === "fee" && c.levelWord && <span className="sr-only"> ({c.levelWord})</span>}
    </span>
  );
}

/**
 * "below NBEMS min", "depends on specialty": beside the value on a card (under it when there is no room), on its own line in a table
 * (`block`: the column stays narrow). A long one wraps inside its cell, never past its rule.
 */
const Marker = ({ c, block }: { c: StatCell; block?: boolean }) =>
  c.marker && <span className={cn("text-xs leading-snug font-normal", block ? "block" : "ml-1 inline-block", c.markerWarn ? "text-sun" : "text-muted-foreground")}>{c.marker}</span>;

/**
 * One cell's value with its (i), the marker on the line under it (`tip={false}`: no (i), for a table whose header has
 * StatHead). For a cell of the page's own (Compare's rows); TermStatCells' table cells are this. `short`: the cards' value.
 */
export function StatCellView({ c, t, of, short, tip = true, wrap }: { c: StatCell; t: ProgrammeTerms; of?: string; short?: boolean; tip?: boolean; wrap?: boolean }) {
  // `wrap`: a narrow fixed column (Compare on a phone) wraps a long value at its spaces instead of running into the next.
  return (
    <>
      <span className={wrap ? "inline" : "inline-flex items-center gap-0.5"}>
        <Value c={c} full={!short} nb={!wrap} />
        {tip && <CellTip c={c} t={t} of={of} />}
      </span>
      <Marker c={c} block />
    </>
  );
}

/** A compact table's column notes (its header (i)): what the column is, in a sentence or two; the rest behind "More". */
const columnNote: Record<StatKey, [string, string]> = {
  fee: [
    "Year 1 fee for this course and quota, a year (/yr). Green a low fee, red a high one, for the course type.",
    "At admission (Year 1): MCC’s form gives only the amount paid at admission. Up to / ≤ ₹1.25 L: a DNB hospital that declared none; the most NBEMS lets it charge. " + feeBandText,
  ],
  stipend: ["Year 1 stipend a month (/mo). Amber: below the NBEMS minimum.", "From / ≥: the NBEMS minimum (the pay may be higher)."],
  bond: [
    "Years you must serve after the course: No bond, its years, or Not known (ask the college).",
    "No bond declared: a DNB hospital that declared no bond to MCC, which NBEMS's rule lets impose none this session (in the No bond filter). Not known: a document that says no bond while a state law's service may apply, or no record; the (i) says which. Colour: green no bond, amber 1-2 years, orange 3 years or more.",
  ],
  bondInr: [
    "What you pay if you do not serve the bond. Red: ₹25 L or more.",
    "≤ at most, ≥ at least, + more conditions in words. A short phrase (Refund stipend, Rest of course fee…): no ₹ figure. None: no bond (or none declared, where NBEMS's rule lets none be imposed).",
  ],
  leaving: ["What you pay (or the rule you face) if you leave the seat or course after joining. Red: ₹25 L or more.", "≤, ≥, + and the short phrases (Per state rule, No money penalty, Barred next year…): as for Bond penalty."],
};

/** The same for another exam's MCC institute profiles (NEET MDS, NEET SS): no NBEMS, DNB or MD/MS rules, no fee colours. */
const columnNoteOther: Record<StatKey, [string, string]> = {
  fee: ["Year 1 fee for this course and quota, a year (/yr), as the college's MCC institute profile declares it.", "At admission (Year 1): the amount the profile gives for admission. No colour: there are no fee bands for these courses."],
  stipend: ["Year 1 stipend a month (/mo), as the college's MCC institute profile declares it.", ""],
  bond: [
    "Years you must serve after the course: No bond, its years, or Not known (ask the college).",
    "No bond declared: a DrNB hospital that declared no bond to MCC, which NBEMS's rule lets impose none this session. Not known: a bond document Seatora couldn't read (read it before you lock your choices), a blank form or one with no clear bond, a D.M., M.Ch. or MDS seat with no bond declared, or no record; the (i) says which.",
  ],
  bondInr: columnNote.bondInr,
  leaving: columnNote.leaving,
};

/** Year 2 or 3's fee or stipend in a table column: the full figure, its marker under it; a 2-year course's year 3 says so. */
function YearCell({ t, pick, year, className }: { t: ProgrammeTerms; pick: "fee" | "stipend"; year: number; className: string }) {
  const v = yearValue(t, pick, year);
  return (
    <td data-col={`${pick}${year}`} className={className}>
      {!v ? (
        <span className="text-muted-foreground">—<span className="sr-only">not applicable: a {t.durationYears}-year course has no year {year}</span></span>
      ) : (
        <>
          <span className={cn("numeric", v.text === NOT_PUBLISHED ? "text-muted-foreground" : "font-semibold")}>{v.text.replace(/ /g, "\u00a0")}</span>
          {v.marker && <span className="block text-xs leading-snug font-normal text-muted-foreground">{v.marker}</span>}
        </>
      )}
    </td>
  );
}

/** A compact table's column header: "Fee" and one (i) for the whole column (the cells have none). */
export function StatHead({ k }: { k: StatKey }) {
  return (
    <span data-terms className="inline-flex items-center gap-0.5">
      {statLabel[k]}
      <InfoTip
        label={`${statLabel[k]} column`}
        more={<><PgOr pg={columnNote[k][1]} other={<ExamWords>{columnNoteOther[k][1]}</ExamWords>} /> {MISSING_WORDS} Each figure&apos;s exact words and sources: the cards, or the institute&apos;s Fees tab.</>}
      >
        <PgOr pg={columnNote[k][0]} other={<ExamWords>{columnNoteOther[k][0]}</ExamWords>} />
      </InfoTip>
    </span>
  );
}

/** "Be careful: bond penalty ₹40 L · bond 3 years" (lib/stat-format.ts beCareful); nothing when there is no reason. */
export function BeCareful({ cells, className }: { cells: StatCell[]; className?: string }) {
  const why = beCareful(cells);
  if (!why.length) return null;
  return (
    <p data-terms className={cn("text-xs", className)}>
      <span className="font-semibold text-ember">Be careful</span>: {why.join(" · ")}
    </p>
  );
}

/** A card summary's parts (lib/stat-format.ts costLine), in its order. */
export type SummaryKey = CostKey;
export const summaryKeys: SummaryKey[] = [...costKeys];
/** Each part as one string: a list compares them to say once what every card shares. */
export function summaryText(t: ProgrammeTerms, cells?: StatCell[]): Partial<Record<SummaryKey, string>> {
  return Object.fromEntries(Object.entries(costLine(t, cells)).map(([k, v]) => [k, v.text]));
}

/**
 * A card's cost in one plain line (costLine's parts but `hide`'s): "3-year fee ₹1.26 L · stipend ₹1.06 L/mo · bond 2 yr
 * or ₹40 L · leaving: barred next year", each part coloured as its cells. No (i)s: the cells, with every figure's words
 * and sources, are under the card's Details. `data-terms`: hidden for an exam with no fee data.
 */
export function TermSummary({ t, cells, hide, className }: { t: ProgrammeTerms; cells?: StatCell[]; hide?: Partial<Record<SummaryKey, unknown>>; className?: string }) {
  const parts = Object.entries(costLine(t, cells)).filter(([k]) => !hide?.[k as SummaryKey]);
  if (!parts.length) return null;
  return (
    <p data-terms className={cn("text-sm", className)}>
      {parts.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span aria-hidden className="text-muted-foreground"> · </span>}
          {i > 0 && <span className="sr-only">, </span>}
          <span className={cn("numeric", v.level ? cn("font-semibold", levelClass[v.level]) : v.text.includes("₹") ? "font-semibold" : "text-muted-foreground")}>{v.text}</span>
        </span>
      ))}
    </p>
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
export function TermStatCells({ t, variant = "card", short, of, className, tdClassName, years, total, keys, wrap }: { t: ProgrammeTerms; variant?: "card" | "table" | "compact"; short?: boolean; of?: string; className?: string; tdClassName?: string; years?: boolean; total?: boolean; /** Table cells in this order (Options: summary first). */ keys?: StatKey[]; /** Table values wrap at their spaces (a narrow column). */ wrap?: boolean }) {
  const all = statCells(t);
  const cells = variant !== "card" && keys ? keys.map((k) => all.find((c) => c.key === k)!) : all;
  if (variant !== "card") {
    // The default padding at zero specificity, so a caller's px-/py- wins whatever the CSS order.
    const td = cn("text-right align-top [:where(&)]:px-3 [:where(&)]:py-2", tdClassName);
    return cells.flatMap((c) => [
      <td key={c.key} data-col={c.key} className={td}>
        <StatCellView c={c} t={t} of={of} short={short || variant === "compact"} tip={variant === "table"} wrap={wrap} />
      </td>,
      // `years`: Fee and Stipend's years 2 and 3 as columns of their own (YearHeads), after year 1's cell.
      ...(years && (c.key === "fee" || c.key === "stipend") ? [2, 3].map((y) => <YearCell key={`${c.key}${y}`} t={t} pick={c.key as "fee" | "stipend"} year={y} className={td} />) : []),
      // `total`: the whole course's fee after the fee's years (FeeTotalHead), "—" when a year has no figure.
      ...(total && c.key === "fee" ? [<td key="feetotal" data-col="feetotal" className={td}>{t.wholeCourseFee != null ? <span className="numeric font-semibold">{feeRange(null, t.wholeCourseFee).replace(/ /g, "\u00a0")}</span> : <span className="text-muted-foreground">{NOT_PUBLISHED}</span>}</td>] : []),
    ]);
  }
  return (
    <dl data-terms className={cn("grid grid-cols-6 border-t border-border sm:grid-cols-5", className)}>
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
