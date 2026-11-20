import Link from "next/link";
import { Fragment } from "react";
import { formatRank } from "@/features/cutoffs/lib/format";
import { authorityOf, DEFAULT_EXAM, exams, perGroup, type ExamKey } from "@/features/exams/registry";
import type { DecideLinks } from "../lib/links";
import type { Reach } from "../lib/reach";
import { roundName } from "../lib/round-status";
import { kindName, type SeatList } from "../types";
import { smallLink } from "./ui";
import { quotaIn } from "@/features/exams/exam";

/** A course and how many of its options reached her rank, linked to them on Options. */
export type CourseHit = { key: string; name: string; n: number; href: string };
/** "A (149 options), B (54 options) and C (3 options)"; `more` courses after them: "…, C (3 options) and 8 more". */
const hitList = (xs: CourseHit[], more = 0) =>
  xs.map((x, i) => (
    <Fragment key={x.key}>
      {i > 0 && (i === xs.length - 1 && !more ? " and " : ", ")}
      <Link href={x.href} className={smallLink}>{x.name}</Link> (<span className="numeric">{formatRank(x.n)}</span> {x.n === 1 ? "option" : "options"})
      {i === xs.length - 1 && more > 0 && <> and <span className="numeric">{formatRank(more)}</span> more</>}
    </Fragment>
  ));
const SHOWN = 4;

/**
 * Which of her courses reached her rank (listOptions `courses`): the ones that did, most first (`hit`), and her courses
 * (or specialties) with none (`missed`). None of hers: `nearest` (service.ts nearestCourses), the courses nearest hers
 * that did. `rank`: "AIR 25,000"; `when`: the rounds the labels count ("2024, 2025 or 2026 R1").
 */
export function CourseReach({ hit, missed, nearest, rank, when }: { hit: CourseHit[]; missed: string[]; nearest?: CourseHit[]; rank: string; when: string }) {
  if (!hit.length)
    return (
      <>
        None of your courses reached {rank} in {when}.{" "}
        {nearest?.length ? <>The nearest courses that did, in your quotas, states and caps: {hitList(nearest)}.</> : "No other course did either, in your quotas, states and caps."}
      </>
    );
  const top = hit.slice(0, SHOWN);
  const more = hit.length - top.length;
  const lead = more ? <><span className="numeric">{formatRank(hit.length)}</span> of your courses reached {rank} in {when}: </> : missed.length ? "Among your courses, only " : `Your courses that reached ${rank} in ${when}: `;
  return (
    <>
      {lead}
      {hitList(top, more)}
      {!more && missed.length > 0 && <> reached {rank} in {when}</>}.
      {missed.length > 0 && <> No option in {missed.length > 1 ? `${missed.slice(0, -1).join(", ")} or ${missed.at(-1)}` : missed[0]} did.</>}
    </>
  );
}

/**
 * What she can still do when none of her options reached her rank: Home's panel, and the top of Options (one
 * component, so the two never drift). Every item is a real control: an Options filter, her profile, the schedule.
 * `list`: the newest round's seat list while Options lists that round; `fresh`: its options never
 * allotted before. `courses` (Options): which courses nearest hers reached her rank (CourseReach), the first item.
 */
export function StillCanDo({ L, rank, list, fresh, counts, title, id, exam = DEFAULT_EXAM, cap, courses }: {
  L: DecideLinks;
  rank: number;
  list: SeatList | undefined;
  fresh: number;
  counts: Record<Reach, number>;
  title: string;
  id: string;
  /** Another exam: only what it has (no schedule; NEET SS: no other quota but her group's). */
  exam?: ExamKey;
  /** Her cap hides options (another exam): they are what to look at, not more courses (`n` hidden, `href` shows them). */
  cap?: { href: string; words: string; n: number };
  courses?: React.ReactNode;
}) {
  const pg = exam === DEFAULT_EXAM;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card p-4">
      <h2 id={id} className="text-title font-semibold">{title}</h2>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
        {courses && <li>{courses}</li>}
        {list && fresh > 0 && (
          <li><Link href={L.options({ reach: "new" })} className="underline hover:text-sky">{formatRank(fresh)} {fresh === 1 ? "option" : "options"} in {authorityOf(exam)}&apos;s {kindName("clear", exam) === "Seat position" ? "seat position" : `${roundName[list.round]} seat lists`} never allotted before</Link>: no closing rank of their own. Each one shows what the same course closed at colleges of its type in its state, for comparison, not a prediction.</li>
        )}
        {/* INI-CET has one seat position a session: no virtual vacancy list. */}
        {list && kindName("clear", exam) !== "Seat position" && <li><Link href={L.to("/decide/options", { seats: "virtual" })} className={smallLink}>Virtual vacancy seats</Link>: seats held now that free up when someone upgrades this round. Fill them as choices too.</li>}
        {counts["stray-only"] > 0 && <li><Link href={L.options({ reach: "stray-only" })} className={smallLink}>{formatRank(counts["stray-only"])} reached your rank only in a stray round</Link>, after R1 to R3 had closed far earlier.</li>}
        {counts["within-10"] > 0 && <li><Link href={L.options({ reach: "within-10" })} className={smallLink}>{formatRank(counts["within-10"])} closed within 10% of your rank</Link> in a past round.</li>}
        {cap ? (
          <li><Link href={cap.href} className={smallLink}>{cap.n > 0 ? `${formatRank(cap.n)} ${cap.n === 1 ? "option" : "options"} hidden by ${cap.words}` : `Options hidden by ${cap.words}`}</Link>: see them on Options, or lift the limit in your profile.</li>
        ) : exam === "ini-cet" ? (
          <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>Widen your courses</Link>: more courses at these institutes (MD, MS, MDS, the 6-year DM and MCh). Tick a restricted quota (Institutional Preference, Sponsored, Foreign National) only if you are eligible.</li>
        ) : pg ? (
          <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>Widen your courses, quotas or states</Link>: other states, Deemed/Paid seats (a quota), DNB and Diploma courses of your specialties, more specialties, or looser fee and bond caps.</li>
        ) : (
          <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>{perGroup(exam) ? "Widen your courses or states" : "Widen your courses, quotas or states"}</Link>: other states, more courses{perGroup(exam) ? " of your question group" : `, other quotas you can take (${exams[exam].quotas.map((q) => quotaIn(exams[exam], q)).join(", ")})`}.</li>
        )}
        {pg && <li>The stray vacancy round comes after Round 3: see the <Link href={L.to("/decide/counselling")} className={smallLink}>schedule and notices</Link>.</li>}
      </ul>
    </section>
  );
}
