import "server-only";
import { db } from "@/lib/db";
import { seatGroups, type MccClinicalFacts, type MccFeesStructured } from "@/features/cutoffs/lib/import-schema";
import { getCatalog } from "./catalog";
import type { Programme } from "./terms";

// Bundle schema 2 tables (prisma/import-mcc.ts): ClinicalFacts and FeesStructured, JSONB validated on import
// (import-schema.ts). Raw SQL, like CollegeTerm.details: the shared generated client needn't know the tables.

/** A college's self-reported clinical facts; `values_meta` gives each value's source, period, check date and flags. */
export type ClinicalFacts = Omit<MccClinicalFacts, "key" | "nbems_disclosure"> & {
  /** NBEMS mandatory disclosure on the hospital's site: found / not_found / blocked / na, where, and when checked (YYYY-MM-DD). */
  disclosure: { status: MccClinicalFacts["nbems_disclosure"]["status"]; url: string | null; checked: string | null };
};

/** Clinical facts of a college (College.key); null when the import has none. */
export async function clinicalFactsFor(collegeKey: string): Promise<ClinicalFacts | null> {
  await getCatalog(); // same availability and access as the rest of Decide
  const [row] = await db.$queryRaw<{ data: Omit<ClinicalFacts, "disclosure">; status: ClinicalFacts["disclosure"]["status"]; url: string | null; checked: string | null }[]>`
    SELECT f.data, f."disclosureStatus" AS status, f."disclosureUrl" AS url, to_char(f."checkedAt", 'YYYY-MM-DD') AS checked
    FROM "ClinicalFacts" f JOIN "College" c ON c.id = f."collegeId" WHERE c.key = ${collegeKey}`;
  return row ? { ...row.data, disclosure: { status: row.status, url: row.url, checked: row.checked } } : null;
}

/** FeesStructured.data: the bundle record without id, key, college, state, programme and seat groups. */
export type FeeRecord = Omit<MccFeesStructured, "id" | "key" | "college" | "state" | "programme" | "seat_groups">;
type Text = { text: string | null; src: NonNullable<FeeRecord["fee_text_src"]> | null };
/**
 * One seat-type group's terms for a programme. `fee.display` "numbers": the year figures may be shown (`perYear`, null
 * = not stated; an entry with `maximum` is the NBEMS ceiling, never the college's figure); "verbatim": only the
 * profile's words (`text`, linked to `src`), never a figure. Stipend entries with `minimum` are the NBEMS floor.
 */
export type FeeQuotaGroup = {
  /** Seat-type groups with identical figures, joined by "+", e.g. "All India+DNB Quota". */
  quotaGroup: string;
  groups: (typeof seatGroups)[number][];
  /** The MCC quotas these groups cover. */
  quotas: string[];
  years: number;
  fee:
    | (Text & {
        display: "numbers";
        perYear: FeeRecord["fee_per_year"];
        wholeCourse: FeeRecord["fee_whole_course"] | null;
        includesHostel: FeeRecord["fee_includes_hostel"] | null;
        otherFees: NonNullable<FeeRecord["other_fees"]>;
        variants: NonNullable<FeeRecord["fee_variants"]>;
        notes: string[];
      })
    | (Text & { display: "verbatim"; /** Figures its words state for these seats, each with its quote (tools/parse_fee_text.py); null: none. */ parsed: FeeRecord["fee_parsed"] | null });
  stipendPerMonth: FeeRecord["stipend_per_month"];
  stipendNote: string | null;
  bond: FeeRecord["bond"];
  leavingPenalty: NonNullable<FeeRecord["leaving_penalty"]>;
  counsellingForfeit: FeeRecord["counselling_forfeit"] | null;
  hostel: FeeRecord["hostel_available"] | null;
  /** Numbered: every figure's `src` is an `n` here. */
  sources: FeeRecord["sources"];
  notes: string[];
};

/** A stored record as shown. fee_display absent (an export older than it) counts as verbatim: no figure is shown unchecked. */
export function feeGroup(quotaGroup: string, d: FeeRecord): FeeQuotaGroup {
  const text: Text = { text: d.fee_text ?? null, src: d.fee_text_src ?? null };
  return {
    quotaGroup,
    groups: quotaGroup.split("+") as FeeQuotaGroup["groups"],
    quotas: d.quotas,
    years: d.duration_years,
    fee:
      d.fee_display === "numbers"
        ? {
            display: "numbers",
            ...text,
            perYear: d.fee_per_year,
            wholeCourse: d.fee_whole_course ?? null,
            includesHostel: d.fee_includes_hostel ?? null,
            otherFees: d.other_fees ?? [],
            variants: d.fee_variants ?? [],
            notes: d.fee_notes ?? [],
          }
        : { display: "verbatim", ...text, parsed: d.fee_parsed ?? null },
    stipendPerMonth: d.stipend_per_month,
    stipendNote: d.stipend_note ?? null,
    bond: d.bond,
    leavingPenalty: d.leaving_penalty ?? [],
    counsellingForfeit: d.counselling_forfeit ?? null,
    hostel: d.hostel_available ?? null,
    sources: d.sources,
    notes: d.notes ?? [],
  };
}

const groupPos = (g: string) => seatGroups.indexOf(g.split("+")[0] as (typeof seatGroups)[number]);

/** Fee, stipend, bond and penalties of a college's programme by seat-type group (All India, Deemed/Paid, NRI, DNB Quota order); [] when none (MCh, MPH). */
export async function feesFor(collegeKey: string, programme: Programme): Promise<FeeQuotaGroup[]> {
  await getCatalog();
  const rows = await db.$queryRaw<{ g: string; data: FeeRecord }[]>`
    SELECT f."quotaGroup" AS g, f.data FROM "FeesStructured" f JOIN "College" c ON c.id = f."collegeId"
    WHERE c.key = ${collegeKey} AND f.programme = ${programme}`;
  return rows.map((r) => feeGroup(r.g, r.data)).sort((a, b) => groupPos(a.quotaGroup) - groupPos(b.quotaGroup));
}
