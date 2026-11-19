import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { DEFAULT_EXAM, exams, perGroup, type ExamKey } from "@/features/exams/registry";
import type { DecideLinks } from "../lib/links";
import type { Reach } from "../lib/reach";
import { roundName } from "../lib/round-status";
import type { SeatList } from "../types";
import { smallLink } from "./ui";
import { quotaIn } from "@/features/exams/exam";

/**
 * What she can still do when none of her options reached her rank: Home's panel, and the top of Options (one
 * component, so the two never drift). Every item is a real control: an Options filter, her profile, the schedule,
 * Rank scan. `list`: the newest round's seat list while Options lists that round; `fresh`: its options never
 * allotted before.
 */
export function StillCanDo({ L, rank, list, fresh, counts, title, id, exam = DEFAULT_EXAM, cap }: {
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
}) {
  const pg = exam === DEFAULT_EXAM;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card p-4">
      <h2 id={id} className="text-title font-semibold">{title}</h2>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
        {list && fresh > 0 && (
          <li><Link href={L.options({ reach: "new" })} className="underline hover:text-sky">{formatRank(fresh)} {fresh === 1 ? "option" : "options"} in MCC&apos;s {roundName[list.round]} seat lists never allotted before</Link>: no closing rank to compare. Look at them.</li>
        )}
        {list && <li><Link href={L.to("/decide/options", { seats: "virtual" })} className={smallLink}>Virtual vacancy seats</Link>: seats held now that free up when someone upgrades this round. Fill them as choices too.</li>}
        {counts["stray-only"] > 0 && <li><Link href={L.options({ reach: "stray-only" })} className={smallLink}>{formatRank(counts["stray-only"])} reached your rank only in a stray round</Link>, after R1 to R3 had closed far earlier.</li>}
        {counts["within-10"] > 0 && <li><Link href={L.options({ reach: "within-10" })} className={smallLink}>{formatRank(counts["within-10"])} closed within 10% of your rank</Link> in a past round.</li>}
        {cap ? (
          <li><Link href={cap.href} className={smallLink}>{cap.n > 0 ? `${formatRank(cap.n)} ${cap.n === 1 ? "option" : "options"} hidden by ${cap.words}` : `Options hidden by ${cap.words}`}</Link>: see them on Options, or lift the limit in your profile.</li>
        ) : pg ? (
          <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>Widen your courses, quotas or states</Link>: other states, Deemed/Paid seats (a quota), DNB and Diploma courses of your specialties, more specialties, or looser fee and bond caps.</li>
        ) : (
          <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>{perGroup(exam) ? "Widen your courses or states" : "Widen your courses, quotas or states"}</Link>: other states, more courses{perGroup(exam) ? " of your question group" : `, other quotas you can take (${exams[exam].quotas.map((q) => quotaIn(exams[exam], q)).join(", ")})`}.</li>
        )}
        {pg && <li>The stray vacancy round comes after Round 3: see the <Link href={L.to("/decide/counselling")} className={smallLink}>schedule and notices</Link>.</li>}
        <li><Link href={L.rankScan(rank)} className={smallLink}>Rank scan</Link> shows what ranks near yours were allotted in past rounds.</li>
      </ul>
    </section>
  );
}
