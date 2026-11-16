import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Megaphone } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { Dash, PageHead } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { MCC_PG, MccLink } from "@/features/decide/components/pages/mcc-link";
import { NoticeLink } from "@/features/decide/components/round-status";
import { ScrollToHash } from "@/features/decide/components/scroll-to-hash";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { ActiveFilters, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { LATEST_YEAR } from "@/features/decide/lib/reach";
import { clockNote, fmtIST, fmtNote, roundName, statusBadge, stepName, stepsNow, type StepNow } from "@/features/decide/lib/round-status";
import { toURLSearchParams } from "@/features/decide/profile";
import { meritLists } from "@/features/decide/server/merit";
import { listNotices, roundStatus } from "@/features/decide/server/notices";
import { noticeKinds, type NoticeKind } from "@/features/decide/types";

export const metadata: Metadata = { title: "Counselling" };
const PAGE_SIZE = 50;
const tabs = [
  { key: "schedule", label: "Schedule" },
  { key: "announcements", label: "Announcements" },
  { key: "merit", label: "Merit lists" },
] as const;
const noticeRounds = ["R1", "R2", "R3", "stray"] as const;
const kindLabel: Record<NoticeKind, string> = { notice: "Notice", seat_matrix: "Seat matrix", result: "Result", schedule: "Schedule", bulletin: "Bulletin" };
// Announcements filters: kind, round, counselling year (no profile keys).
const schema = z.object({
  tab: z.enum(["schedule", "announcements", "merit"]).default("schedule"),
  kind: z.enum(noticeKinds).optional(),
  round: z.enum(noticeRounds).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  page: pageValue.default(1),
});
type Filters = z.infer<typeof schema>;
const official = sourceTypeLabels.OFFICIAL;
const mccSite = (text: string) => (
  <a href={MCC_PG} target="_blank" rel="noopener noreferrer" className={smallLink}>{text}<span className="sr-only">: MCC PG counselling (opens in a new tab)</span></a>
);

export default async function CounsellingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead title="Counselling" about="Where each MCC All India PG round stands, every MCC notice in the data, and the NEET PG results. Each item links its official document; confirm on the MCC site before acting.">
        MCC rounds, notices and results, from official documents.
      </PageHead>
      <SubTabs label="Counselling" current={f.tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: L.to("/decide/counselling", { tab: t.key }) }))} />
      {f.tab === "schedule" ? <Schedule L={L} /> : f.tab === "announcements" ? <Announcements f={f} params={params} L={L} /> : <MeritLists />}
    </AppPage>
  );
}

async function Schedule({ L }: { L: DecideLinks }) {
  const rs = await roundStatus(LATEST_YEAR);
  if (!rs)
    return (
      <EmptyState icon={CalendarDays} title="No round status loaded" description={`No MCC round status for ${LATEST_YEAR} is in the data, and no dates are made up. The MCC site has the current schedule.`}>
        <MccLink />
      </EmptyState>
    );
  const now = new Date();
  const steps = stepsNow(rs, now);
  return (
    <section aria-labelledby="schedule-h" className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-1">
          <h2 id="schedule-h" className="text-lg font-semibold">PG counselling {rs.year}, round by round</h2>
          <InfoTip label="the round statuses">
            Each status comes from MCC&apos;s notices as of <span className="numeric">{fmtIST(rs.asOf)}</span> and moves on only when today (<span className="numeric">{fmtIST(now.toISOString())}</span>) passes a date printed in MCC&apos;s schedule. Dates are as printed; tentative ones may change. Each step links the MCC notice behind its status.
          </InfoTip>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Badge tone={official.tone}>{official.text}</Badge>
          <span>As of <span className="numeric">{fmtIST(rs.asOf)}</span></span>
          {mccSite("MCC site")}
        </p>
      </div>
      <ScrollToHash />
      {rs.rounds.map((r) => (
        <section key={r.round} aria-labelledby={`round-${r.round}`} className="scroll-mt-24 rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border px-4">
            <h3 id={`round-${r.round}`} className="scroll-mt-24 py-2.5 font-semibold">{roundName[r.round]}</h3>
            <Link href={L.to("/decide/counselling", { tab: "announcements", year: rs.year, round: r.round })} className={`${smallLink} text-sm text-sky`}>
              {roundName[r.round]} notices
            </Link>
          </div>
          <ol>{steps.filter((s) => s.round === r.round).map((s) => <Step key={s.step} s={s} />)}</ol>
          {/* MCC's round status has no reporting or joining step: say so, never a made-up date. */}
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Reporting and joining dates: not in Seatora&apos;s schedule data. The round&apos;s MCC result notice gives them:{" "}
            <Link href={L.to("/decide/counselling", { tab: "announcements", year: rs.year, round: r.round })} className={`${smallLink} text-sky`}>{roundName[r.round]} notices</Link>.
          </p>
        </section>
      ))}
    </section>
  );
}

function Step({ s }: { s: StepNow }) {
  const sc = s.scheduled;
  const dates = sc && (sc.on ? fmtIST(sc.on) : [sc.from && fmtIST(sc.from), sc.to && fmtIST(sc.to)].filter(Boolean).join(" – "));
  const why = clockNote(s);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-0 md:grid-cols-[11rem_8rem_1fr]">
      <span className="font-medium">{stepName[s.step]}</span>
      <span><Badge tone={statusBadge[s.now].tone}>{statusBadge[s.now].text}</Badge></span>
      <div className="col-span-2 grid gap-0.5 text-sm md:col-span-1">
        {(dates || s.now !== "done") && (
          <p>
            <span className="text-muted-foreground">Scheduled: </span>
            {dates ? <span className="numeric">{dates}{sc?.tentative && " (tentative)"}</span> : <Dash />}
            {dates && s.scheduledBy && s.scheduledBy.url !== s.url && <> <NoticeLink s={s.scheduledBy}>MCC schedule</NoticeLink></>}
          </p>
        )}
        {why && <p className="text-xs text-sun">{why}</p>}
        {s.note && <p className="text-xs text-muted-foreground">{fmtNote(s.note[0].toUpperCase() + s.note.slice(1))}.</p>}
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {s.date && <time dateTime={s.date} className="numeric">{fmtIST(s.date, true)}</time>}
          {s.url ? <NoticeLink s={s} /> : <span>MCC notice: <Dash /></span>}
        </p>
      </div>
    </li>
  );
}

async function Announcements({ f, params, L }: { f: Filters; params: URLSearchParams; L: DecideLinks }) {
  const [all, matching] = await Promise.all([listNotices(), listNotices({ kind: f.kind, round: f.round, year: f.year })]);
  const years = [...new Set(all.map((n) => n.year))].sort((a, b) => b - a);
  const page = Math.min(f.page, Math.max(1, Math.ceil(matching.length / PAGE_SIZE)));
  const res = { rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, page, pageSize: PAGE_SIZE };
  const here = (changes: Record<string, string | null>) => L.with("/decide/counselling", { page: null, ...changes });
  const chips = [
    f.kind && { label: kindLabel[f.kind], param: "kind", href: here({ kind: null }) },
    f.round && { label: roundName[f.round], param: "round", href: here({ round: null }) },
    f.year && { label: `PG ${f.year}`, param: "year", href: here({ year: null }) },
  ].filter((x) => !!x);
  const clear = L.to("/decide/counselling", { tab: "announcements" });

  return (
    <>
      <FilterBar action="/decide/counselling" params={params} active={chips.length} clear={clear} total={res.total} noun="notices">
        <input type="hidden" name="tab" value="announcements" />
        <Field label="Kind"><Select name="kind" value={f.kind} all="All kinds" options={noticeKinds.map((k) => ({ value: k, label: kindLabel[k] }))} /></Field>
        <Field label="Round"><Select name="round" value={f.round} all="All rounds" options={noticeRounds.map((r) => ({ value: r, label: roundName[r] }))} /></Field>
        <Field label="Year"><Select name="year" value={f.year ? String(f.year) : undefined} all="All years" options={years.map((y) => ({ value: String(y), label: `PG ${y}` }))} /></Field>
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <p id="results" tabIndex={-1} aria-live="polite" className="max-md:sr-only">
          <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> MCC notices, newest first
        </p>
        {all[0] && (
          <p className="flex flex-wrap items-center gap-x-1 text-xs">
            <Badge tone={official.tone}>{official.text}</Badge>
            <InfoTip label="the notices">
              Each notice links its MCC document. The latest in the data is from <time dateTime={all[0].date} className="numeric">{fmtIST(all[0].date, true)}</time>; anything newer is only on the MCC site.
            </InfoTip>
            {mccSite("MCC site")}
          </p>
        )}
      </div>

      {res.total === 0 ? (
        all.length ? (
          <EmptyState title="No notices match these filters." href={L.to("/decide/counselling", { tab: "announcements" })} />
        ) : (
          <EmptyState icon={Megaphone} title="No announcements loaded" description="No MCC notices are in the data, and none are ever made up. The MCC site has the current notices.">
            <MccLink />
          </EmptyState>
        )
      ) : (
        <ol className="grid gap-2" aria-label="MCC notices">
          {res.rows.map((n) => (
            <li key={`${n.date}|${n.url}|${n.title}`} className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <time dateTime={n.date} className="numeric">{fmtIST(n.date, true)}</time>
                  <span>{n.authority}, PG {n.year}{n.round && `, ${roundName[n.round]}`}</span>
                  <Badge>{kindLabel[n.kind]}</Badge>
                </p>
                <p className="mt-1 break-words">{n.title}</p>
              </div>
              {n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sm text-sky`}>
                  {/\.pdf$/i.test(n.url) ? "Official PDF" : "Official notice"}<span className="sr-only">: {n.title}, on the {n.authority} site (opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-sm">Link: <Dash /></span>
              )}
            </li>
          ))}
        </ol>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/counselling", n)} focusId="results" label="Notices" />
    </>
  );
}

async function MeritLists() {
  const lists = await meritLists();
  if (!lists.length)
    return (
      <EmptyState icon={Megaphone} title="No merit lists loaded" description="No NBEMS result is in the data, and none is ever made up. NBEMS publishes NEET PG results on its site." />
    );
  return (
    <section aria-labelledby="merit-h" className="grid gap-3">
      <div className="grid gap-1">
        <div className="flex items-center gap-1">
          <h2 id="merit-h" className="text-lg font-semibold">NEET PG results</h2>
          <InfoTip label="the NEET PG results">The NBEMS result PDFs behind Decide&apos;s score and rank history. Each year has its own maximum marks, so compare ranks across years, not scores.</InfoTip>
        </div>
        <p className="text-sm text-muted-foreground">History only: compare ranks, not scores.</p>
      </div>
      {/* A few wide rows: on a phone each is a card (stack-md, globals.css), so nothing scrolls sideways. */}
      <div role="region" aria-label="NEET PG result PDFs" tabIndex={0} className={tbl.wrap}>
        <table className={`${tbl.table} stack-md`}>
          <caption className="sr-only">NEET PG result PDFs by year, with what each covers</caption>
          <thead>
            <tr className={tbl.headRow}>
              <th scope="col" className={tbl.th}>Exam</th>
              <th scope="col" className={`${tbl.th} text-right`}>Maximum marks</th>
              <th scope="col" className={`${tbl.th} text-right`}>Candidates ranked</th>
              <th scope="col" className={tbl.th}>Who is ranked</th>
              <th scope="col" className={tbl.th}>Official documents</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.key} className={tbl.row}>
                <th scope="row" className={`${tbl.td} text-left font-medium whitespace-nowrap`}>NEET PG {l.year}</th>
                <td data-label="Maximum marks" className={tbl.num}>{formatRank(l.maxMarks)}</td>
                <td data-label="Candidates ranked" className={tbl.num}>{formatRank(l.candidates)}</td>
                <td data-label="Who is ranked" className={`${tbl.td} span-all min-w-56`}>{l.coverage}{!l.hasCategories && <span className="block text-xs text-muted-foreground">The PDF prints no category.</span>}</td>
                <td data-label="Official documents" className={`${tbl.td} span-all min-w-56`}>
                  <span className="flex flex-wrap items-center gap-x-3">
                    <Badge tone={sourceTypeLabels[l.type].tone}>{sourceTypeLabels[l.type].text}</Badge>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.name} className={`${smallLink} text-sky`}>Result PDF<span className="sr-only">: {l.name} (opens in a new tab)</span></a>
                    ) : (
                      <span>PDF: <Dash /></span>
                    )}
                    <a href={l.noticeUrl} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>NBEMS notice<span className="sr-only"> for NEET PG {l.year} (opens in a new tab)</span></a>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
