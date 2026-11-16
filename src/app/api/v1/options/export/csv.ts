import { LATEST_YEAR, PAST_YEARS, reachLabel, seatsBelowNotes, type Deepest } from "@/features/decide/lib/reach";
import type { OptionRow, RoundSummary } from "@/features/decide/service";
import { roundLabel, seatKindLabel, type SeatKind, type SeatList, type Term } from "@/features/decide/types";

type Src = { name: string; url: string | null; note?: string };

/**
 * The round view in one line (the page's summary): what the rows are, how they are counted and sorted. `span`: the
 * results in the data (reach.ts resultsSpan); `noState`: options the state filter drops for an institute with no state.
 */
export function roundViewNote(l: Pick<SeatList, "year" | "round">, s: RoundSummary, seats: SeatKind | "any" | null, span: string, noState = 0) {
  const round = `${l.year} ${roundLabel[l.round]}`;
  const rows = seats === "any" ? `Options with ${round} seats` : seats ? `Options with ${round} ${seatKindLabel[seats].toLowerCase()}${seats === "new" ? "" : " seats"}` : `Every option, with or without ${round} seats`;
  return `${rows}, sorted by label (reached, then within 10%, then never allotted before and no allotment in your categories, closed before your rank last), then ${round} clear vacancy seats, then deepest closing. In your courses, quotas and seat categories ${s.options} options have ${round} seats: ${s.clear} in the clear vacancy list, ${s.virtualOnly} virtual only${s.newOnly ? `, ${s.newOnly} only newly added` : ""}; ${s.withNew} with seats in MCC's newly added list; ${s.fresh} never allotted before (no past allotment: no MCC allotment for that course and quota in any result Seatora has, ${span}, in any round or seat category).${noState ? ` ${noState} more with ${round} seats are at institutes with no state in the data, so the state filter leaves them out.` : ""}`;
}

/** A CSV cell: numbers as they are, text quoted (formula-looking text gets a leading ' so a spreadsheet never runs it), "—" when missing. */
const cell = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : typeof v === "number" ? String(v) : `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

const closing = (d: Deepest | null | undefined) => [d?.closing, d && `${roundLabel[d.round]}${d.provisional ? " (provisional)" : ""}`, d?.category];
const term = (t: Term | undefined) => [t?.text, t && (t.source.url ?? t.source.name)];

/**
 * The Options view as CSV (UTF-8 with BOM, CRLF), the columns the page shows: one seats column per list (`lists`, never
 * added) and the note on lists whose seats are all on seat categories with another label (OptionRow.seatsBelow),
 * closings with their round and seat category, fee and bond as published with their documents. After a blank
 * row: `notes` (one per row) and the official sources behind the numbers.
 */
export function optionsCsv(rows: OptionRow[], o: { lists: SeatList[]; includeLatest: boolean; notes: string[]; sources: Src[] }) {
  const [older, last] = PAST_YEARS;
  const years = [`${LATEST_YEAR} R1`, `${last} deepest`, `${older} deepest`].flatMap((y) => [`${y} closing`, `${y} round`, `${y} seat category`]);
  const head = ["#", "Institute", "State", "Course", "Quota", "Reach", ...o.lists.map((l) => `${l.year} ${roundLabel[l.round]} ${seatKindLabel[l.kind].toLowerCase()}${l.kind === "new" ? "" : " seats"}`), ...(o.lists.length ? ["Seat category note"] : []), ...years, "Fee", "Fee source", "Service bond", "Bond source"];
  const body = rows.map((r, i) => [
    i + 1, r.college.name, r.college.state, `${r.course.degree} ${r.course.name}`, r.quota,
    `${reachLabel(r.reach, LATEST_YEAR, PAST_YEARS, o.includeLatest)}${r.reachProvisional ? " (provisional)" : ""}`,
    ...o.lists.map((l) => r.seatsBy?.[l.kind]),
    ...(o.lists.length ? [seatsBelowNotes(r.seatsBelow ?? [], LATEST_YEAR, PAST_YEARS, o.includeLatest).join(" ")] : []),
    ...closing(r.latest), ...closing(r.byYear[last]), ...closing(r.byYear[older]),
    ...term(r.terms.fee), ...term(r.terms.bond),
  ]);
  const notes = [
    ...o.notes.map((n) => [n]),
    [],
    ["Source", "Link", "Note"],
    ...o.sources.map((s) => [s.name, s.url, s.note]),
  ];
  return `\uFEFF${[head, ...body].map((x) => x.map(cell).join(",")).concat("", ...notes.map((x) => x.map(cell).join(","))).join("\r\n")}\r\n`;
}
