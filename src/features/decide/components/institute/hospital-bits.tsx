import { Badge } from "@/components/ui/badge";
import type { MccClinicalFacts } from "@/features/cutoffs/lib/import-schema";
import { formatRank } from "@/features/cutoffs/lib/format";
import { fmtDay } from "../../lib/format";
import { collegeTypeLabel, inferred, typeNote, type CollegeType } from "./college-type";

// Bundle schema 2 college bits the institute page (server) and the Seats matrix (client) both render, so client-safe:
// the college type badge (college-type.ts) and a clinical value's source line (ClinicalFacts values_meta: every value
// self-reported by the institution).

/** "Private", with how it was inferred as its tooltip (and for screen readers). `note`: also say so in visible text. */
export function TypeBadge({ type, note }: { type: CollegeType; note?: boolean }) {
  const why = typeNote(type);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge title={why}>
        {collegeTypeLabel[type.value]}
        <span className="sr-only">: {why}</span>
      </Badge>
      {note && <span aria-hidden className="text-xs text-muted-foreground">{inferred(type) ? "inferred from name and quota" : "from Seatora's research"}</span>}
    </span>
  );
}

/** One clinical value's provenance: source kind and URL, the period as printed, when Seatora checked it, flags. */
export type ValueMeta = NonNullable<MccClinicalFacts["values_meta"]>[string];

export const SELF_REPORTED = "Self-reported by the hospital, not verified by Seatora";

/**
 * A reported count as the source prints it: "270+" where its own entry says rounded. `flags`: the ones about this
 * count (Hospital facts' rule): its own entry's, else only the period's ("old") of the block it inherits, whose other
 * flags may be about another figure. `conflicting`: its own entry says the source prints two figures. `meta`: its source
 * for ValueSource, with only those flags (and self-reported), so a (i) never pins the block's other flags on it.
 */
export function reportedCount(b: { n: number; meta: ValueMeta | null | undefined; own: boolean }) {
  const flags = (b.meta?.flags ?? []).filter((f) => f !== "self_reported" && (b.own || f === "old"));
  const meta = b.meta && { ...b.meta, flags: b.meta.flags.filter((f) => f === "self_reported" || flags.includes(f)) };
  return { text: `${formatRank(b.n)}${flags.includes("rounded") ? "+" : ""}`, conflicting: flags.includes("conflicting"), flags, meta };
}

const sourceKind: Record<string, string> = {
  hospital_site: "Hospital website",
  nirf: "NIRF data (the institution's submission)",
  nmc_proforma: "NMC pro-forma on the college's site",
  nbems_disclosure: "NBEMS mandatory disclosure",
  msr_clinical_material: "Clinical material page (NMC MSR)",
  hospital_statistics_page: "Hospital statistics page",
  hospital_annual_report: "Hospital annual report",
  college_annual_report: "College annual report",
  stock_exchange_filing: "Stock exchange filing",
  mcc_profile: "MCC institute profile",
  other: "Document",
};
export const flagLabel: Record<ValueMeta["flags"][number], string | null> = {
  self_reported: null, // every value is: said once per value in its source line
  old: "old: period ends before 2024",
  rounded: "rounded figure",
  derived: "derived: computed from the source's figures",
  conflicting: "the source prints conflicting figures",
};

/** A flag in a few words, where the value shows (the full words in its (i)); rounded has none: the count's "+" says it. */
export const flagShort: Partial<Record<ValueMeta["flags"][number], string>> = { old: "old figure", derived: "derived", conflicting: "conflicting figures" };

/** The kind of document a value comes from ("NIRF data (the institution's submission)"). */
export const sourceName = (m: Pick<ValueMeta, "source_type">) => sourceKind[m.source_type] ?? m.source_type.replace(/_/g, " ");

/** A value's source line: the kind of document (linked), self-reported, checked date; its flags as badges. */
export function ValueSource({ m }: { m: ValueMeta | null | undefined }) {
  if (!m) return null;
  const name = sourceName(m);
  return (
    <span className="grid gap-1 text-xs text-muted-foreground">
      <span>
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">{name}<span className="sr-only"> (opens in a new tab)</span></a>
        {m.flags.includes("self_reported") && " · self-reported"} · checked <span className="numeric">{fmtDay(m.checked)}</span>
      </span>
      {m.flags.some((f) => flagLabel[f]) && (
        <span className="flex flex-wrap gap-1">{m.flags.map((f) => flagLabel[f] && <Badge key={f} tone="warning">{flagLabel[f]}</Badge>)}</span>
      )}
    </span>
  );
}
