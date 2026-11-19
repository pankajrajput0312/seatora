import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { DecideLinks } from "../../lib/links";
import type { Latest } from "../../lib/reach";
import { isRestricted, neetPg, type Exam } from "@/features/exams/exam";
import { seatKindLabel, type SeatKind, type SeatList } from "../../types";
import { Dash, Provisional, ReachBadge } from "../bits";
import { Beds } from "../pages/beds";
import { ResultCard, ResultCards } from "../result-card";
import { TermStatCells } from "../stat-cells";
import { TypeBadge } from "../type-badge";
import type { SeatLine } from "./find-seats";
import { RoundName } from "../round-name";
import { QuotaName } from "../round-name";
import { quotaIn } from "@/features/exams/exam";

// Seat rows as compact cards (the Seats page's Cards view, every view: matrix, one list, compare): the round, quota and
// seat category on top, the picked list's seats as the big number, the institute, course and its other lists' seats,
// the deepest past closing and her label, then the course's terms as number cells. Server- and client-safe (no hooks):
// the page renders it for one list or compare, SeatMatrix (client) for the matrix, with its Details drawer.

/** What a card reads of a seat row (the matrix's rows leave out the published terms). */
export type CardRow = Pick<SeatLine, "college" | "course" | "degree" | "specialty" | "quota" | "category" | "byList" | "deepest" | "reach" | "reachProvisional" | "noLabel" | "fees" | "hospital">;

export const seatRowKey = (r: CardRow) => [r.college.key, r.degree, r.specialty, r.quota, r.category].join("|");
export const seatCourse = (r: CardRow) => `${r.degree} ${r.course?.name ?? r.specialty}`;
const shortKind: Record<SeatKind, string> = { clear: "Clear", virtual: "Virtual", new: "Newly added" };

/**
 * `list`: the picked list (its seats are the big number); `lists`: the lists shown with it, newest first (its round's in
 * compare and the matrix, every round's with All rounds; just `list` in one-list view). A row with no seats in the picked
 * round (All rounds) shows its newest list with seats instead, its round in the chip. `onDetails`: the matrix's drawer,
 * by row key (a Details button per card). `latest`: lib/reach.ts latestRound.
 */
export function SeatCards({ rows, list, lists, ranked, L, title, onDetails, latest, exam = neetPg }: {
  rows: CardRow[];
  list: SeatList;
  lists: SeatList[];
  ranked: boolean;
  L: DecideLinks;
  title: string;
  onDetails?: (key: string) => void;
  latest: Latest;
  /** The exam shown: which quotas are restricted. */
  exam?: Exam;
}) {
  const sameRound = (a: SeatList, b: SeatList) => a.year === b.year && a.round === b.round;
  return (
    <ResultCards title={title} hideTitle>
      {rows.map((r, i) => {
        const k = seatRowKey(r);
        const name = `${r.college.name}, ${seatCourse(r)}, ${r.quota != null ? quotaIn(exam, r.quota) : "quota not printed"}, ${r.category} seats`;
        const has = (l: SeatList) => (r.byList[l.key] ?? 0) > 0;
        const own = lists.some((l) => sameRound(l, list) && has(l)) ? list : (lists.find(has) ?? list);
        const others = lists.filter((l) => l.key !== own.key && sameRound(l, own));
        const n = r.byList[own.key];
        const also = others.filter(has);
        const d = r.deepest;
        return (
          <ResultCard
            key={`${k}|${i}`}
            chips={[
              <>{own.year} · <RoundName year={own.year} round={own.round} /></>,
              r.quota != null ? <QuotaName key="q" quota={r.quota} /> : "Quota not printed",
              r.quota != null && isRestricted(exam, r.quota) && <Badge tone="warning">Restricted</Badge>,
              `${r.category} seat`,
            ]}
            actions={onDetails && (
              <Button type="button" variant="ghost" className="px-3 text-sky" data-row={k} onClick={() => onDetails(k)} aria-haspopup="dialog" aria-label={`Details: ${name}`}>
                Details
              </Button>
            )}
            stat={{ label: lists.length > 1 ? shortKind[own.kind] : "Seats", value: n != null ? formatRank(n) : <Dash /> }}
            title={r.college.name}
            href={L.institute(r.college.slug)}
            external={r.hospital?.mccProfileUrl ? { href: r.hospital.mccProfileUrl, label: `MCC profile: ${r.college.name}` } : undefined}
            subtitle={
              <>
                {seatCourse(r)}
                {also.length > 0 && (
                  <span className="numeric block text-xs text-muted-foreground">
                    {also.map((l) => `${shortKind[l.kind]} ${formatRank(r.byList[l.key])}`).join(" · ")}
                    <span className="sr-only"> ({others.map((l) => seatKindLabel[l.kind]).join(", ")} lists, never added together)</span>
                  </span>
                )}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {d ? (
                    <span>
                      {/* As deepestText: "Deepest 2025: 60,351 (Stray)", every round counted. */}
                      Deepest <span className="numeric">{d.year}:</span> <span className="numeric font-semibold text-foreground">{formatRank(d.closing)}</span> (<RoundName year={d.year} round={d.round} />)
                      {d.provisional && <> <Provisional when /></>}
                    </span>
                  ) : (
                    <span>No past closing</span>
                  )}
                  {ranked && (r.reach ? <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} on={r.category} /> : r.noLabel && <span>{r.noLabel}</span>)}
                </span>
              </>
            }
            meta={[
              r.college.state ?? "State not listed",
              <TypeBadge key="type" type={r.hospital?.type} of={r.college.name} />,
              r.hospital?.beds && <Beds b={r.hospital.beds} inst={r.college.name} of={name} unit />,
            ]}
            footer={<TermStatCells t={r.fees} of={name} />}
          />
        );
      })}
    </ResultCards>
  );
}
