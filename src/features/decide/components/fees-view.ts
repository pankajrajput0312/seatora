import "server-only";
import { z } from "zod";
import { profileHasCourse, type Profile } from "../profile";
import { feeSorts, type FeeFilters, type FeeRow } from "../service";
import { programmeNames, programmes, programmesOf, type Amount, type Programme } from "../server/terms";
import { amountNote } from "./fees";
import type { Course } from "../types";
import { csvLine } from "./seats/find-seats";

// The Fees & bond page's params, shared by the page (/decide/fees), its CSV (/api/v1/fees/export) and the JSON API.
// Keys never reuse a profile key (fee, bond, st…). Absent = her profile's value; "all" / "any" = no filter.

export const programmeBySlug = Object.fromEntries(programmeNames.map((p) => [programmes[p].slug, p])) as Record<string, Programme>;
const slugs = programmeNames.map((p) => programmes[p].slug) as [string, ...string[]];

export const feesParamsSchema = z.object({
  program: z.enum([...slugs, "all"]).optional(),
  state: z.string().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  /** ₹ lakh per year (year 1). */
  maxfee: z.union([z.literal("any"), z.coerce.number().positive().max(1000)]).optional(),
  /** ₹ per month, year 1. */
  minstip: z.coerce.number().int().positive().max(1000000).optional(),
  bondyrs: z.union([z.literal("any"), z.coerce.number().int().min(0).max(20)]).optional(),
  /** ₹ lakh. */
  maxbond: z.coerce.number().positive().max(100000).optional(),
  bdecl: z.enum(["declared", "none"]).optional(),
  /** The "Include colleges that haven't declared it" checkbox: hide = unticked (its hidden input); absent or keep = ticked. */
  nd: z.enum(["hide", "keep"]).optional(),
  sort: z.enum(feeSorts).default("fee1"),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type FeesParams = z.infer<typeof feesParamsSchema>;

/** Her profile's programmes (from her courses; null when she ticked none), states and caps: the defaults. */
export function feeDefaults(profile: Profile | null, courses: Course[]) {
  const ticked = !!profile && (profile.specialties.length > 0 || profile.degrees.length > 0 || !!profile.pairs?.length);
  return {
    programmes: ticked ? programmesOf(courses.filter((c) => profileHasCourse(profile, c)).map((c) => c.degree)) : null,
    states: profile?.states.length ? profile.states : null,
    maxFeeLakh: profile?.maxFeeLakh ?? null,
    maxBondYears: profile?.maxBondYears ?? null,
  };
}

export function feesFilters(f: FeesParams, d: ReturnType<typeof feeDefaults>): FeeFilters {
  const maxFee = f.maxfee === "any" ? null : (f.maxfee ?? d.maxFeeLakh);
  return {
    programmes: f.program === "all" ? undefined : f.program ? [programmeBySlug[f.program]] : (d.programmes ?? undefined),
    states: f.state === "all" ? undefined : f.state ? [f.state] : (d.states ?? undefined),
    search: f.q,
    maxFee: maxFee == null ? null : maxFee * 100000,
    minStipend: f.minstip ?? null,
    maxBondYears: f.bondyrs === "any" ? null : (f.bondyrs ?? d.maxBondYears),
    maxBondInr: f.maxbond ? f.maxbond * 100000 : null,
    bond: f.bdecl,
    hideUnknown: f.nd === "hide",
    sort: f.sort,
    dir: f.dir,
  };
}

const yearCols = 3;
/** figure: a ₹ figure; declared_no_amount: declared in words only (see the text column); not_declared: not in our MCC data. */
const amountStatus = (declared: boolean, a: Amount) => (!declared || a.state === "none" ? "not_declared" : a.state === "words" ? "declared_no_amount" : "figure");
/** One CSV line; missing cells are empty (so number columns stay numbers in a spreadsheet), the rest as csvLine writes them. */
const line = (xs: (string | number | null | undefined)[]) => xs.map((v) => (v == null || v === "" ? "" : csvLine([v]))).join(",");

/**
 * The rows as CSV (UTF-8, CRLF, no BOM: the route adds it): numbers in ₹ (empty = not in our MCC data, or no such
 * year: see duration_years), each figure's kind and source, the bond as published. After a blank row: `notes`.
 * `siteUrl`: for each row's page_url (its institute's Fees tab).
 */
export function feesCsv(rows: FeeRow[], notes: string[], siteUrl: string) {
  const head = [
    "institute", "institute_slug", "page_url", "state", "programme", "duration_years",
    ...Array.from({ length: yearCols }, (_, i) => `fee_y${i + 1}`), "whole_course_fee", "fee_kind", "fee_source_url", "fee_source_year",
    ...Array.from({ length: yearCols }, (_, i) => `stipend_y${i + 1}`), "stipend_kind", "stipend_source_url", "stipend_source_year",
    "bond_status", "bond_years", "bond_inr_max", "bond_inr_status", "bond_inr_note", "leaving_inr_max", "leaving_status", "leaving_text",
    "bond_years_text", "bond_applies_to", "bond_text", "bond_source_url",
    "resign_round2_inr", "mcc_profile_id", "mcc_profile_shared_by",
  ];
  const body = rows.map(({ college, terms: t }) => {
    const src = (n: number | null | undefined) => t.sources.find((s) => s.n === n);
    const fee = t.years[0]?.fee;
    const st = t.years.find((y) => y.stipend)?.stipend;
    const b = t.bond;
    const declared = b.status === "declared";
    const mcc = [...new Map(t.sources.flatMap((s) => (s.mccId ? [[s.mccId, s.sharedBy] as const] : []))).entries()];
    return [
      college.name, college.slug, `${siteUrl}/decide/institutes/${college.slug}?tab=fees`, college.state, t.programme, t.durationYears,
      ...Array.from({ length: yearCols }, (_, i) => t.years[i]?.fee?.inr), t.wholeCourseFee, fee?.kind, src(fee?.src)?.url, src(fee?.src)?.year,
      ...Array.from({ length: yearCols }, (_, i) => t.years[i]?.stipend?.inr), st?.kind, src(st?.src)?.url, src(st?.src)?.year,
      b.status, declared ? b.years : null, declared ? b.amount.max : null, amountStatus(declared, b.amount), declared ? amountNote(b.amount, b.years) : null,
      declared ? b.leavingAmount.max : null, amountStatus(declared, b.leavingAmount), declared ? b.leaving.map((p) => p.text).join("; ") : null,
      declared ? b.yearsText : null, b.appliesTo, b.text, src(b.src)?.url,
      t.resignForfeit?.inr, mcc.map(([id]) => id).join(" "), mcc.map(([, n]) => n).join(" "),
    ];
  });
  return [head, ...body, [], ...notes.map((n) => [n])].map(line).join("\r\n") + "\r\n";
}
