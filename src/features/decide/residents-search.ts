import { z } from "zod";
import type { Course } from "./types";

// Contract for the Residents tab (all colleges): shared by the server search and the page (no JSON API across colleges).
// Never carries a reservation category (seat or candidate): deliberately not stored.

export const RESIDENTS_PAGE_SIZE = 50;

export const residentsQuery = z.object({
  q: z.string().trim().max(60).optional(), // name search, case/space-insensitive tokens
  college: z.string().max(120).optional(), // College.slug
  state: z.string().max(60).optional(),
  course: z.array(z.string().max(80)).max(20).optional(), // Specialty.slug; empty/absent = all courses
  year: z.coerce.number().int().min(2023).max(2030).optional(),
  rankFrom: z.coerce.number().int().min(1).optional(),
  rankTo: z.coerce.number().int().min(1).optional(),
  quota: z.string().max(60).optional(), // MCC quota label, e.g. "All India"
  hasRank: z.preprocess((v) => (v === "0" || v === "false" ? false : v), z.coerce.boolean()).optional(), // "0"/"false": without a rank (z.coerce alone reads any string as true)
  sort: z.enum(["rank", "name", "year", "college"]).default("rank"), // rank: nulls last
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ResidentsQuery = z.infer<typeof residentsQuery>;

export type ResidentRow = {
  id: string;
  name: string;
  year: number;
  list: string; // "up to Round 3", ...
  sourceKey: string; // admitted-list PDF
  rank: number | null;
  rankBasis: string | null; // the same year's NBEMS NEET PG result the rank comes from, e.g. "nbems/2024/published_result.pdf"
  quota: string | null; // only when exactly one allotment row matched rank + college + course
  round: string | null;
  course: Course;
  college: { slug: string; name: string; state: string | null };
};

export type ResidentsPage = {
  rows: ResidentRow[]; // at most RESIDENTS_PAGE_SIZE, hidden residents never included
  total: number;
  withRank: number; // of total
  page: number;
  pageSize: number;
};
