import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import type { SeatRow } from "../../server/seats";
import type { SeatList } from "../../types";
import { Dash, Provisional } from "../bits";
import { SeatsHead } from "../options-view";
import { fmtDay } from "../seats/seat-lists";
import { smallLink, tbl } from "../ui";
import { reportedCount, SELF_REPORTED, ValueSource } from "./hospital-bits";
import type { AllotmentMix, ClinicalAt, ValueMeta } from "./institute-data";

// Institute page parts (src/app/decide/institutes/[slug]), server-rendered.

/** A seats column heading, e.g. "R2 seats / clear vacancy"; with the PDF's date (else its name) when the round has two lists of that kind. */
export function RoundSeatsHead({ list, lists }: { list: SeatList; lists: SeatList[] }) {
  const twin = lists.some((l) => l.key !== list.key && l.kind === list.kind);
  return (
    <>
      <SeatsHead list={list} />
      {twin && <span className="block font-normal">{list.publishedAt ? fmtDay(list.publishedAt) : list.name}</span>}
    </>
  );
}

/** One option's seats in one list, linking to them on Seats; "—" when the list prints none. `label`: sr-only context. */
export function SeatNumber({ n, href, label }: { n: number | null; href: string; label: string }) {
  if (n == null) return <Dash />;
  return (
    <Link href={href} className={`${smallLink} numeric min-w-11 justify-end font-semibold text-sky`}>
      {formatRank(n)}<span className="sr-only"> {label}</span>
    </Link>
  );
}

/** Her seat categories or every one, for the seat columns (`scat=all`). */
export function CategoryToggle({ mine, all, href }: { mine: string[]; all: boolean; href: (all: boolean) => string }) {
  const chip = (on: boolean, to: boolean, text: string) => (
    <Link
      href={href(to)}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn("inline-flex min-h-11 items-center rounded-full border px-3 text-sm", on ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input")}
    >
      {text}
    </Link>
  );
  return (
    <nav aria-label="Seat categories counted in the seat columns" className="flex flex-wrap items-center gap-2">
      {chip(!all, false, `Your seat categories: ${mine.join(", ")}`)}
      {chip(all, true, "All seat categories")}
    </nav>
  );
}

/** One seat list's rows at one institute: course, quota, seat category, seats (as the PDF printed them). */
export function CollegeSeatTable({ rows, caption }: { rows: SeatRow[]; caption: string }) {
  const td = "px-3 py-3 align-top md:px-4";
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={tbl.wrap}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Course</th>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Quota</th>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Seat category</th>
            <th scope="col" className={cn(tbl.th, "px-3 text-right md:px-4")}>Seats</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={tbl.row}>
              <th scope="row" className={cn(td, "text-left font-medium")}>{r.degree} {r.course?.name ?? r.specialty}</th>
              <td className={td}>{r.quota ?? <Dash />}</td>
              <td className={td}>{r.category}</td>
              <td className={cn(tbl.num, "px-3 md:px-4")}>{formatRank(r.seats)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Allotments per quota (row groups) × seat category: the newest result round, then each year. */
export function AllotmentMixTable({ mix, name }: { mix: AllotmentMix; name: string }) {
  const cell = "px-3 py-2 md:px-4";
  return (
    <div role="region" aria-label="Allotments by quota and seat category" tabIndex={0} className={cn(tbl.wrap, "max-w-3xl")}>
      <table className={tbl.table}>
        <caption className="sr-only">Allotments at {name} by quota and seat category: {mix.columns[0].label}, then each year</caption>
        <thead>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Quota and seat category</th>
            {mix.columns.map((c) => (
              <th key={c.label} scope="col" className={cn(tbl.th, "px-3 text-right md:px-4")}>
                <span className="numeric">{c.label}</span>
                <span className="block font-normal">{c.round ? "latest round" : "all rounds"}</span>
                <Provisional when={c.provisional} />
              </th>
            ))}
          </tr>
        </thead>
        {mix.groups.map((g) => (
          <tbody key={g.quota}>
            <tr className="border-b border-border bg-muted/40">
              <th scope="rowgroup" colSpan={mix.columns.length + 1} className={cn(cell, "text-left text-xs font-semibold text-muted-foreground")}>{g.quota}</th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.category} className={tbl.row}>
                <th scope="row" className={cn(cell, "text-left font-normal")}>{r.category} seat</th>
                {r.values.map((v, i) => <td key={mix.columns[i].label} className={cn(cell, "numeric text-right font-semibold")}>{v != null ? formatRank(v) : <Dash />}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ---------- Hospital facts (as reported): ClinicalFacts, every value self-reported by the institution ----------

type Facts = NonNullable<ClinicalAt["facts"]>;
type Said = Facts["blood_bank"];
/** Yes / No, a count (scanners) or the source's own words. */
const said = (v: Said) => (v == null ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "number" ? formatRank(v) : v);
const num = (v: number | undefined, unit = "") => (v == null ? null : `${formatRank(v)}${unit}`);

type Line = { label: string; value: React.ReactNode; note?: string | null; meta: ValueMeta | null | undefined };
type Group = { title: string; lines: Line[] };
const has = (l: Line) => l.value != null && l.value !== "";
/** Flags of a block's entry that hold for each of its values (the period's); the rest (rounded, derived, conflicting) are of some value in it. */
const PER_VALUE: ValueMeta["flags"][number][] = ["self_reported", "old"];

/**
 * Fact · as reported ("—" when not found) · period as printed · source, in row groups. `whole`: the record's block-level
 * entry, the source of every value without one of its own: each such value shows its period and source; the block's
 * other flags are said once above the table, never pinned on a value they may not be about.
 */
function FactsTable({ caption, groups, whole }: { caption: string; groups: Group[]; whole?: ValueMeta | null }) {
  const inherited = whole && { ...whole, flags: whole.flags.filter((f) => PER_VALUE.includes(f)) };
  const blockFlags = whole?.flags.filter((f) => !PER_VALUE.includes(f)) ?? [];
  return (
    <>
      {blockFlags.length > 0 && groups.some((g) => g.lines.some((l) => !l.meta && has(l))) && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>Rows without a source of their own share this one, flagged for its figures as a whole:</span>
          <ValueSource m={{ ...whole!, flags: blockFlags }} />
        </div>
      )}
      <div role="region" aria-label={caption} tabIndex={0} className={tbl.wrap}>
        {/* Fixed columns from md: the hospital's table and each course's line up. Phones: columns fit their text. */}
        <table className={cn(tbl.table, "md:min-w-[44rem] md:table-fixed")}>
          <caption className="sr-only">{caption}. {SELF_REPORTED}.</caption>
          <colgroup><col className="w-[26%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[30%]" /></colgroup>
          <thead>
            <tr className={tbl.headRow}>
              <th scope="col" className={tbl.th}>Fact</th>
              <th scope="col" className={cn(tbl.th, "text-right")}>As reported</th>
              <th scope="col" className={tbl.th}>Period</th>
              <th scope="col" className={tbl.th}>Source</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              {groups.length > 1 && (
                <tr className="border-b border-border bg-muted/40">
                  <th scope="rowgroup" colSpan={4} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{g.title}</th>
                </tr>
              )}
              {g.lines.map((l) => {
                const m = l.meta ?? inherited;
                return (
                  <tr key={l.label} className={tbl.row}>
                    <th scope="row" className={cn(tbl.td, "text-left font-normal text-muted-foreground")}>{l.label}</th>
                    <td className={cn(tbl.td, "text-right font-semibold break-words", typeof l.value === "string" && /^[\d,.]+[%+]?$/.test(l.value) && "numeric")}>
                      {has(l) ? l.value : <Dash />}
                      {has(l) && l.note && <span className="block text-xs font-normal text-muted-foreground">{l.note}</span>}
                    </td>
                    <td className={cn(tbl.td, "text-xs text-muted-foreground")}>{has(l) && m?.period}</td>
                    <td className={tbl.td}>{has(l) && <ValueSource m={m} />}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

const DISCLOSURE: Record<ClinicalAt["disclosure"]["status"], string> = {
  found: "found on the hospital's site",
  not_found: "not found on the hospital's site",
  blocked: "the hospital's site blocks automated checks",
  na: "not applicable here",
};

/**
 * The Hospital facts card: hospital-wide facts grouped (capacity, workload, facilities, stipend), then each course's
 * department record (hers first), every value with its period, source, check date and flags; the NBEMS mandatory
 * disclosure check. Nothing is filled in: "—" when not found.
 */
export function HospitalFacts({ f, name }: { f: ClinicalAt; name: string }) {
  const d = f.disclosure;
  const facts: Partial<Facts> = f.facts ?? {};
  // A value's own source; else its block's ("facts", "courses[i]"; FactsTable `whole`).
  const meta = (path: string) => f.values_meta?.[path];
  const fact = (key: keyof Facts, label: string, value: React.ReactNode, note?: string | null): Line => ({ label, value, note, meta: meta(`facts.${key}`) });
  const sd = f.stipend_disclosed;
  const sdMeta = meta("stipend_disclosed");
  const groups: Group[] = [
    {
      title: "Capacity",
      lines: [
        fact("beds_total", "Beds", facts.beds_total != null ? reportedCount({ n: facts.beds_total, meta: meta("facts.beds_total"), own: true }).text : null, facts.beds_kind),
        fact("icu_beds", "ICU beds", num(facts.icu_beds)),
        fact("operating_theatres", "Operating theatres", num(facts.operating_theatres)),
      ],
    },
    {
      title: "Workload",
      lines: [
        fact("hospital_opd_year", "Outpatients (OPD) a year", num(facts.hospital_opd_year)),
        fact("hospital_opd_day", "Outpatients (OPD) a day", num(facts.hospital_opd_day)),
        fact("hospital_ipd_year", "Inpatients (IPD) a year", num(facts.hospital_ipd_year)),
        fact("occupancy_pct", "Bed occupancy", num(facts.occupancy_pct, "%")),
        fact("deliveries_year", "Deliveries a year", num(facts.deliveries_year)),
      ],
    },
    {
      title: "Facilities",
      lines: [
        fact("emergency_24x7", "Emergency, 24×7", said(facts.emergency_24x7)),
        fact("blood_bank", "Blood bank", said(facts.blood_bank)),
        fact("ct", "CT", said(facts.ct)),
        fact("mri", "MRI", said(facts.mri)),
        fact("cath_lab", "Cath lab", said(facts.cath_lab)),
        fact("accommodation", "Accommodation", said(facts.accommodation)),
        fact("library", "Library", said(facts.library)),
        fact("e_library", "E-library", said(facts.e_library)),
        fact("ethics_committee", "Ethics committee", said(facts.ethics_committee)),
      ],
    },
    {
      title: "Stipend",
      lines: [
        {
          label: "Stipend disclosed, a month",
          value: sd && `${[sd.y1, sd.y2, ...(sd.y3 != null ? [sd.y3] : [])].map(formatINR).join(" / ")} (yr 1/2${sd.y3 != null ? "/3" : ""})`,
          note: sd && sd.period !== sdMeta?.period ? sd.period : null,
          meta: sdMeta,
        },
      ],
    },
  ];
  return (
    <section aria-labelledby="facts-h" className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-1">
        <h2 id="facts-h" className="text-lg font-semibold">Hospital facts (as reported)</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {SELF_REPORTED}: each figure is what the institution published (its website, NIRF data, NMC or NBEMS pages), with the period it covers, where Seatora read it and when.
          &quot;—&quot; means Seatora did not find it, not zero.
        </p>
      </div>
      <p className="text-sm">
        <span className="font-semibold">NBEMS mandatory disclosure: </span>
        {DISCLOSURE[d.status]}
        {d.checked && <> (as of <span className="numeric">{fmtDay(d.checked)}</span>)</>}
        {d.url && (
          <>
            {" "}
            <a href={d.url} target="_blank" rel="noopener noreferrer" className={cn(smallLink, "text-sky")}>{d.status === "found" ? "open the disclosure" : "the hospital's site"}<span className="sr-only"> (opens in a new tab)</span></a>
          </>
        )}
      </p>
      <FactsTable caption={`Hospital facts at ${name}, as reported`} groups={groups} whole={meta("facts")} />
      {f.courses.length > 0 && (
        <div className="grid gap-4">
          <h3 className="text-base font-semibold">By course, as reported</h3>
          {f.courses.map((c) => {
            const m = (k: string) => meta(`courses[${c.i}].${k}`);
            const t = c.trainees;
            const trainees = t && (["registered", "left", "passed", "failed", "awaited"] as const).filter((k) => t[k] != null).map((k) => `${formatRank(t[k]!)} ${k === "awaited" ? "results awaited" : k}`).join(" · ");
            return (
              <section key={c.i} aria-label={c.course} className="grid gap-2">
                <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{c.course}{c.mine && <Badge tone="info">In your profile</Badge>}</h4>
                <FactsTable
                  caption={`${c.course} at ${name}, as reported`}
                  whole={meta(`courses[${c.i}]`)}
                  groups={[{ title: c.course, lines: [
                    { label: "Department beds", value: num(c.dept_beds), meta: m("dept_beds") },
                    { label: "Outpatients (OPD) a year", value: num(c.opd_year), meta: m("opd_year") },
                    { label: "Inpatients (IPD) a year", value: num(c.ipd_year), meta: m("ipd_year") },
                    { label: "Major surgeries", value: num(c.major_surgeries), meta: m("major_surgeries") },
                    { label: "Minor surgeries", value: num(c.minor_surgeries), meta: m("minor_surgeries") },
                    { label: "Rotation", value: c.rotation, meta: m("rotation") },
                    { label: "Trainee record", value: trainees || null, meta: m("trainees") },
                    { label: "First accredited", value: c.first_accreditation, meta: m("first_accreditation") },
                    { label: "Accreditation valid up to", value: c.valid_up_to, meta: m("valid_up_to") },
                  ] }]}
                />
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
