import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatINR } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { formatInrShort } from "../lib/format";
import type { Amount, Figure, ProgrammeTerms, TermPart, TermSource } from "../server/terms";
import { termLabel } from "../types";
import { smallLink } from "./ui";

// Fees, stipend and bond as ProgrammeTerms (server/terms.ts) renders them. Server-safe and client-safe on purpose (no
// "use client", type-only server imports): the institute and Fees pages render them on the server, Options rows in the browser.

/** The documents behind TermsSummary lines, for the DataSource under them (one entry per document). */
export const termDocs = (ts: Pick<ProgrammeTerms, "sources">[]) => ts.flatMap((t) => t.sources.map((s) => ({ name: `${s.label}${s.mccId ? `, MCC profile ${s.mccId}` : ""}`, url: s.url, type: s.type })));

/** "MD/MS", "Diploma (2 years)", "DNB", "NBEMS Diploma (2 years)", "MCh (6 years)". */
export const programmeTitle = (t: Pick<ProgrammeTerms, "programme" | "durationYears">) => (t.durationYears === 3 ? t.programme : `${t.programme} (${t.durationYears} years)`);

const isDnb = (t: ProgrammeTerms) => t.programme === "DNB" || t.programme === "NBEMS Diploma";

export const NBEMS_BOND_RULES = [
  { label: "NBEMS fee guidelines, 3 April 2019", url: "https://natboard.edu.in/pdoof/pbnotice2019/Notice%20Fee%20Guidelines%20-%2003-04-2019.pdf" },
  { label: "NBEMS accreditation bulletin 2025, para 5.10", url: "https://accr.natboard.edu.in/online_user/DOCUMENTS/misc/information_bulletin_chapter/Jan-feb/09-2025.pdf" },
];
// No bond record for the programme at all (the bundle has one for every college and programme with allotments).
const NOT_CHECKED = "Not checked yet: Seatora has no bond record for this programme.";
const DNB_NO_BOND = `${NOT_CHECKED} NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.`;
const MD_NO_BOND = `${NOT_CHECKED} Government colleges may still have a state service bond: check the state's PG rules.`;
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NOT_IN_DATA = "Not in Seatora's MCC data yet";

/** "—" with "not in our MCC data" for screen readers: missing is never 0 and never "no bond". */
export function NotDeclared({ what = "not in our MCC data" }: { what?: string }) {
  return <span>—<span className="sr-only">{what}</span></span>;
}

const srcName = (s: TermSource) => `${s.label}${s.year ? `, ${s.year}` : ""}${s.mccId ? `, MCC profile ${s.mccId}` : ""}`;

/** A figure's source number, linking its document; its name starts with the number shown (label in name). */
export function Sup({ n, sources }: { n: number | null | undefined; sources: TermSource[] }) {
  const s = n != null ? sources.find((x) => x.n === n) : undefined;
  if (!s) return null;
  return (
    <sup className="ml-0.5 text-[0.7em] font-normal text-muted-foreground">
      {s.url ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Source ${s.n}: ${srcName(s)} (opens in a new tab)`} className="underline hover:text-sky">{s.n}</a>
      ) : (
        <span title={srcName(s)}>{s.n}</span>
      )}
    </sup>
  );
}

const kindNote: Partial<Record<Figure["kind"], string>> = { nbems: "NBEMS fee", nmc: "NMC list: one PG figure, not split by year; allowances such as DA may be extra" };

/** A fee or stipend in full Indian grouping (a range: min–max) with what kind of figure it is and its source number; "—" when not declared. */
export function Money({ f, sources }: { f: Figure | null | undefined; sources: TermSource[] }) {
  if (!f) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {f.min != null && `${formatINR(f.min)}–`}{formatINR(f.inr)}
      <Sup n={f.src} sources={sources} />
      {f.kind === "minimum" && <Badge className="ml-1.5">minimum</Badge>}
      {kindNote[f.kind] && <span className="block text-xs font-normal text-muted-foreground">{kindNote[f.kind]}</span>}
    </span>
  );
}

/**
 * A bond or leaving amount as one figure: "₹35 L–₹50 L" (a range when it depends on course type), "up to ₹30 L" (a per
 * defaulting year amount × the years); null unless it has a ₹ figure. `full`: full Indian grouping.
 */
export function amountText(a: Amount, full = false): string | null {
  if (a.state !== "figure" || a.max == null) return null;
  const f = full ? formatINR : formatInrShort;
  return `${a.perYear ? "up to " : ""}${a.min != null && a.min !== a.max ? `${f(a.min)}–${f(a.max)}` : f(a.max)}`;
}
/** What a figure leaves out: "₹10 L × 3 yrs, computed", "incl. ₹10 L additional", "varies by specialty", "+ terms in words". */
export function amountNote(a: Amount, years: number | null): string {
  return [
    a.perYear && years ? `${formatInrShort(a.perYear)} × ${years} yrs, computed` : null,
    a.extra ? `incl. ${formatInrShort(a.extra)} additional` : null,
    a.varies ? "varies by specialty" : null,
    a.more ? "+ terms in words" : null,
  ].filter(Boolean).join("; ");
}

/** A record's rows (each with its ₹ figure, or the source's words), " · " between them. */
const partsText = (parts: TermPart[]) => parts.map((p) => p.text).join(" · ");
/** Parts with their source numbers (a penalty item's own document, else the bond's). */
function Parts({ parts, src, sources }: { parts: TermPart[]; src: number | null; sources: TermSource[] }) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {partsText([p])}
      <Sup n={p.src ?? src} sources={sources} />
    </span>
  ));
}
const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
/** "2 years", or "1 + 3 = 4 years" where the record's years are added up. */
const bondYears = (b: ProgrammeTerms["bond"]) => (b.years == null ? "Years not stated" : b.yearsSum ? `${b.yearsSum} = ${years(b.years)}` : years(b.years));
const BASIS: Record<NonNullable<ProgrammeTerms["bond"]["basis"]>, string> = { document: "the college's own document", state_rule: "state rule", nbems_rule: "NBEMS rule" };

const otherCourse = (t: ProgrammeTerms) => `Not declared for ${t.programme}: the bond on the college's MCC profile is for other courses (its exact words are below).`;

function NbemsRules() {
  return (
    <span className="flex flex-wrap gap-x-3 text-xs">
      {NBEMS_BOND_RULES.map((r) => (
        <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>{r.label}<span className="sr-only"> (PDF, opens in a new tab)</span></a>
      ))}
    </span>
  );
}

/**
 * One programme's fees, stipend and bond (college Fees tab): a year table (a 2-year course has no year 3), the
 * whole-course fee, the bond and leaving block, MCC's Round 2 forfeit, and numbered sources.
 */
export function FeesSection({ t, id, className }: { t: ProgrammeTerms; id: string; className?: string }) {
  const title = programmeTitle(t);
  const { bond, sources } = t;
  const fee1 = t.years[0]?.fee;
  const anyFee = t.years.some((y) => y.fee);
  const anyStipend = t.years.some((y) => y.stipend);
  const minimum = t.years.some((y) => y.stipend?.kind === "minimum");
  const declared = bond.status === "declared";
  const perYear = declared && bond.amount.perYear && bond.years ? bond.amount : null;
  return (
    <section aria-labelledby={id} className={cn("grid content-start gap-4", className)}>
      <h3 id={id} className="text-base font-semibold">{title}</h3>
      <table className="w-full max-w-xl text-sm">
        <caption className="sr-only">{title}: fee and stipend by year of the course</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Fee that year</th>
            <th scope="col" className="py-2 pl-3 text-right font-semibold">Stipend per month</th>
          </tr>
        </thead>
        <tbody>
          {t.years.map((y) => (
            <tr key={y.year} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Year {y.year}</th>
              <td className="numeric px-3 py-2 text-right font-semibold"><Money f={y.fee} sources={sources} /></td>
              <td className="numeric py-2 pl-3 text-right font-semibold"><Money f={y.stipend} sources={sources} /></td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Whole course</th>
            <td className="numeric px-3 py-2 text-right font-semibold">
              {t.wholeCourseFee != null ? (
                <>
                  {formatINR(t.wholeCourseFee)}
                  {fee1 && t.years.every((y) => y.fee?.inr === fee1.inr) && (
                    <span className="block text-xs font-normal text-muted-foreground">{formatINR(fee1.inr)} × {t.durationYears} years, computed from one yearly figure; year-wise fees may differ</span>
                  )}
                </>
              ) : (
                <NotDeclared />
              )}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      {(t.durationYears === 2 || !anyFee || !anyStipend || t.feeNote || minimum || t.unread.length > 0 || t.notes.length > 0) && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          {t.durationYears === 2 && <p>No year 3: a 2-year course.</p>}
          {t.notes.map((n) => <p key={n}>{n}</p>)}
          {!anyFee && !t.notes.length && !t.unread.some((u) => u.kind === "FEE") && <p>Fee: not in Seatora&apos;s MCC data yet.</p>}
          {!anyStipend && !t.notes.length && <p>Stipend: not in Seatora&apos;s MCC data yet.</p>}
          {t.feeNote && <p>Fee: {t.feeNote}{t.feeNote === "+ GST" ? " (paid to NBEMS)." : "."}</p>}
          {minimum && <p>Minimum: the hospital must pay at least this; the actual pay may be higher. Later years are not declared.</p>}
          {t.unread.map((u) => (
            <p key={u.kind}>
              {termLabel[u.kind]} as published: {u.text}<Sup n={u.src} sources={sources} />
            </p>
          ))}
        </div>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
        <dt className="text-muted-foreground">Service bond</dt>
        <dd>
          {declared ? (
            <>
              <span className="numeric font-semibold">{bondYears(bond)}</span>
              {bond.amounts.length ? ` · ${partsText(bond.amounts)}` : ` · ${amountText(bond.amount, true) ?? "amount not stated"}`}
              <Sup n={bond.src} sources={sources} />
              {bond.basis && bond.text && <span className="block text-xs text-muted-foreground">{bond.text}</span>}
              {bond.basis === "state_rule" && <span className="block text-xs text-sun">From the state&apos;s rule (its order is the source), not the college&apos;s own bond document.</span>}
              {bond.yearsText && bond.yearsText !== (bond.years != null ? years(bond.years) : null) && <span className="block text-xs text-muted-foreground">Years as written: {bond.yearsText}</span>}
              {perYear && <span className="block text-xs text-muted-foreground">{amountText(perYear, true)} for {bond.years} years (computed from the per-year amount).</span>}
              {bond.amount.varies && <span className="block text-xs text-sun">The amount varies by specialty: check the exact words below.</span>}
              {bond.otherAmounts && <span className="block text-xs text-muted-foreground">Figures for other courses or quotas are in the exact words below.</span>}
            </>
          ) : bond.status === "none" ? (
            <>
              <span className="font-semibold">No bond</span> ({BASIS[bond.basis ?? "document"]})<Sup n={bond.src} sources={sources} />
              {bond.text && <span className="block text-xs text-muted-foreground">{bond.text}</span>}
              {bond.caveat && <span className="block text-xs text-sun">{bond.basis === "nbems_rule" ? `Seatora's check: ${bond.caveat}.` : `${bond.caveat}.`}</span>}
              {bond.basis === "nbems_rule" && <NbemsRules />}
            </>
          ) : bond.status === "other_course" ? (
            <>{otherCourse(t)}<Sup n={bond.src} sources={sources} />{isDnb(t) ? <NbemsRules /> : ` ${STATE_CAUTION}`}</>
          ) : bond.text ? (
            // The record's status is unknown: its words say why (not checked yet, not declared on MCC, no clear terms).
            <>{bond.text}<Sup n={bond.src} sources={sources} />{isDnb(t) && <NbemsRules />}</>
          ) : isDnb(t) ? (
            <>{DNB_NO_BOND} <NbemsRules /></>
          ) : (
            MD_NO_BOND
          )}
          {bond.doc != null && <span className="block text-xs text-muted-foreground">The college&apos;s own bond document on MCC<Sup n={bond.doc} sources={sources} /></span>}
        </dd>
        {bond.appliesTo && (
          <>
            <dt className="text-muted-foreground">Applies to</dt>
            <dd>{bond.appliesTo}<Sup n={bond.src} sources={sources} /></dd>
          </>
        )}
        <dt className="text-muted-foreground">Leaving the course after joining</dt>
        <dd>{bond.leaving.length ? <Parts parts={bond.leaving} src={bond.src} sources={sources} /> : NOT_IN_DATA}</dd>
        {bond.otherPenalties.length > 0 && (
          <>
            <dt className="text-muted-foreground">Other penalties</dt>
            <dd><Parts parts={bond.otherPenalties} src={bond.src} sources={sources} /></dd>
          </>
        )}
        <dt className="text-muted-foreground">Resign or don&apos;t join from Round 2</dt>
        <dd>
          {t.resignForfeit ? <span className="numeric font-semibold">{formatINR(t.resignForfeit.inr)}<Sup n={t.resignForfeit.src} sources={sources} /></span> : NOT_IN_DATA}
          <span className="block text-xs text-muted-foreground">What MCC lets the college keep if you resign or don&apos;t join from Round 2. Separate from the leaving penalty.</span>
        </dd>
      </dl>
      {(bond.quote ?? bond.text) && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">{bond.quote ? "Exact words of the bond document" : "Exact words of the bond summary"}</summary>
          <blockquote className="mt-1 border-l-2 border-border pl-3 text-muted-foreground">{bond.quote ?? bond.text}</blockquote>
        </details>
      )}
      {sources.length > 0 && (
        <ol aria-label={`Sources, ${title}`} className="grid gap-1 text-xs text-muted-foreground">
          {sources.map((s) => (
            <li key={s.n}>
              <span className="numeric mr-1.5 font-semibold">{s.n}</span>
              <Badge tone={sourceTypeLabels[s.type].tone} className="mr-1.5">{sourceTypeLabels[s.type].text}</Badge>
              {s.label}{s.year ? `, ${s.year}` : ""}{s.mccId && <> · MCC profile <span className="numeric">{s.mccId}</span></>}{" "}
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className={smallLink}>open<span className="sr-only"> {srcName(s)} (opens in a new tab)</span></a>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * One line for a row or a card: "Fee ₹1.5 L/yr · Stipend ₹55,200/mo yr 1 · Bond 1 yr, ₹50 L · Leaving ₹35 L", each
 * "not declared" when missing (never "no bond": that is only a record saying so, "No bond (NBEMS rule)", with what the
 * record is unsure of), "unknown" when the record says it is, "see terms" when declared in words only (a fee as
 * published); "(state rule)" when that is the basis, "(+ state rule)" beside the college's document. For Options, Seats
 * and Allotments rows (the course's programme: service courseTerms) and the college Overview. Bond and leaving figures
 * are the same ones the Fees page sorts on (server/terms.ts Amount). `programme`: lead with the programme title.
 */
export function TermsSummary({ t, programme, className }: { t: ProgrammeTerms; programme?: boolean; className?: string }) {
  const y1 = t.years[0];
  const later = t.years.at(-1)?.fee;
  const b = t.bond;
  const nd = <span className="text-muted-foreground">not declared</span>;
  const money = (a: Amount, years: number | null) => {
    const v = amountText(a);
    if (!v) return a.state === "words" ? "see terms" : null;
    const note = amountNote(a, years);
    return note ? `${v} (${note})` : v;
  };
  const rule = b.basis === "state_rule" ? "state rule" : b.basis === "nbems_rule" ? "NBEMS rule" : b.stateRule ? (b.status === "declared" ? "+ state rule" : "a state rule may apply") : null;
  const basis = [rule, b.status === "none" ? b.caveat : null].filter(Boolean).join("; ");
  const why = basis ? ` (${basis})` : "";
  const bondText =
    b.status === "declared" ? `${[b.years != null ? `${b.yearsSum ?? b.years} yr` : b.yearsText ? "years in terms" : null, money(b.amount, b.years)].filter(Boolean).join(", ") || "see terms"}${why}`
    : b.status === "not_declared" && b.text ? "unknown" // the record says so: not checked, not declared on MCC, or no clear terms
    : null;
  const leaving = b.leaving.length ? money(b.leavingAmount, null) : null;
  const fee = y1?.fee;
  return (
    <span className={cn("numeric text-sm", className)}>
      {programme && <span className="font-semibold">{programmeTitle(t)} · </span>}
      <span>
        Fee{" "}
        {fee ? <>{fee.min != null && `${formatInrShort(fee.min)}–`}{formatInrShort(fee.inr)}/yr{fee.kind === "nbems" && " NBEMS"}{later && later.inr !== fee.inr && `, then ${formatInrShort(later.inr)}`}</>
        : t.unread.some((u) => u.kind === "FEE") ? "see terms" : nd}
      </span>
      {" · "}
      <span>Stipend {y1?.stipend ? <>{formatInrShort(y1.stipend.inr)}/mo yr 1{y1.stipend.kind === "minimum" && " min"}</> : nd}</span>
      {" · "}
      <span>{b.status === "none" ? `No bond${why}` : <>Bond {bondText ?? nd}</>}</span>
      {" · "}
      <span>Leaving {leaving ?? nd}</span>
    </span>
  );
}
