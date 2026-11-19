import { cn } from "@/lib/cn";
import { bondFlag, feeBandText, feeRange, statCells, statLabel, yearValue, type Level, type StatCell, type StatKey } from "../lib/stat-format";
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
      {c.missing && <span className="sr-only"> (none published)</span>}
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

/** A compact table's column notes (its header (i)): what the values and markers mean. */
const columnNote: Record<StatKey, string> = {
  fee: "Year 1 fee for this course and quota: /yr a fee a year (year 1’s may be paid at admission); at admission (Year 1): MCC’s form gives the amount paid at admission, and later years differ or are not stated. Up to / ≤ ₹1.25 L: a DNB hospital that declared none; the most NBEMS lets it charge. Varies by subject, On college website, Not stated: the profile gives no one figure for these seats (its words are in the institute’s Fees tab). A range (₹1–40 L): the profile gives only the range across subjects (depends on specialty). —: none published. Colour: green a low fee, red a high one, for the course type (" + feeBandText + ").",
  stipend: "Year 1 stipend a month (/mo). From / ≥: the NBEMS minimum (the pay may be higher). below NBEMS min: declared below it. Not stated: no figure published. —: none published. Colour: amber below the NBEMS minimum.",
  bond: "Service bond years: one of three. No bond: a document says none. A stated bond: its years (1Y: one year; Bond, years not stated). Not known: no bond declared to MCC (a DNB hospital that declared none: NBEMS lets it impose none this session), a document that says no bond while a state law's service may apply, or no record; the (i) says which, and filters count it as not published. Colour: green no bond, amber 1-2 years, orange 3 years or more, grey not known.",
  bondInr: "What you pay if you do not serve the bond. ≤ at most, ≥ at least; a range where it varies (depends on specialty, when the record prices it by specialty); + more conditions. A short phrase (Refund stipend, Rest of course fee, Not stated…): no ₹ figure. None: no bond. Not known: the bond is not known. Colour: red ₹25 L or more, amber below that, green none.",
  leaving: "The college's or state's penalty for leaving the seat or course after joining. ≤, ≥, + and the short phrases (Per state rule, No money penalty…): as for Bond penalty. —: none published. Colour: red ₹25 L or more.",
};

/** The same for another exam's MCC institute profiles (NEET MDS, NEET SS): no NBEMS, DNB or MD/MS rules, no fee colours. */
const columnNoteOther: Record<StatKey, string> = {
  fee: "Year 1 fee for this course and quota, as the college's MCC institute profile declares it: /yr a fee a year (year 1’s may be paid at admission); at admission (Year 1): the amount the profile gives for admission. Varies by subject, On college website, Not stated: the profile gives no one figure for these seats (its words are in the institute’s Fees tab). A range: the profile gives only the range across subjects. —: none published. No colour: there are no fee bands for these courses.",
  stipend: "Year 1 stipend a month (/mo), as the college's MCC institute profile declares it. Not stated: no figure published. —: none published.",
  bond: "Service bond years: one of three. No bond: a document says none. A stated bond: its years (1Y: one year; Bond, years not stated). Not known: a bond document Seatora couldn't read (read it before you lock your choices), a blank form or one with no clear bond, no bond declared to MCC, or no record; the (i) says which. Colour: green no bond, amber 1-2 years, orange 3 years or more, grey not known.",
  bondInr: columnNote.bondInr,
  leaving: columnNote.leaving,
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
      <InfoTip label={`${statLabel[k]} column`}>
        <PgOr pg={columnNote[k]} other={<ExamWords>{columnNoteOther[k]}</ExamWords>} /> Each figure&apos;s exact words and sources: the cards, or the institute&apos;s Fees tab.
      </InfoTip>
    </span>
  );
}

/** A card summary's three items, in the order she weighs them: Fee, the bond flag (lib/stat-format.ts bondFlag), Stipend. */
export type SummaryKey = "fee" | "bond" | "stipend";
export const summaryKeys: SummaryKey[] = ["fee", "bond", "stipend"];
/** Each item as one string (the value with its marker): a list compares them to say once what every card shares. */
export function summaryText(cells: StatCell[]): Record<SummaryKey, string> {
  const text = (c: StatCell) => (c.marker ? `${c.short} ${c.marker}` : c.short);
  return { fee: text(cells[0]), bond: bondFlag(cells).text, stipend: text(cells[1]) };
}

/**
 * One line of a card's terms (summaryText's items but `hide`'s): "Fee ₹1.7 L/yr", "Bond 2 yr · ₹50 L", "Stipend
 * ₹85,000/mo", coloured as the cells. No (i)s: the cells, with every figure's words and sources, are under the card's
 * Details. `data-terms`: hidden for an exam with no fee data.
 */
export function TermSummary({ cells, hide, className }: { cells: StatCell[]; hide?: Partial<Record<SummaryKey, unknown>>; className?: string }) {
  const [fee, stipend] = cells;
  const flag = bondFlag(cells);
  const item = (k: SummaryKey, label: React.ReactNode, value: React.ReactNode) =>
    !hide?.[k] && (
      <div key={k} className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  const items = [
    item("fee", "Fee", <><Value c={fee} /><Marker c={fee} /></>),
    // The flag names itself ("No bond", "Bond 2 yr · ₹50 L"): its label is for screen readers.
    item("bond", <span className="sr-only">Bond and penalties</span>, <span className={cn("numeric font-semibold", flag.level ? levelClass[flag.level] : "text-muted-foreground")}>{flag.text}</span>),
    item("stipend", "Stipend", <><Value c={stipend} /><Marker c={stipend} /></>),
  ].filter(Boolean);
  if (!items.length) return null;
  return <dl data-terms className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>{items}</dl>;
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
      ...(total && c.key === "fee" ? [<td key="feetotal" data-col="feetotal" className={td}>{t.wholeCourseFee != null ? <span className="numeric font-semibold">{feeRange(null, t.wholeCourseFee).replace(/ /g, "\u00a0")}</span> : <span className="text-muted-foreground">—<span className="sr-only">not stated for every year</span></span>}</td>] : []),
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
