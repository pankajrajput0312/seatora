import { z } from "zod";
import type { Course } from "./types";

// Contract for the Residents tab (all colleges): shared by the server search and the page (no JSON API across colleges).
// Never carries a reservation category (seat or candidate): deliberately not stored. Nor a rank: the page shows none
// (owner, 15 Nov 2026), so the search neither filters, sorts nor returns by it.

export const RESIDENTS_PAGE_SIZE = 50;

export const residentsQuery = z.object({
  q: z.string().trim().max(60).optional(), // name or college (name, city) search, case/space-insensitive tokens
  college: z.array(z.string().max(120)).max(20).optional(), // College.slug; empty/absent = all colleges
  cq: z.string().trim().max(60).optional(), // college name search (the College filter's box without JS)
  state: z.string().max(60).optional(),
  course: z.array(z.string().max(80)).max(20).optional(), // Specialty.slug; empty/absent = all courses
  year: z.coerce.number().int().min(2023).max(2030).optional(),
  quota: z.string().max(60).optional(), // MCC quota label, e.g. "All India"
  sort: z.enum(["year", "name", "college"]).default("year"), // year: newest first, then college, then name
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ResidentsQuery = z.infer<typeof residentsQuery>;

export type ResidentRow = {
  id: string;
  name: string;
  year: number;
  list: string; // "up to Round 3", ...
  sourceKey: string; // admitted-list PDF
  quota: string | null; // only when exactly one allotment row matched rank + college + course
  round: string | null;
  course: Course;
  college: { slug: string; name: string; state: string | null };
};

export type ResidentsPage = {
  rows: ResidentRow[]; // at most RESIDENTS_PAGE_SIZE, hidden residents never included
  total: number;
  page: number;
  pageSize: number;
};
