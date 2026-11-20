import "server-only";
import { cookies } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_EXAM } from "@/features/exams/registry";
import type { ExamKey } from "@/features/exams/keys";
import type { DecideLinks } from "../lib/links";
import { fillWindow, joiningOf, nextChoiceFilling, RESULT_CLOSED_COOKIE, stepsNow } from "../lib/round-status";
import { provisionalNote } from "../lib/your-result";
import { roundStatus } from "../server/notices";
import { resultNews, type rankResult } from "../server/your-result";
import { Provisional } from "./bits";
import { HeldPicker } from "./held-picker";
import { smallLink } from "./ui";
import { coursesOf, visitNow, type RoundCount } from "./what-changed";
import { ResultNewsCard } from "./what-changed-card";

/**
 * "Round 2 result", Home's first card and the round's one piece of news there (the result strip and What changed fold
 * into it, ResultNewsCard): what the latest round's result (a later round's: R2, R3, a stray round) lists for her saved
 * rank or the one she is trying, with her earlier seat, what to do next from MCC's own round status (the provisional
 * result's instruction, the last date of joining, else the next choice filling), one row of links (her seat's college and
 * course, her options, last ranks by branch, the round's allotments, MCC's PDF) and, with no seat set, "Already hold a
 * seat?". `res`: server/your-result.ts rankResult (Home shows What changed in its place while that is null).
 */
export async function YourResult({ res, exam, L, round, askHeld }: { res: NonNullable<Awaited<ReturnType<typeof rankResult>>>; exam: ExamKey; L: DecideLinks; round: RoundCount; askHeld: boolean }) {
  const { result: x, latest, words: w, pdf } = res;
  const [rs, items, news] = await Promise.all([roundStatus(latest.year, exam), visitNow(exam), resultNews(exam).catch(() => null)]);
  const closed = !!news && decodeURIComponent((await cookies()).get(RESULT_CLOSED_COOKIE)?.value ?? "") === news.id;
  const steps = rs ? stepsNow(rs, new Date()) : [];
  const own = steps.filter((s) => s.round === latest.round);
  const prov = own.find((s) => s.step === "provisional_result");
  const said = latest.provisional ? provisionalNote(prov?.note) : null;
  const notice = prov?.events.filter((e) => e.url !== pdf?.url).at(-1);
  const joining = x.kind === "found" ? joiningOf(own) : null;
  const fill = x.kind === "kept" || x.kind === "none" ? nextChoiceFilling(steps) : null;
  const course = x.row && res.meta.courses.find((c) => c.degree === x.row.degree && c.specialty === x.row.specialty);
  const a = `${smallLink} text-sky`;
  const out = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={a}>{text}<span className="sr-only"> (opens in a new tab)</span></a>
  );
  return (
    <ResultNewsCard
      items={items}
      courses={coursesOf(round)}
      round={{ year: latest.year, round: latest.round }}
      news={news && { id: news.id, closed }}
      title={`${w.roundName(latest.round)} result`}
      badge={latest.provisional ? <Provisional when /> : <Badge tone="final">Final</Badge>}
      found={x.kind === "found" && !x.flag}
      footer={askHeld && <div><HeldPicker current={null} link="Already hold a seat? Set it to see upgrades" /></div>}
    >
      <p className="text-body font-semibold">{x.head}</p>
      {x.before && <p className="text-sm text-muted-foreground">{x.before}</p>}
      {x.held && <p className="text-sm">{x.held}</p>}
      {x.flag && (
        <p role="note" className="rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
          {x.flag} <Link href={L.to("/decide", { editProfile: 1 })} className={a}>Edit your profile</Link>
        </p>
      )}
      {(said || joining || fill) && (
        // Short (owner, 20 Nov): one line of what's next; the notice and schedule stay one tap away.
        <p className="text-sm">
          <span className="font-semibold">Next:</span>{" "}
          {[
            said && (said.match(/until ([^,(]+)/)?.[1] ? `report errors to ${w.by} by ${said.match(/until ([^,(]+)/)![1].trim()}` : null),
            said && /final result/i.test(said) ? "join only after the final result" : null,
            !said && joining ? `join by ${joining.by}${joining.tentative ? " (tentative)" : ""}` : null,
            fill ? `${w.roundName(fill.round)} choice filling ${fillWindow(fill)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {notice && <> · {out(notice.url, "notice")}</>}
          {fill && <> · <Link href={L.choices()} className={a}>Choice list</Link></>}
        </p>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {x.row?.collegeSlug && <Link href={L.institute(x.row.collegeSlug)} className={a}>{x.row.collegeName}</Link>}
        {course && <Link href={L.lastRanks(course.slug)} className={a}>Last ranks: {x.row!.courseName}</Link>}
        <Link href={L.options()} className={a}>Your options</Link>
        {/* Home's own table (rank-by-branch.tsx, NEET PG only). */}
        {exam === DEFAULT_EXAM && <a href="#by-branch-h" className={a}>Last ranks by branch</a>}
        <Link href={L.allotments({ year: latest.year, round: latest.round })} className={a}>All allotments</Link>
        {pdf?.url && out(pdf.url, `${w.by} PDF`)}
      </p>
    </ResultNewsCard>
  );
}
