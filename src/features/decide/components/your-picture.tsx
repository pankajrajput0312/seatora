import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { groupsIn, quotaIn, roundIn, type Exam } from "@/features/exams/exam";
import { yearName } from "@/features/exams/keys";
import type { DecideLinks } from "../lib/links";
import { pastOf, reachLabel, reachOrder, reachWindow, type Latest, type Reach } from "../lib/reach";
import { inrCard, statCells } from "../lib/stat-format";
import type { Profile } from "../profile";
import type { OptionRow, OptionsPicture } from "../service";
import { courseName } from "./options-view";
import { levelClass } from "./stat-cells";
import { Term } from "./term";
import { smallLink } from "./ui";

/** "MD Anaesthesiology, All India" under a picked option's name. */
const what = (r: OptionRow, E: Exam) => `${courseName(r)}, ${quotaIn(E, r.quota)}`;
/** A tile's colour: reached green, within 10% or stray only amber, the rest grey (the chips' own order and words). */
const tone = (x: Reach) => (x.startsWith("reached") ? "text-leaf" : x === "within-10" || x === "stray-only" ? "text-sun" : "text-muted-foreground");

/**
 * "Your picture", at the top of Options and Home: of her options (`scope`: what Options lists, e.g. " with 2026 R2
 * seats"), one tile per reach chip with any (the chips' words and buckets, so the tiles add up to her options), each
 * opening that chip (`href`); the cheapest she reached and the government one with the most margin in the latest year's
 * Round 1, each linked. History, said as such: no new reading of the data. Server-rendered: every exam's words come from `E`.
 */
export function YourPicture({ pic, profile, E, latest, includeLatest = true, L, scope = "", href }: {
  pic: OptionsPicture;
  profile: Profile;
  E: Exam;
  latest: Latest;
  includeLatest?: boolean;
  L: DecideLinks;
  scope?: string;
  href: (reach: Reach) => string;
}) {
  const shown = reachOrder.filter((x) => pic.counts[x] > 0);
  const total = shown.reduce((n, x) => n + pic.counts[x], 0);
  const group = groupsIn(E, profile.quotas)[0];
  const fee = pic.cheapest && statCells(pic.cheapest.fees)[0];
  const hostel = pic.cheapest?.fees.hostelFee;
  const s = pic.safest;
  const r1 = `${yearName(E.key, pic.year)} ${roundIn(E, pic.year, "R1")}`;
  return (
    <section aria-labelledby="picture-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="picture-h" className="text-title font-semibold">Your picture</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {E.rankWord} <span className="numeric">{formatRank(profile.rank)}</span>
        {group ? <> in the <Term k="question-group">{group}</Term></> : E.categories.length > 1 ? `, ${profile.category}${profile.pwd ? " PwD" : ""}` : ""}: your{" "}
        <span className="numeric">{formatRank(total)}</span> {total === 1 ? "option" : "options"}{scope} by reach. Based on last years&apos; closing ranks ({reachWindow(latest, pastOf(latest), includeLatest)}), not a prediction.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((x) => (
          <div key={x} className="flex min-w-0 flex-col-reverse justify-end gap-0.5">
            <dt className="text-xs leading-snug text-muted-foreground">{x === "within-10" || x === "stray-only" ? <Term k={x === "stray-only" ? "stray" : "within-10"}>{reachLabel(x, latest, pastOf(latest), includeLatest)}</Term> : reachLabel(x, latest, pastOf(latest), includeLatest)}</dt>
            <dd className={`numeric text-2xl leading-tight font-bold ${tone(x)}`}>
              <Link href={href(x)} className="hover:underline">{formatRank(pic.counts[x])}</Link>
            </dd>
          </div>
        ))}
      </dl>
      {(pic.cheapest || s || pic.govtOther > 0) && (
        <dl className="mt-3 grid gap-3 border-t border-border pt-3 text-sm md:grid-cols-2">
          {pic.cheapest && fee && (
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Cheapest you reached (fee a year)</dt>
              <dd>
                <span className={`numeric font-semibold ${fee.level ? levelClass[fee.level] : ""}`}>{fee.short}</span> at{" "}
                <Link href={L.institute(pic.cheapest.college.slug, "fees")} className={`${smallLink} font-semibold`}>{pic.cheapest.college.name}</Link>
                <span className="block text-xs text-muted-foreground">
                  {what(pic.cheapest, E)}
                  {/* What the yearly fee leaves out, where the record says (JSS: tuition, its hostel a year apart). */}
                  {hostel && !hostel.included && <>; hostel <span className="numeric">{inrCard(hostel.inr)}</span>{hostel.period === "per_month" ? " a month" : hostel.period === "per_year" ? " a year" : ""} on top</>}
                </span>
              </dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{pic.allGovt ? `Most margin in ${r1}` : `Government with the most margin in ${r1}`}</dt>
            {s ? (
              <dd>
                Closed <span className="numeric font-semibold">{formatRank(s.at.closing)}</span> in {r1} at{" "}
                <Link href={L.institute(s.row.college.slug)} className={`${smallLink} font-semibold`}>{s.row.college.name}</Link>
                <span className="block text-xs text-muted-foreground">
                  {what(s.row, E)}; {s.at.closing > profile.rank ? <><span className="numeric">{formatRank(s.at.closing - profile.rank)}</span> ranks past yours</> : "at your rank"}
                </span>
              </dd>
            ) : (
              <dd>
                None reached your rank in {r1}
                {pic.govtOther > 0 && <span className="block text-xs text-muted-foreground"><span className="numeric">{formatRank(pic.govtOther)}</span> {pic.allGovt ? (pic.govtOther === 1 ? "option" : "options") : pic.govtOther === 1 ? "government option" : "government options"} reached it in another round or year</span>}
              </dd>
            )}
          </div>
        </dl>
      )}
    </section>
  );
}
