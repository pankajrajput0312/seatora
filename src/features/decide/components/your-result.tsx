import "server-only";
import Link from "next/link";
import type { ExamKey } from "@/features/exams/keys";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../lib/links";
import { fillWindow, joiningOf, nextChoiceFilling, stepsNow } from "../lib/round-status";
import { provisionalNote } from "../lib/your-result";
import type { Profile } from "../profile";
import { roundStatus } from "../server/notices";
import { rankResult } from "../server/your-result";
import { Provisional } from "./bits";
import { TryingText } from "./trying-text";
import { smallLink } from "./ui";

/**
 * "Your Round 2 result", Home's first card: what the latest round's result (a later round's: R2, R3, a stray round)
 * lists for her saved rank, or the rank she is trying (said so), with her earlier seat, what to do next from MCC's own
 * round status (the provisional result's instruction, the last date of joining, else the next choice filling) and links
 * to the college, its course's Last ranks and MCC's PDF. Hidden until such a result is in the data.
 */
export async function YourResult({ profile, exam, L }: { profile: Profile; exam: ExamKey; L: DecideLinks }) {
  const r = await rankResult(profile, exam);
  if (!r) return null;
  const { result: x, latest, words: w, pdf } = r;
  const round = w.roundName(latest.round);
  const rs = await roundStatus(latest.year, exam);
  const steps = rs ? stepsNow(rs, new Date()) : [];
  const own = steps.filter((s) => s.round === latest.round);
  const prov = own.find((s) => s.step === "provisional_result");
  const said = latest.provisional ? provisionalNote(prov?.note) : null;
  const notice = prov?.events.filter((e) => e.url !== pdf?.url).at(-1);
  const joining = x.kind === "found" ? joiningOf(own) : null;
  const fill = x.kind === "kept" || x.kind === "none" ? nextChoiceFilling(steps) : null;
  const course = x.row && r.meta.courses.find((c) => c.degree === x.row.degree && c.specialty === x.row.specialty);
  const out = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>{text}<span className="sr-only"> (opens in a new tab)</span></a>
  );
  return (
    <section aria-labelledby="your-result-h" className={cn("rounded-xl border bg-card p-4 sm:p-5", x.kind === "found" && !x.flag ? "border-leaf/50" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="your-result-h" className="text-title font-semibold"><TryingText saved={`Your ${round} result`} tried={`${round} result for the rank you're trying`} /></h2>
        <Provisional when={latest.provisional} />
      </div>
      <p className="mt-1 text-body font-semibold">{x.head}</p>
      {x.before && <p className="mt-1 text-sm text-muted-foreground">{x.before}</p>}
      {x.held && <p className="mt-1 text-sm">{x.held}</p>}
      {x.flag && (
        <p role="note" className="mt-2 rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
          {x.flag} <Link href={L.to("/decide", { editProfile: 1 })} className={`${smallLink} text-sky`}>Edit your profile</Link>
        </p>
      )}
      {(said || joining || fill) && (
        // Short (owner, 20 Nov): one line of what's next; the notice and schedule stay one tap away.
        <p className="mt-2 text-sm">
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
          {fill && <> · <Link href={L.choices()} className={`${smallLink} text-sky`}>Choice list</Link></>}
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 text-sm">
        {x.row?.collegeSlug && <Link href={L.institute(x.row.collegeSlug)} className={`${smallLink} text-sky`}>{x.row.collegeName}</Link>}
        {course && <Link href={L.lastRanks(course.slug)} className={`${smallLink} text-sky`}>Last ranks: {x.row!.courseName}</Link>}
        {pdf?.url && out(pdf.url, `${w.by} PDF`)}
      </p>
    </section>
  );
}
