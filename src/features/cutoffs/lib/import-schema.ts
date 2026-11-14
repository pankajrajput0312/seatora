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

/** `details`: every BOND and PENALTY has its record, FEE and STIPEND none. `src_url` null: a BOND whose status is unknown and has no document (the importer gives it the bond check as source). */
export const mccTermSchema = z
  .object({
    ikey,
    program: z.enum(programs),
    kind: z.enum(termKinds),
    text: z.string().min(1),
    amount_inr: inr.nullable(),
    src_url: z.url().nullable(),
    details: z.union([bondDetailsSchema, penaltyDetailsSchema]).optional(),
  })
  .strict()
  .refine((t) => (t.kind === "BOND" ? !!t.details && "status" in t.details : t.kind === "PENALTY" ? !!t.details && "items" in t.details : !t.details), {
    message: "BOND needs its bond record, PENALTY its penalty items, FEE and STIPEND none",
    path: ["details"],
  })
  .refine((t) => t.src_url != null || (t.details && "status" in t.details && t.details.status === "unknown"), { message: "only an unknown bond may have no source", path: ["src_url"] });
export type MccTerm = z.infer<typeof mccTermSchema>;

export const mccManifestSchema = z.object({
  schema_version: z.literal(1),
  built: z.string(),
  files: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  excluded_unparsed_course_rows: z.number().int().nonnegative(),
  notes: z.record(z.string(), z.string()),
});
export type MccManifest = z.infer<typeof mccManifestSchema>;
