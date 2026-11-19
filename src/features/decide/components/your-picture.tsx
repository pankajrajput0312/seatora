import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { groupsIn, quotaIn, type Exam } from "@/features/exams/exam";
import { yearName } from "@/features/exams/keys";
import type { DecideLinks } from "../lib/links";
import { pastOf, reachWindow, type Latest } from "../lib/reach";
import { statCells } from "../lib/stat-format";
import type { Profile } from "../profile";
import type { OptionRow, OptionsPicture } from "../service";
import { roundShort } from "../types";
import { courseName } from "./options-view";
import { levelClass } from "./stat-cells";
import { smallLink } from "./ui";

/** "MD Anaesthesiology, All India" under a picked option's name. */
const what = (r: OptionRow, E: Exam) => `${courseName(r)}, ${quotaIn(E, r.quota)}`;

/**
 * "Your picture", at the top of Options and Home: of her options (`scope`: what Options lists, e.g. " with 2026 R2
 * seats"), how many reached her rank in Round 1, only in a later round, and closed before it (OptionsPicture: the reach
 * labels' own buckets); the cheapest she reached and the government one with the most margin, each linked. History,
 * said as such: no new reading of the data. Server-rendered: every exam's words come from `E` (examInfo).
 */
export function YourPicture({ pic, profile, E, latest, includeLatest = true, L, scope = "", closedHref }: {
  pic: OptionsPicture;
  profile: Profile;
  E: Exam;
  latest: Latest;
  includeLatest?: boolean;
  L: DecideLinks;
  scope?: string;
  closedHref: string;
}) {
  const labelled = Object.values(pic.counts).reduce((a, b) => a + b, 0);
  const group = groupsIn(E, profile.quotas)[0];
  // The rounds after Round 1 that make a "reached" label (never a stray round), as this exam names them.
  const later = E.rounds.filter((r) => r !== "R1" && r !== "stray" && r !== "special_stray").map((r) => roundShort(r, E.key));
  const fee = pic.cheapest && statCells(pic.cheapest.fees)[0];
  const s = pic.safest;
  const count = (n: number, label: React.ReactNode, tone: string, href?: string) => (
    <div className="flex min-w-0 flex-col-reverse justify-end gap-0.5">
      <dt className="text-xs leading-snug text-muted-foreground">{label}</dt>
      <dd className={`numeric text-2xl leading-tight font-bold ${tone}`}>
        {href ? <Link href={href} className="hover:underline">{formatRank(n)}</Link> : formatRank(n)}
      </dd>
    </div>
  );
  return (
    <section aria-labelledby="picture-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="picture-h" className="text-title font-semibold">Your picture</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {E.rankWord} <span className="numeric">{formatRank(profile.rank)}</span>
        {group ? ` in the ${group}` : E.categories.length > 1 ? `, ${profile.category}${profile.pwd ? " PwD" : ""}` : ""}: your{" "}
        <span className="numeric">{formatRank(labelled)}</span> {labelled === 1 ? "option" : "options"}{scope}. Based on last years&apos; closing ranks ({reachWindow(latest, pastOf(latest), includeLatest)}), not a prediction.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        {count(pic.r1, "Reached your rank in Round 1", "text-leaf")}
        {count(pic.later, <>Only in a later round{later.length ? ` (${later.join(" or ")})` : ""}</>, "text-sun")}
        {count(pic.counts["closed-before"], "Closed before your rank", "text-muted-foreground", closedHref)}
      </dl>
      {(pic.cheapest || s || pic.govtLater > 0) && (
        <dl className="mt-3 grid gap-3 border-t border-border pt-3 text-sm md:grid-cols-2">
          {pic.cheapest && fee && (
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Cheapest you reached</dt>
              <dd>
                <span className={`numeric font-semibold ${fee.level ? levelClass[fee.level] : ""}`}>{fee.short}</span> at{" "}
                <Link href={L.institute(pic.cheapest.college.slug, "fees")} className={`${smallLink} font-semibold`}>{pic.cheapest.college.name}</Link>
                <span className="block text-xs text-muted-foreground">{what(pic.cheapest, E)}</span>
              </dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Government with the most margin in Round 1</dt>
            {s ? (
              <dd>
                Closed <span className="numeric font-semibold">{formatRank(s.at.closing)}</span> in {yearName(E.key, s.at.year)} R1 at{" "}
                <Link href={L.institute(s.row.college.slug)} className={`${smallLink} font-semibold`}>{s.row.college.name}</Link>
                <span className="block text-xs text-muted-foreground">
                  {what(s.row, E)}; {s.at.closing > profile.rank ? <><span className="numeric">{formatRank(s.at.closing - profile.rank)}</span> ranks past yours</> : "at your rank"}
                </span>
              </dd>
            ) : (
              <dd>
                None reached your rank in Round 1
                {pic.govtLater > 0 && <span className="block text-xs text-muted-foreground"><span className="numeric">{formatRank(pic.govtLater)}</span> {pic.govtLater === 1 ? "government option reached it" : "government options reached it"} only in a later round</span>}
              </dd>
            )}
          </div>
        </dl>
      )}
    </section>
  );
}
