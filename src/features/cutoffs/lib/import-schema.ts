import { z } from "zod";

/** Records of the MCC export bundle (neetpg-planner tools/export_medpath.py). `.strict()` rejects any extra key, so a
 * bundle that ever carried names, roll numbers or application ids would fail validation instead of being imported. */

export const mccRounds = ["R1", "R2", "R3", "stray", "special_stray"] as const;
export const mccCategories = ["Open", "OBC", "SC", "ST", "EWS", "Open PwD", "OBC PwD", "SC PwD", "ST PwD", "EWS PwD"] as const;
export const termKinds = ["FEE", "STIPEND", "BOND", "PENALTY"] as const;
export const programs = ["MD", "DNB"] as const;

const year = z.number().int().min(2000).max(2100);
const rank = z.number().int().positive();
const ikey = z.string().regex(/^[A-Z0-9]{1,40}(#(\d{6})?)?$/, "Expected <letters>[#<PIN>]");

export const mccSourceSchema = z
  .object({
    key: z.string().regex(/^mcc\/\d{4}\/[\w.-]+\.pdf$/),
    url: z.url(),
    year,
    round: z.enum(mccRounds),
    provisional: z.boolean(),
    name: z.string().min(1),
  })
  .strict();
export type MccSource = z.infer<typeof mccSourceSchema>;

export const mccCollegeSchema = z
  .object({
    key: ikey,
    name: z.string().min(1),
    state: z.string().min(1).nullable(),
    pincode: z.string().regex(/^\d{6}$/).nullable(),
    /** Address as printed by MCC (official name + address part); null when MCC only printed a short name. */
    address: z.string().min(1).max(300).nullable(),
  })
  .strict();
export type MccCollege = z.infer<typeof mccCollegeSchema>;

/** Institution type of the bundle (a name and quota heuristic, not an official field: `basis` says how it was inferred). */
export const collegeTypes = ["govt", "private", "trust", "deemed", "central", "esic", "municipal", "armed_forces", "psu", "railway"] as const;
/** Schema 2 adds: every MCC institute id the seat PDFs print for the college, its main id's MCC profile, the type, the website its own MCC profile declares. */
export const mccCollegeV2Schema = mccCollegeSchema
  .extend({
    mcc_ids: z.array(z.string().regex(/^\d{6}$/)),
    mcc_profile_url: z.url().nullable(),
    type: z.object({ value: z.enum(collegeTypes), basis: z.string().min(1) }).strict(),
    /** As declared on the MCC profile ("www.…"), so not always a full URL; one link, never an address or an e-mail. */
    website: z.string().regex(/^[^\s@,]+$/).nullable(),
  })
  .strict()
  .refine((c) => (c.mcc_profile_url == null) === (c.mcc_ids.length === 0) && (!c.mcc_profile_url || c.mcc_ids.some((id) => c.mcc_profile_url!.endsWith(`InstituteId=${id}`))), {
    message: "mcc_profile_url must be the profile of one of mcc_ids (null only without ids)",
    path: ["mcc_profile_url"],
  });
export type MccCollegeV2 = z.infer<typeof mccCollegeV2Schema>;

export const mccCourseSchema = z
  .object({
    degree: z.string().min(1),
    specialty: z.string().regex(/^[A-Z0-9]+$/),
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  })
  .strict();
export type MccCourse = z.infer<typeof mccCourseSchema>;

export const mccCutoffSchema = z
  .object({
    ikey,
    degree: z.string().min(1),
    specialty: z.string().regex(/^[A-Z0-9]+$/),
    year,
    round: z.enum(mccRounds),
    quota: z.string().min(1),
    category: z.enum(mccCategories),
    opening: rank,
    closing: rank,
    n: z.number().int().positive(),
    src: z.string().min(1),
  })
  .strict()
  .refine((c) => c.opening <= c.closing, { message: "opening rank is worse than closing rank", path: ["opening"] });
export type MccCutoff = z.infer<typeof mccCutoffSchema>;

export const allotmentStatuses = ["allotted", "fresh", "upgraded"] as const;

/** One seat allotment as printed by MCC: rank and seat only. */
export const mccAllotmentSchema = z
  .object({
    year,
    round: z.enum(mccRounds),
    rank,
    quota: z.string().min(1),
    category: z.enum(mccCategories),
    ikey,
    degree: z.string().min(1),
    specialty: z.string().regex(/^[A-Z0-9]+$/),
    status: z.enum(allotmentStatuses),
    src: z.string().min(1),
  })
  .strict();
export type MccAllotment = z.infer<typeof mccAllotmentSchema>;

/** The allotted candidate's own category as the PDF prints it (not the seat category). */
export const candidateCategories = ["General", "OBC", "SC", "ST", "EWS", "General PwD", "OBC PwD", "SC PwD", "ST PwD", "EWS PwD"] as const;
/** The remark the PDF prints in the previous round's columns. */
export const prevRemarks = ["reported", "not_reported", "seat_surrendered", "seat_cancelled"] as const;
const prevFields = ["prev_ikey", "prev_degree", "prev_specialty", "prev_quota", "prev_remark"] as const;
/**
 * Schema 2 adds the candidate's own category, the choice number of the allotted seat (R2 / R3 PDFs only) and the seat
 * the PDF prints in the previous round's columns (R2 / R3; all prev_* null where it prints "-"). No names.
 */
export const mccAllotmentV2Schema = mccAllotmentSchema
  .extend({
    candidate_category: z.enum(candidateCategories),
    option_no: z.number().int().positive().nullable(),
    prev_ikey: ikey.nullable(),
    prev_degree: z.string().min(1).nullable(),
    prev_specialty: z.string().regex(/^[A-Z0-9]+$/).nullable(),
    prev_quota: z.string().min(1).nullable(),
    prev_remark: z.enum(prevRemarks).nullable(),
  })
  .strict()
  .refine((a) => (a.option_no != null) === (a.round === "R2" || a.round === "R3"), { message: "option_no is printed in R2 / R3 only", path: ["option_no"] })
  .refine((a) => prevFields.every((f) => a[f] == null) || (prevFields.every((f) => a[f] != null) && (a.round === "R2" || a.round === "R3")), {
    message: "prev_* are all set (R2 / R3 only) or all null",
    path: ["prev_ikey"],
  })
  .refine((a) => (a.round === "R2" || a.round === "R3" ? a.status !== "allotted" : a.status === "allotted"), { message: "status allotted in R1 / stray rounds only", path: ["status"] });
export type MccAllotmentV2 = z.infer<typeof mccAllotmentV2Schema>;

const inr = z.number().int().nonnegative().max(2_147_483_647);
const words = z.string().nullable().optional();
/** A document a record cites; `mirror`: an archived copy of the same file where the official site blocks automated access (`note` says so). */
const doc = z.object({ title: z.string().min(1), url: z.url(), date: z.string().nullable().optional(), mirror: z.url().optional(), note: z.string().optional() }).strict();
const bondAmount = z.object({ applies_to: z.string(), inr: inr.nullable() }).strict();
/** documented / no_bond_verified: the college's own document says a bond / no bond (older bundles: yes / no / unclear). */
export const bondStatuses = ["documented", "no_bond_verified", "state_rule", "no_bond_rule", "unknown", "yes", "no", "unclear"] as const;
export const bondCourses = ["MD/MS", "Diploma", "DNB", "NBEMS Diploma"] as const;
/** A verified bond record (BOND `details`): who checked what, in which document. Free text stays as the source has it. */
export const bondDetailsSchema = z
  .object({
    status: z.enum(bondStatuses),
    years: z.union([z.number().nonnegative(), z.string()]).nullable().optional(),
    amounts: z.array(bondAmount).optional(),
    /** MD = MD/MS + Diploma, DNB = DNB + NBEMS Diploma: where the two differ, one entry per course. */
    by_course: z.array(z.object({ course: z.enum(bondCourses), status: z.enum(bondStatuses), text: z.string().min(1), amount_inr: inr.nullable(), src_url: z.url().nullable() }).strict()).optional(),
    /** Specialty code → amount, where the bond varies by subject. */
    by_subject: z.record(z.string().regex(/^[A-Z0-9]+$/), inr.nullable()).optional(),
    applies_to: words,
    conditions: words,
    quote: words,
    note: words,
    penalty: words,
    state: words,
    reason: words,
    confidence: words,
    doc_url: z.url().nullable().optional(),
    doc_year: z.union([z.string(), z.number()]).nullable().optional(),
    checked: z.boolean().optional(),
    document_mcc_id: z.string().optional(),
    source: z.union([doc, z.array(doc)]).optional(),
    state_rule: z
      .object({ status: z.enum(bondStatuses), years: words, amounts: z.array(bondAmount).optional(), penalty: words, applies_to: words, source: doc.optional(), state: words, note: words, text: words })
      .strict()
      .optional(),
  })
  .strict();
export type BondDetails = z.infer<typeof bondDetailsSchema>;
/** leaving_penalty: leaving or discontinuing the seat or course; counselling_forfeit: MCC's resign / don't join from Round 2 amount; other: bans, refunds, formulas. */
export const penaltyKinds = ["leaving_penalty", "counselling_forfeit", "other"] as const;
export const penaltyDetailsSchema = z
  .object({
    items: z.array(z.object({ kind: z.enum(penaltyKinds), applies_to: z.string(), inr: inr.nullable(), when: z.string(), quote: z.string().nullable(), source_url: z.url().nullable() }).strict()).min(1),
    note: words,
    document_mcc_id: z.string().optional(),
    state: words,
  })
  .strict();
export type PenaltyDetails = z.infer<typeof penaltyDetailsSchema>;

/** The DataSource name of a term document, by its host (the importer names them; Decide labels them from it). */
export function termSourceName(url: string) {
  const host = new URL(url).hostname;
  return host.includes("mcc.admissions") ? "MCC institute profile (college declaration)" : host.includes("natboard") ? "NBEMS notice" : `Official document (${host})`;
}

/**
 * Where hides move on an import (HiddenResident is by place: PIN code, or the key of a college without one): each college
 * in the database whose place differs under the key it has now (`now`: its own key, the key a retired one became, or
 * undefined / null when gone). `placeAfter`: the bundle's place per college key.
 */
export function movedPlaces(before: { key: string; pincode: string | null }[], placeAfter: Map<string, string>, now: (key: string) => string | null | undefined) {
  return before.flatMap((c) => {
    const to = placeAfter.get(now(c.key) ?? "");
    return to && to !== (c.pincode ?? c.key) ? [{ from: c.pincode ?? c.key, to }] : [];
  });
}

/** Schema 2 FEE / STIPEND `details`: the fee-table records (fees_structured.ndjson) the term is made from, as they are. */
const feeTermDetailsSchema = z.object({ records: z.array(z.lazy(() => mccFeesStructuredSchema)).min(1) }).strict();
/**
 * `details`: every BOND and PENALTY has its record; FEE and STIPEND none (schema 1) or their fee-table records (schema 2).
 * `src_url` null: a BOND whose status is unknown and has no document (the importer gives it the bond check as source).
 */
export const mccTermSchema = z
  .object({
    ikey,
    program: z.enum(programs),
    kind: z.enum(termKinds),
    text: z.string().min(1),
    amount_inr: inr.nullable(),
    src_url: z.url().nullable(),
    details: z.union([bondDetailsSchema, penaltyDetailsSchema, feeTermDetailsSchema]).optional(),
  })
  .strict()
  .refine((t) => (t.kind === "BOND" ? !!t.details && "status" in t.details : t.kind === "PENALTY" ? !!t.details && "items" in t.details : !t.details || "records" in t.details), {
    message: "BOND needs its bond record, PENALTY its penalty items, FEE and STIPEND none or their fee-table records",
    path: ["details"],
  })
  .refine((t) => t.src_url != null || (t.details && "status" in t.details && t.details.status === "unknown"), { message: "only an unknown bond may have no source", path: ["src_url"] });
export type MccTerm = z.infer<typeof mccTermSchema>;

// ---------- schema 2: clinical facts and the per-year fee table (stored as JSONB; every key known, nothing else) ----------
const count = z.number().int().nonnegative();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A yes / no, or the source's words (and for scanners a count) where it says more. */
const said = z.union([z.boolean(), z.string().min(1), count]);
export const disclosureStatuses = ["found", "not_found", "blocked", "na"] as const;
export const clinicalFlags = ["self_reported", "old", "rounded", "derived", "conflicting"] as const;
/** One college's self-reported clinical facts (data/curated/clinical_facts.json); a field is left out where unknown, never 0. */
export const mccClinicalFactsSchema = z
  .object({
    key: ikey,
    kind: z.enum(["medical_college", "both", "govt_dnb", "private_dnb", "trust_dnb"]),
    nbems_disclosure: z.object({ status: z.enum(disclosureStatuses), url: z.url().optional(), checked: isoDay.optional() }).strict(),
    facts: z
      .object({
        beds_total: count,
        beds_kind: z.string().min(1),
        icu_beds: count,
        hospital_opd_day: z.number().nonnegative(),
        hospital_opd_year: count,
        hospital_ipd_year: count,
        occupancy_pct: z.number().nonnegative().max(200),
        operating_theatres: count,
        deliveries_year: count,
        emergency_24x7: said,
        blood_bank: said,
        ct: said,
        mri: said,
        cath_lab: said,
        accommodation: said,
        library: said,
        e_library: said,
        ethics_committee: said,
      })
      .partial()
      .strict()
      .optional(),
    courses: z
      .array(
        z
          .object({
            course: z.string().min(1),
            first_accreditation: z.string().min(1).optional(),
            valid_up_to: z.string().min(1).optional(),
            dept_beds: count.optional(),
            opd_year: count.optional(),
            ipd_year: count.optional(),
            major_surgeries: count.optional(),
            minor_surgeries: count.optional(),
            rotation: z.string().min(1).optional(),
            trainees: z.object({ registered: count, left: count, passed: count, failed: count, awaited: count }).partial().strict().optional(),
            period: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    stipend_disclosed: z.object({ y1: count, y2: count, y3: count.optional(), period: z.string().min(1) }).strict().optional(),
    /** Provenance per value: "facts", "facts.<field>", "courses[<i>]", "courses[<i>].<field>", "stipend_disclosed". */
    values_meta: z
      .record(
        z.string().regex(/^(facts(\.\w+)?|courses\[\d+\](\.\w+)?|stipend_disclosed)$/),
        z.object({ source_type: z.string().regex(/^[a-z_]+$/), url: z.url(), period: z.string().min(1), checked: isoDay, flags: z.array(z.enum(clinicalFlags)).min(1) }).strict(),
      )
      .optional(),
  })
  .strict();
export type MccClinicalFacts = z.infer<typeof mccClinicalFactsSchema>;

/** Paths of a clinical-facts record that hold a value, each of which needs its values_meta entry (or its parent's). */
export function clinicalValuePaths(r: MccClinicalFacts): string[] {
  return [...Object.keys(r.facts ?? {}).map((f) => `facts.${f}`), ...(r.courses ?? []).map((_, i) => `courses[${i}]`), ...(r.stipend_disclosed ? ["stipend_disclosed"] : [])];
}

const src = z.number().int().positive();
const money = z.number().int().nonnegative();
const currency = z.enum(["INR", "USD"]);
const yes = z.literal(true);
const feeEntry = z
  .object({
    amount: money.optional(),
    amount_max: money.optional(),
    currency,
    kind: z.enum(["declared_for_year", "amount_at_admission", "annual_fee", "nbems_ceiling", "text"]),
    /** An NBEMS ceiling, never the college's figure. */
    maximum: yes.optional(),
    above_nbems_ceiling: yes.optional(),
    declared_amount: money.optional(),
    gst_src: src.optional(),
    note: z.string().min(1).optional(),
    varies_by: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    src,
  })
  .strict()
  .refine((f) => (f.kind === "text" ? f.text != null : f.amount != null), { message: "a fee entry has an amount (kind text: the profile's words)", path: ["amount"] });
const wholeCourse = z.object({ amount: money, amount_max: money.optional(), currency, maximum: yes.optional() }).strict();
const otherFee = z
  .object({
    name: z.string().min(1),
    kind: z.enum(["fee_part", "hostel", "one_time", "refundable_deposit", "deposit"]),
    amount: money,
    amount_max: money.optional(),
    currency,
    includes: z.array(z.string().min(1)).optional(),
    year: z.number().int().min(1).max(6).optional(),
    years: z.array(z.number().int().min(1).max(6)).optional(),
    included_in_fee: yes.optional(),
    period: z.enum(["per_month", "per_year", "course", "one_time"]).optional(),
    applies_to: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    src,
  })
  .strict();
const feeVariant = z.object({ applies_to: z.string().min(1), per_year: z.array(z.object({ amount: money, amount_max: money.optional(), currency }).strict().nullable()), src }).strict();
const stipendEntry = z
  .object({
    inr: money,
    kind: z.enum(["declared", "nbems_minimum", "nmc_list"]),
    /** An NBEMS floor, never the college's figure. */
    minimum: yes.optional(),
    below_nbems_minimum: yes.optional(),
    as_stated_per_year: money.optional(),
    basis: z.string().min(1).optional(),
    one_figure_all_years: yes.optional(),
    plus_da: yes.optional(),
    src,
  })
  .strict();
const hostelFlag = z.enum(["Y", "N", ""]);
const includesHostel = z.enum(["yes", "no", "not_stated"]);
const forfeitItem = z.object({ inr: money.nullable(), percent: z.number().nonnegative().max(100).optional(), text: z.string().min(1).optional() }).strict();
export const feeDisplays = ["numbers", "verbatim"] as const;
export const seatGroups = ["All India", "Deemed/Paid", "NRI", "DNB Quota"] as const;
export const feeProgrammes = ["MD/MS", "Diploma", "DNB", "NBEMS Diploma"] as const;
/**
 * One college × programme × seat-type group of data/curated/terms_structured.json: fee and stipend per course year
 * (null = not stated, never 0), bond, leaving penalty, MCC counselling forfeit, each figure's `src` = an `n` of
 * `sources` (empty when nothing is known). fee_display "numbers": the figures may be shown; "verbatim" (also when absent: an older export): only
 * fee_text and its fee_text_src, never figures (fee_hint keeps the parsed ones for checking, not for display).
 */
export const mccFeesStructuredSchema = z
  .object({
    id: z.string().min(1),
    key: ikey,
    college: z.string().min(1),
    state: z.string().min(1).nullable(),
    programme: z.enum(feeProgrammes),
    duration_years: z.number().int().min(1).max(6),
    seat_groups: z.array(z.enum(seatGroups)).min(1),
    quotas: z.array(z.string().min(1)).min(1),
    mcc_ids: z.array(z.string().regex(/^\d{6}$/)),
    fee_display: z.enum(feeDisplays).optional(),
    fee_text: z.string().min(1).nullable().optional(),
    fee_text_src: z.object({ url: z.url(), date: isoDay }).strict().nullable().optional(),
    fee_per_year: z.array(feeEntry.nullable()).min(1).max(6),
    fee_whole_course: wholeCourse.optional(),
    fee_includes_hostel: includesHostel.optional(),
    fee_notes: z.array(z.string().min(1)).optional(),
    fee_variants: z.array(feeVariant).optional(),
    other_fees: z.array(otherFee).optional(),
    fee_hint: z
      .object({
        fee_per_year: z.array(feeEntry.nullable()),
        fee_whole_course: wholeCourse,
        fee_variants: z.array(feeVariant),
        other_fees: z.array(otherFee),
        fee_includes_hostel: includesHostel,
        fee_notes: z.array(z.string().min(1)),
      })
      .partial()
      .strict()
      .optional(),
    hostel_available: z.object({ male: hostelFlag, female: hostelFlag }).strict().optional(),
    stipend_per_month: z.array(stipendEntry.nullable()).min(1).max(6),
    stipend_nbems_minimum: z.array(stipendEntry).optional(),
    stipend_note: z.string().min(1).optional(),
    bond: z
      .object({
        status: z.enum(["yes", "no", "unclear", "not_declared", "not_checked"]),
        checked: z.boolean(),
        bond_status_ref: z.object({ status: z.enum(bondStatuses), reason: z.string().min(1) }).strict().optional(),
        basis: z.string().min(1).optional(),
        confidence: z.string().min(1).optional(),
        years: z.number().nonnegative().optional(),
        years_text: z.string().min(1).optional(),
        amounts: z
          .array(z.object({ applies_to: z.string().min(1), course_type: z.string().min(1), inr: money, kind: z.string().min(1).optional(), per_year: yes.optional() }).strict())
          .optional(),
        applies_to: z.string().min(1).optional(),
        quote: z.string().min(1).optional(),
        excerpt: z.string().min(1).optional(),
        extendable: yes.optional(),
        from_text: yes.optional(),
        src: src.optional(),
      })
      .strict(),
    leaving_penalty: z
      .array(z.object({ applies_to: z.string().min(1), inr: money, when: z.string().min(1), excerpt: z.string().min(1).optional(), from_text: yes.optional(), per_year: yes.optional(), src }).strict())
      .optional(),
    counselling_forfeit: z
      .object({ deducted_on_reallocation: forfeitItem, refunded_if_resign_during_counselling: forfeitItem, forfeited_if_resign_or_not_join_from_round2: forfeitItem })
      .partial()
      .extend({ src })
      .strict()
      .optional(),
    notes: z.array(z.string().min(1)).optional(),
    sources: z
      .array(
        z
          .object({
            n: src,
            kind: z.enum(["mcc_profile", "bond_document", "nmc_list", "nbems_rule"]),
            label: z.string().min(1),
            url: z.url(),
            year: z.union([z.number().int(), z.string().min(1)]).optional(),
            date: z.string().min(1).optional(),
            checked: z.boolean().optional(),
            mcc_id: z.string().regex(/^\d{6}$/).optional(),
            mcc_name: z.string().min(1).optional(),
            nmc_name: z.string().min(1).optional(),
            nmc_sno: z.number().int().positive().optional(),
            note: z.string().min(1).optional(),
          })
          .strict(),
      ),
  })
  .strict()
  .refine((r) => r.id === `${r.key}|${r.programme}|${r.seat_groups.join("+")}`, { message: "id is not key|programme|seat groups", path: ["id"] })
  .refine((r) => r.fee_display !== "verbatim" || r.fee_per_year.every((f) => f == null), { message: "a verbatim record has no fee figures", path: ["fee_per_year"] });
export type MccFeesStructured = z.infer<typeof mccFeesStructuredSchema>;

/** Every `src` / `gst_src` number a record cites (each must be an `n` of its sources). */
export function citedSources(v: unknown, out: number[] = []): number[] {
  if (Array.isArray(v)) v.forEach((x) => citedSources(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if ((k === "src" || k === "gst_src") && typeof x === "number") out.push(x);
      else if (k !== "sources") citedSources(x, out);
    }
  return out;
}

export const mccManifestSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]),
  built: z.string(),
  files: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  excluded_unparsed_course_rows: z.number().int().nonnegative(),
  notes: z.record(z.string(), z.string()),
});
export type MccManifest = z.infer<typeof mccManifestSchema>;
