import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatINR } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { formatInrShort } from "../lib/format";
import type { Amount, Figure, ProgrammeTerms, TermPart, TermSource } from "../server/terms";
import { smallLink } from "./ui";

// Fees, stipend and bond as ProgrammeTerms (server/terms.ts) renders them. Server-safe and client-safe on purpose (no
// "use client", type-only server imports): the institute and Fees pages render them on the server, Options rows in the browser.

/** "MD/MS", "Diploma (2 years)", "DNB", "NBEMS Diploma (2 years)", "MCh (6 years)". */
export const programmeTitle = (t: Pick<ProgrammeTerms, "programme" | "durationYears">) => (t.durationYears === 3 ? t.programme : `${t.programme} (${t.durationYears} years)`);

const isDnb = (t: ProgrammeTerms) => t.programme === "DNB" || t.programme === "NBEMS Diploma";

export const NBEMS_BOND_RULES = [
  { label: "NBEMS fee guidelines, 3 April 2019", url: "https://natboard.edu.in/pdoof/pbnotice2019/Notice%20Fee%20Guidelines%20-%2003-04-2019.pdf" },
  { label: "NBEMS accreditation bulletin 2025, para 5.10", url: "https://accr.natboard.edu.in/online_user/DOCUMENTS/misc/information_bulletin_chapter/Jan-feb/09-2025.pdf" },
];
// "Not declared" is about the MCC profile fields Seatora imports: the profile may say more (e.g. in its Other Info).
const DNB_NO_BOND = "No bond declared to MCC in the profile fields Seatora imports. NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.";
const MD_NO_BOND = "Not declared on MCC in the profile fields Seatora imports. Government colleges may still have a state service bond: check the state's PG rules.";
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NOT_IN_DATA = "Not in Seatora's MCC data yet";

/** "—" with "not in our MCC data" for screen readers: missing is never 0 and never "no bond". */
export function NotDeclared({ what = "not in our MCC data" }: { what?: string }) {
  return <span>—<span className="sr-only">{what}</span></span>;
}

const srcName = (s: TermSource) => `${s.label}${s.year ? `, ${s.year}` : ""}${s.mccId ? `, MCC profile ${s.mccId}` : ""}${s.filedUnder ? `, filed under ${s.filedUnder}` : ""}`;

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

/** A fee or stipend in full Indian grouping with what kind of figure it is and its source number; "—" when not declared. */
export function Money({ f, sources }: { f: Figure | null | undefined; sources: TermSource[] }) {
  if (!f) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {formatINR(f.inr)}
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
/** What a figure leaves out: "₹10 L × 3 yrs, computed", "varies by specialty", "+ terms in words". */
export function amountNote(a: Amount, years: number | null): string {
  return [a.perYear && years ? `${formatInrShort(a.perYear)} × ${years} yrs, computed` : null, a.varies ? "varies by specialty" : null, a.more ? "+ terms in words" : null].filter(Boolean).join("; ");
}

/** Parts as published, " · " between them; a part read as "the bond amount" shows that figure. */
const partsText = (parts: TermPart[]) => parts.map((p) => (p.inr != null && !p.text.includes("₹") ? `${p.text} (${formatINR(p.inr)}, the bond amount)` : p.text)).join(" · ");

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
              {u.kind === "FEE" ? "Fee" : u.kind === "STIPEND" ? "Stipend" : "Round 2 forfeit"} as published: {u.text}<Sup n={u.src} sources={sources} />
              {u.why && <>. Not shown as the fee: {u.why}.</>}
            </p>
          ))}
        </div>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
        <dt className="text-muted-foreground">Service bond</dt>
        <dd>
          {declared ? (
            <>
              <span className="numeric font-semibold">{bond.fromAppliesTo && bond.years != null ? `${bond.years} ${bond.years === 1 ? "year" : "years"}` : (bond.yearsText ?? "Years not stated")}</span>
              {bond.amounts.length ? ` · ${partsText(bond.amounts)}` : bond.yearsText ? " · amount not stated" : ""}
              {bond.amounts.length === 0 && !bond.yearsText && bond.text && ` (${bond.text})`}
              <Sup n={bond.src} sources={sources} />
              {perYear && <span className="block text-xs text-muted-foreground">{amountText(perYear, true)} for {bond.years} years (computed from the per-year amount).</span>}
              {bond.amount.varies && <span className="block text-xs text-sun">The amount varies by specialty: check the exact words below.</span>}
              {bond.fromAppliesTo && <span className="block text-xs text-sun">Some figures for this course are read from the &quot;applies to&quot; words: check the exact words below.</span>}
              {bond.otherAmounts && <span className="block text-xs text-muted-foreground">Figures for other courses or quotas are in the exact words below.</span>}
            </>
          ) : bond.status === "other_course" ? (
            <>{otherCourse(t)}<Sup n={bond.src} sources={sources} />{isDnb(t) ? <NbemsRules /> : ` ${STATE_CAUTION}`}</>
          ) : isDnb(t) ? (
            <>{DNB_NO_BOND} <NbemsRules /></>
          ) : (
            MD_NO_BOND
          )}
        </dd>
        {bond.appliesTo && (
          <>
            <dt className="text-muted-foreground">Applies to</dt>
            <dd>{bond.appliesTo}<Sup n={bond.src} sources={sources} /></dd>
          </>
        )}
        <dt className="text-muted-foreground">Leaving the course after joining</dt>
        <dd>{declared && bond.leaving.length ? <>{partsText(bond.leaving)}<Sup n={bond.src} sources={sources} /></> : NOT_IN_DATA}</dd>
        <dt className="text-muted-foreground">Resign or don&apos;t join from Round 2</dt>
        <dd>
          {t.resignForfeit ? <span className="numeric font-semibold">{formatINR(t.resignForfeit.inr)}<Sup n={t.resignForfeit.src} sources={sources} /></span> : NOT_IN_DATA}
          <span className="block text-xs text-muted-foreground">What MCC lets the college keep if you resign or don&apos;t join from Round 2. Separate from the leaving penalty.</span>
        </dd>
      </dl>
      {bond.text && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">Exact words of the bond summary</summary>
          <blockquote className="mt-1 border-l-2 border-border pl-3 text-muted-foreground">{bond.text}</blockquote>
        </details>
      )}
      {sources.length > 0 && (
        <ol aria-label={`Sources, ${title}`} className="grid gap-1 text-xs text-muted-foreground">
          {sources.map((s) => (
            <li key={s.n}>
              <span className="numeric mr-1.5 font-semibold">{s.n}</span>
              <Badge tone={sourceTypeLabels[s.type].tone} className="mr-1.5">{sourceTypeLabels[s.type].text}</Badge>
              {s.label}{s.year ? `, ${s.year}` : ""}{s.mccId && <> · MCC profile <span className="numeric">{s.mccId}</span></>}
              {s.filedUnder && <> · filed under {s.filedUnder} in the import (this programme has none of its own)</>}{" "}
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
 * "not declared" when missing (never "no bond"), "see terms" when declared in words only. For Options, Seats and
 * Allotments rows (pick the course's programme: service termsForCourses) and the college Overview. Bond and leaving
 * figures are the same ones the Fees page sorts on (server/terms.ts Amount). `programme`: lead with the programme title.
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
  const bondText = b.status !== "declared" ? null : [b.years != null ? `${b.years} yr` : b.yearsText ? "years in terms" : null, money(b.amount, b.years)].filter(Boolean).join(", ") || "see terms";
  const leaving = b.status === "declared" ? money(b.leavingAmount, null) : null;
  return (
    <span className={cn("numeric text-sm", className)}>
      {programme && <span className="font-semibold">{programmeTitle(t)} · </span>}
      <span>Fee {y1?.fee ? <>{formatInrShort(y1.fee.inr)}/yr{y1.fee.kind === "nbems" && " NBEMS"}{later && later.inr !== y1.fee.inr && `, then ${formatInrShort(later.inr)}`}</> : nd}</span>
      {" · "}
      <span>Stipend {y1?.stipend ? <>{formatInrShort(y1.stipend.inr)}/mo yr 1{y1.stipend.kind === "minimum" && " min"}</> : nd}</span>
      {" · "}
      <span>Bond {bondText ?? nd}</span>
      {" · "}
      <span>Leaving {leaving ?? nd}</span>
    </span>
  );
}
