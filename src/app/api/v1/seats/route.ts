import { z } from "zod";
import { handle, invalid, notFound, ok, pageOf, pageSchema, parseQuery } from "@/features/decide/api";
import { findSeats, seatSorts } from "@/features/decide/components/seats/find-seats";
import { seatLists } from "@/features/decide/server/seats";
import { getCollege } from "@/features/decide/service";
import { baseCategories, rounds, seatKinds } from "@/features/decide/types";

const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
const multi = ["specialty", "course", "degree", "quota", "category", "state"];
const seatsQuerySchema = pageSchema.extend({
  /** SeatList key, e.g. mcc/2026/R2_clear_vacancy.pdf; overrides kind/year/round. */
  list: z.string().max(200).optional(),
  kind: z.enum(seatKinds).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  round: z.enum(rounds).optional(),
  specialty: z.array(z.string().regex(/^[A-Z0-9]+$/, "Specialty code, e.g. ANAESTHESIOLOGY")).default([]),
  course: z.array(z.string().max(100)).default([]),
  degree: z.array(z.string().max(100)).default([]),
  quota: z.array(z.string().max(100)).default([]),
  category: z.array(z.enum(categories)).default([]),
  state: z.array(z.string().max(100)).default([]),
  college: z.string().max(200).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(seatSorts).default("college"),
});

/**
 * Seats in one MCC seat list (default: the newest round's clear vacancy), as its PDF printed them; paginated. Kinds
 * overlap and are never added: `seats[list key]` sums matching rows within one list. Later MCC add/remove notices are
 * not applied.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(seatsQuerySchema, new URL(req.url).searchParams, multi);
    if (!q.success) return invalid(q.error);
    const { page, pageSize, college, specialty, course, degree, quota, category, state, ...f } = q.data;
    if (f.list && !(await seatLists()).some((l) => l.key === f.list)) return notFound("No seat list with this key");
    const inst = college ? await getCollege(college) : null;
    if (college && !inst) return notFound("No institute with this slug");
    const r = await findSeats(
      { ...f, college: inst?.key, specialties: specialty, courses: course, degrees: degree, quotas: quota, categories: category, states: state },
      { page, pageSize },
    );
    if (!r.lists.length) return notFound("No MCC seat list for this kind, year and round");
    return ok(
      { lists: r.lists, seats: r.seats, rows: r.rows },
      { page: pageOf(r), sources: r.lists.map((l) => ({ key: l.key, name: l.name, url: l.url, year: l.year, round: l.round })) },
    );
  });
}
