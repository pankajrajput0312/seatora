import { z } from "zod";
import { handle, invalid, notFound, ok, pageOf, pageSchema, parseOptionalProfile, parseQuery, sourcesFor } from "@/features/decide/api";
import { findSeats, seatSorts } from "@/features/decide/components/seats/find-seats";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { pairSchema, profileCourseFilter } from "@/features/decide/profile";
import { seatLists } from "@/features/decide/server/seats";
import { getCollege, getMeta } from "@/features/decide/service";
import { baseCategories, rounds, seatKinds } from "@/features/decide/types";

const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
const multi = ["specialty", "course", "degree", "quota", "category", "state", "sp", "deg", "c", "st"];
const code = z.string().regex(/^[A-Z0-9]+$/, "Specialty code, e.g. ANAESTHESIOLOGY");
const seatsQuerySchema = pageSchema.extend({
  /** SeatList key, e.g. mcc/2026/R2_clear_vacancy.pdf; overrides kind/year/round. */
  list: z.string().max(200).optional(),
  kind: z.enum(seatKinds).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  round: z.enum(rounds).optional(),
  specialty: z.array(code).default([]),
  course: z.array(z.string().max(100)).default([]),
  degree: z.array(z.string().max(100)).default([]),
  quota: z.array(z.string().max(100)).default([]),
  category: z.array(z.enum(categories)).default([]),
  state: z.array(z.string().max(100)).default([]),
  /** Her profile's courses and states (profile.ts keys), used when specialty, course and degree (or state) are absent. */
  sp: z.array(code).default([]),
  deg: z.array(z.string().max(100)).default([]),
  c: z.array(pairSchema).default([]),
  st: z.array(z.string().max(100)).default([]),
  college: z.string().max(200).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(seatSorts).default("college"),
});

/**
 * Seats in one MCC seat list (default: the newest round's clear vacancy), as its PDF printed them; paginated. Kinds
 * overlap and are never added: `seats[list key]` sums matching rows within one list. Later MCC add/remove notices are
 * not applied. Each row carries its past closings on its quota and seat category (`rounds`, `deepest`), its terms, and
 * with the optional profile params (rank, cat, pwd) the reach label Options uses, on that seat category (`reach`; null on
 * a seat category she can't take). Courses: `specialty`, `degree`, `course`; without any of them, her profile's `sp`,
 * `deg` and exact courses `c` apply, as on the Seats page (states: `state`, else her `st`). Quotas are only `quota`.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const q = parseQuery(seatsQuerySchema, p, multi);
    const profile = parseOptionalProfile(p);
    if (!q.success || !profile.success) return invalid(q.error, profile.error);
    const me = profile.data;
    const { page, pageSize, college, specialty, course, degree, quota, category, state, sp, deg, c, st, ...f } = q.data;
    const courses = specialty.length || course.length || degree.length ? { specialties: specialty, courses: course, degrees: degree } : profileCourseFilter({ specialties: sp, degrees: deg, pairs: c });
    if (f.list && !(await seatLists()).some((l) => l.key === f.list)) return notFound("No seat list with this key");
    const inst = college ? await getCollege(college) : null;
    if (college && !inst) return notFound("No institute with this slug");
    const r = await findSeats(
      {
        ...f, ...courses, college: inst?.key, quotas: quota, categories: category, states: state.length ? state : st,
        reachFor: me && { rank: me.rank, categories: eligibleCategories(me.category, me.pwd) },
      },
      { page, pageSize },
    );
    if (!r.lists.length) return notFound("No MCC seat list for this kind, year and round");
    const meta = await getMeta();
    return ok(
      { lists: r.lists, seats: r.seats, rows: r.rows },
      {
        page: pageOf(r),
        sources: [...r.lists.map((l) => ({ key: l.key, name: l.name, url: l.url, year: l.year, round: l.round })), ...sourcesFor(meta.sources, r.rows.flatMap((x) => x.rounds))],
      },
    );
  });
}
