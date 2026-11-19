import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { askUser } from "@/features/ask/access";
import { Markdown } from "@/features/ask/components/markdown";
import { PrintButton } from "@/features/ask/components/print-button";
import { getReport } from "@/features/ask/reports";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HISTORY_CAPTION } from "@/features/decide/components/bits";
import { fmtDay } from "@/features/decide/lib/format";

// A plan report Ask Seatora saved (create_report): only its own account (the owner) can open it. A snapshot of the
// facts when it was written; the page prints cleanly (Download PDF = the print dialog).
// Checked here too, so a non-owner's page carries no "Plan report" title (metadata renders before the page).
export async function generateMetadata(): Promise<Metadata> {
  if (!(await askUser())) notFound();
  return { title: "Ask Seatora report", robots: { index: false, follow: false } };
}

const th = "px-2 py-1.5 text-left font-semibold";
const td = "px-2 py-1.5 align-top";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await askUser();
  const report = user && (await getReport((await params).id, user.id));
  if (!report) notFound();
  const { content: c } = report;
  const day = fmtDay(report.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })); // YYYY-MM-DD in IST
  const top = c.choices.slice(0, 10);
  return (
    <AppPage className="grid max-w-5xl grid-cols-1 gap-6 print:max-w-none">
      <header className="grid gap-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Ask Seatora report</p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{report.title}</h1>
          </div>
          <PrintButton />
        </div>
        <p className="numeric text-sm">
          AIR <strong>{formatRank(c.profile.rank)}</strong> · {c.profile.category}{c.profile.pwd ? " PwD" : ""}
          {c.profile.courses.length > 0 && <> · {c.profile.courses.join(", ")}</>} · {day}
        </p>
      </header>

      <section aria-labelledby="sum-h" className="grid gap-2">
        <h2 id="sum-h" className="text-lg font-semibold">Where you stand this round</h2>
        <Markdown text={c.summary} />
      </section>

      <section aria-labelledby="list-h" className="grid gap-2">
        <h2 id="list-h" className="text-lg font-semibold">Choice list, in order</h2>
        {c.choices.length ? (
          <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr><th scope="col" className={th}>No.</th><th scope="col" className={th}>College</th><th scope="col" className={th}>Course</th><th scope="col" className={th}>Quota</th><th scope="col" className={th}>Latest closing</th><th scope="col" className={th}>Reach (history)</th><th scope="col" className={th}>Why</th></tr>
              </thead>
              <tbody>
                {c.choices.map((x, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`${td} numeric`}>{i + 1}</td>
                    <td className={td}><Link href={`/decide/institutes/${x.slug}`} className="text-sky underline-offset-2 hover:underline">{x.college}</Link>{x.state && <span className="text-muted-foreground">, {x.state}</span>}</td>
                    <td className={td}>{x.course}</td>
                    <td className={td}>{x.quota}</td>
                    <td className={`${td} numeric`}>{x.lastClosing ?? "—"}</td>
                    <td className={td}>{x.reach}</td>
                    <td className={td}>{x.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No choices in this report.</p>
        )}
        <p className="text-xs text-muted-foreground">{HISTORY_CAPTION}</p>
      </section>

      {top.length > 0 && (
        <section aria-labelledby="money-h" className="grid gap-2 break-inside-avoid">
          <h2 id="money-h" className="text-lg font-semibold">Fee, stipend and bond: top {top.length}</h2>
          <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr><th scope="col" className={th}>No.</th><th scope="col" className={th}>College · course</th><th scope="col" className={th}>Fee</th><th scope="col" className={th}>Stipend</th><th scope="col" className={th}>Bond period</th><th scope="col" className={th}>Bond penalty</th><th scope="col" className={th}>Leaving penalty</th></tr>
              </thead>
              <tbody>
                {top.map((x, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`${td} numeric`}>{i + 1}</td>
                    <td className={td}>{x.college} · {x.course} · {x.quota}</td>
                    <td className={`${td} numeric`}>{x.fee}</td>
                    <td className={`${td} numeric`}>{x.stipend}</td>
                    <td className={td}>{x.bond}</td>
                    <td className={`${td} numeric`}>{x.bondInr}</td>
                    <td className={`${td} numeric`}>{x.leaving}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">As the documents Seatora has state them; &quot;—&quot; or &quot;Not published&quot; = not in those documents. Confirm current terms with the college before joining.</p>
        </section>
      )}

      {c.residents.length > 0 && (
        <section aria-labelledby="res-h" className="grid gap-2 break-inside-avoid">
          <h2 id="res-h" className="text-lg font-semibold">Residents at your top choices</h2>
          <ul className="grid gap-1 text-sm">
            {c.residents.map((r) => (
              <li key={r.slug}>
                {r.college}: <span className="numeric">{r.residents}</span> in MCC admitted lists ·{" "}
                <Link href={`/decide/institutes/${r.slug}?tab=residents`} className="text-sky underline-offset-2 hover:underline" data-print-hide>see names</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.risks.length > 0 && (
        <section aria-labelledby="risk-h" className="grid gap-2 break-inside-avoid">
          <h2 id="risk-h" className="text-lg font-semibold">Risks and what to watch</h2>
          <ul className="grid list-disc gap-1 pl-5 text-sm">{c.risks.map((r, i) => <li key={i}><Markdown text={r} /></li>)}</ul>
        </section>
      )}

      <section aria-labelledby="src-h" className="grid gap-2 break-inside-avoid">
        <h2 id="src-h" className="text-lg font-semibold">Sources</h2>
        <ol className="grid list-decimal gap-0.5 pl-5 text-xs">
          {c.sources.map((s, i) => (
            <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky underline-offset-2 hover:underline">{s.name}</a> : s.name}</li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Prepared by Ask Seatora from MCC, NBEMS and college documents on {day}. Closing ranks are history, not a prediction or guarantee of
        admission; seat matrices, categories and competition change every round. Fees, stipends and bonds are as published; confirm them with MCC and
        the college. Not legal or financial advice.
      </footer>
    </AppPage>
  );
}
