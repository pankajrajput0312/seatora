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

export const mccTermSchema = z
  .object({
    ikey,
    program: z.enum(programs),
    kind: z.enum(termKinds),
    text: z.string().min(1),
    amount_inr: z.number().int().positive().max(2_147_483_647).nullable(),
    src_url: z.url(),
  })
  .strict();
export type MccTerm = z.infer<typeof mccTermSchema>;

export const mccManifestSchema = z.object({
  schema_version: z.literal(1),
  built: z.string(),
  files: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  excluded_unparsed_course_rows: z.number().int().nonnegative(),
  notes: z.record(z.string(), z.string()),
});
export type MccManifest = z.infer<typeof mccManifestSchema>;
