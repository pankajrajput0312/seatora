import { LATEST_YEAR, PAST_YEARS, reachLabel, seatsBelowText, type Deepest } from "@/features/decide/lib/reach";
import type { OptionRow } from "@/features/decide/service";
import { roundLabel, seatKindLabel, type SeatList, type Term } from "@/features/decide/types";

type Src = { name: string; url: string | null; note?: string };

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
    ...(o.lists.length ? [r.seatsBelow?.map((n) => seatsBelowText(n, LATEST_YEAR, PAST_YEARS, o.includeLatest)).join(" ")] : []),
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
