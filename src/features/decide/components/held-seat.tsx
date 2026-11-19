import "server-only";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/features/cutoffs/lib/format";
import { examInfo } from "@/features/exams/active";
import { quotaIn, type Exam } from "@/features/exams/exam";
import { checkedOn, docName, fromJuly2026, riskLines, type RiskLine } from "@/features/exams/held-risk";
import type { ExamKey } from "@/features/exams/keys";
import { authorityOf } from "@/features/exams/registry";
import { CHOICE_LIST } from "../lib/choices";
import { heldParts } from "../lib/held";
import type { DecideLinks } from "../lib/links";
import { fmtIST, roundName } from "../lib/round-status";
import type { Profile } from "../profile";
import { feesFor } from "../server/facts";
import { roundStatus, scheduleYear } from "../server/notices";
import { programmeOfDegree } from "../server/terms";
import { getOptionsByIds, type OptionRow } from "../service";
import type { Round } from "../types";
import { termDocs } from "./fees";
import { HeldPicker } from "./held-picker";
import { InfoTip } from "./info-tip";
import { typeCategory } from "./institute/college-type";
import { SourceRef } from "./page-sources";
import { TermStatCells } from "./stat-cells";
import { CourseKindTag, QuotaTerm, RoundTerm } from "./term";
import { NOT_PUBLISHED } from "../lib/stat-format";
import { smallLink } from "./ui";

// "I already hold a seat": her seat (profile.held, the address's `held`) and what she risks by upgrading from it, each
// line from the counselling body's own rules with its document behind an (i) (exams/held-risk.ts), then her college's
// own terms from the data. Home, Options (folded, so results stay high) and Choices. Server-only: INI-CET's rules reach
// staff's pages only.

/** How the exam names a round ("Round 1"; INI-CET's R3 "Open Round"). */
export const roundIn = (E: Exam, r: Round) => E.roundWords?.[r] ?? roundName[r];
/** Her seat's row (labelled, with its terms), or null when its id is no longer in the data. */
export const heldRow = async (profile: Profile, exam: ExamKey) => (profile.held ? ((await getOptionsByIds([profile.held.id], profile, exam))[0] ?? null) : null);

/** Each document a line rests on with its pages: "MCC bulletin, p. 45, 117". */
function cites(l: RiskLine) {
  const by = new Map<string, number[]>();
  for (const r of l.rules) by.set(docName(r), [...(by.get(docName(r)) ?? []), r.page]);
  return [...by].map(([d, ps]) => `${d}, p. ${[...new Set(ps)].join(", ")}`).join("; ");
}

/** A line's (i): each rule's body, document, page and exact words with its link; a "not published" line, what was checked. */
function LineTip({ l }: { l: RiskLine }) {
  return (
    <InfoTip label={`source: ${l.text.slice(0, 60)}`}>
      {l.gap && (
        <span className="block">
          <span className="font-semibold">{NOT_PUBLISHED}.</span> {l.gap.note.replace(/^Not stated\.?\s*/, "")} Checked in: {l.gap.checked.join("; ")}.
        </span>
      )}
      {l.rules.map((r) => (
        <span key={r.id} className="mt-1 block">
          <span className="block font-semibold">{r.body === "MCC" ? "MCC" : "AIIMS New Delhi"}{r.institute ? ` (${r.institute})` : ""}: {docName(r)}, page {r.page}</span>
          <span className="block italic">&ldquo;{r.quote}&rdquo;</span>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>Open the document<span className="sr-only"> (opens in a new tab)</span></a>
        </span>
      ))}
    </InfoTip>
  );
}

function Line({ l }: { l: RiskLine }) {
  return (
    <li className="grid gap-0.5 border-b border-border py-2 last:border-0">
      <span className="text-body">
        {l.text} <LineTip l={l} />
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        {l.rules.length > 0 && <span>{cites(l)}</span>}
        {l.gap && <Badge tone="warning">{NOT_PUBLISHED}</Badge>}
        {l.asOf && <Badge tone="warning">As of {fmtIST(checkedOn, true)}</Badge>}
        {l.rules.some(fromJuly2026) && <Badge tone="warning">From the July 2026 brochure: January 2027&apos;s is not out yet</Badge>}
      </span>
    </li>
  );
}

/** What the college's MCC form says is deducted or forfeited around counselling (the fee record's counselling_forfeit), each with its source. */
async function counsellingLines(row: OptionRow, exam: ExamKey) {
  const groups = await feesFor(row.college.key, programmeOfDegree(row.course.degree, exam), exam).catch(() => []);
  const g = groups.find((x) => x.quotas.includes(row.quota)) ?? null;
  const cf = g?.counsellingForfeit;
  if (!g || !cf) return [];
  const src = g.sources.find((s) => s.n === cf.src);
  const items = [
    ["deducted_on_reallocation", "Deducted if MCC moves you to another seat"],
    ["refunded_if_resign_during_counselling", "Refunded if you resign during counselling"],
    ["forfeited_if_resign_or_not_join_from_round2", "Forfeited if you resign or don't join, from Round 2"],
  ] as const;
  return items.flatMap(([k, label]) => {
    const x = cf[k];
    return x ? [{ label, value: [x.inr != null ? formatINR(x.inr) : null, x.percent != null ? `${x.percent}%` : null].filter(Boolean).join(" ") || null, text: x.text ?? null, doc: src ? { name: src.label, url: src.url, type: "OFFICIAL" as const } : null }] : [];
  });
}

/** Home and Choices, with no seat set: one line and the picker. */
function Prompt({ E }: { E: Exam }) {
  return (
    <section aria-label="Your current seat" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-2" data-print-hide>
      <p className="min-w-0 flex-1 basis-60 text-body">Already hold a {E.label} seat? Set it to see the options that beat it, and what you risk by upgrading before you change your {CHOICE_LIST}.</p>
      <HeldPicker current={null} />
    </section>
  );
}

/**
 * Her seat and what she risks. `where`: "options" folds the rules (the pinned "Your seat" card above the results);
 * Home and Choices show the most pressing three. No seat: Home and Choices offer the picker; Options shows nothing.
 */
export async function HeldSeat({ profile, exam, L, where, row: given, toggle }: { profile: Profile; exam: ExamKey; L: DecideLinks; where: "home" | "options" | "choices"; row?: OptionRow | null; /** Options: the Upgrades only switch, under her seat. */ toggle?: React.ReactNode }) {
  const E = await examInfo(exam);
  const held = profile.held;
  if (!held) return where === "options" ? null : <Prompt E={E} />;
  const row = given !== undefined ? given : await heldRow(profile, exam);
  const by = authorityOf(exam);
  if (!row)
    return (
      <section aria-label="Your current seat" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sun/40 bg-sun/10 px-4 py-2">
        <p className="min-w-0 flex-1 basis-60 text-body">The seat you set ({heldParts(held).degree} {heldParts(held).specialty}, {heldParts(held).quota}) isn&apos;t in Seatora&apos;s {E.label} data now. Pick it again.</p>
        <HeldPicker current={{ name: "your seat", round: held.round }} />
      </section>
    );
  const year = (await scheduleYear(exam)) ?? E.latestYear;
  // The fee record's counselling items are MCC's form fields (INI-CET's: AIIMS's round rules, ProgrammeTerms.roundRules).
  const [rs, money] = await Promise.all([roundStatus(year, exam).catch(() => null), by === "MCC" ? counsellingLines(row, exam) : []]);
  // Rounds whose final result is not out (MCC's round status: Round 2's, on hold): "If Round 2 upgrades you…" holds.
  const pending = (rs?.rounds ?? []).filter((r) => r.steps.some((s) => s.step === "final_result" && s.status !== "done")).map((r) => r.round);
  const type = row.hospital?.type?.value;
  const deemed = /deemed/i.test(row.quota) || (!!type && typeCategory[type] === "deemed");
  const { covered, lines } = riskLines({ exam, round: held.round, quota: row.quota, category: profile.category, pwd: profile.pwd, deemed, college: row.college.name, pending });
  const name = `${row.course.degree} ${row.course.name}, ${row.college.name}`;
  const top = where === "options" ? [] : lines.slice(0, 3);
  const rest = lines.slice(top.length);
  const t = row.fees;
  const doc = (n: number | undefined) => (n == null ? null : (termDocs([{ sources: t.sources.filter((s) => s.n === n) }])[0] ?? null));
  const forfeit = t.resignForfeit && by === "MCC" ? { label: "MCC form: forfeited if you resign or don't join from Round 2", value: formatINR(t.resignForfeit.inr), doc: doc(t.resignForfeit.src) } : null;
  const fold = where === "options";
  const H = fold ? "h3" : "h4";
  const terms = (
    <div className="grid gap-2">
      <H className="text-sm font-semibold">Your college&apos;s own terms ({by === "MCC" ? "its documents on MCC" : `${by}'s prospectus and rules`})</H>
      <div className="rounded-lg border border-border">
        <TermStatCells t={t} of={name} className="border-t-0" />
      </div>
      {(forfeit || money.length > 0 || (t.roundRules?.length ?? 0) > 0) && (
        <ul className="grid gap-1 text-sm">
          {forfeit && !money.some((m) => m.label.startsWith("Forfeited")) && <li>{forfeit.label}: <span className="numeric font-semibold">{forfeit.value}</span>{forfeit.doc && <SourceRef doc={forfeit.doc} />}</li>}
          {money.map((m) => (
            <li key={m.label}>
              {m.label}: {m.value ? <span className="numeric font-semibold">{m.value}</span> : "amount not published"}
              {m.text && <span className="text-muted-foreground"> (&ldquo;{m.text}&rdquo;)</span>}
              {m.doc && <SourceRef doc={m.doc} />}
            </li>
          ))}
          {t.roundRules?.map((p, i) => <li key={i}>{p.text}{doc(p.src) && <SourceRef doc={doc(p.src)!} />}</li>)}
        </ul>
      )}
    </div>
  );
  const notCovered = !covered && <p className="text-body text-muted-foreground">{by}&apos;s {E.label} round rules (upgrading, resigning, deposits) are not covered in Seatora yet: check {by}&apos;s information bulletin. Your college&apos;s own terms are below.</p>;
  const risks = (
    <>
      {!fold && <h3 className="text-sm font-semibold">What you risk if you upgrade</h3>}
      {!fold && notCovered}
      {top.length > 0 && <ul aria-label="What you risk if you upgrade">{top.map((l) => <Line key={l.key} l={l} />)}</ul>}
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-sky">
          {fold ? `What you risk if you upgrade: ${lines.length} ${lines.length === 1 ? "rule" : "rules"}, and your college's terms` : rest.length ? `${rest.length} more ${rest.length === 1 ? "rule" : "rules"}, and your college's terms` : "Your college's terms"}
        </summary>
        <div className="grid gap-3 pb-2">
          {fold && notCovered}
          {rest.length > 0 && <ul aria-label={fold ? "What you risk if you upgrade" : "More rules"}>{rest.map((l) => <Line key={l.key} l={l} />)}</ul>}
          {terms}
        </div>
      </details>
    </>
  );

  return (
    <section aria-labelledby={`held-${where}`} className="grid gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="section-label text-muted-foreground">Your seat</p>
          <h2 id={`held-${where}`} className="text-title font-semibold">
            <Link href={L.institute(row.college.slug)} className="hover:underline">{row.college.name}</Link>
          </h2>
          <p className="text-body">{row.course.degree} {row.course.name} <CourseKindTag specialty={row.course.specialty} /> · <QuotaTerm quota={row.quota} shown={quotaIn(E, row.quota)} /> · joined in <RoundTerm shown={roundIn(E, held.round)} /></p>
        </div>
        <HeldPicker current={{ name, round: held.round }} />
      </div>
      {toggle}
      {risks}
    </section>
  );
}
