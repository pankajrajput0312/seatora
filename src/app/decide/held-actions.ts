"use server";

import { z } from "zod";
import { canUseDecide } from "@/features/auth/lib/session";
import { searchMatcher } from "@/features/decide/lib/college-aliases";
import { getCatalog } from "@/features/decide/server/catalog";
import { activeExam } from "@/features/exams/active";
import { quotaIn } from "@/features/exams/exam";
import { exams } from "@/features/exams/registry";

export type SeatHit = { id: string; college: string; state: string | null; course: string; quota: string };
const LIMIT = 20;

/**
 * "I already hold a seat": options of the exam shown (activeExam: another exam's for staff only) whose institute, its
 * state or city, course or quota has every word of `q` (a short name such as "KEM" as its official words), any course,
 * not only hers; the first 20 by institute then course, and how many match. Null when the input is invalid or there's no access (Server
 * Actions can be POSTed to any route, past the middleware).
 */
export async function findSeats(q: string): Promise<{ hits: SeatHit[]; total: number } | null> {
  const input = z.string().trim().min(2).max(100).safeParse(q);
  if (!input.success) return null;
  try {
    if (!(await canUseDecide())) return null;
    const exam = await activeExam();
    const cat = await getCatalog(exam);
    const match = searchMatcher(input.data);
    if (!match) return { hits: [], total: 0 };
    const hits: SeatHit[] = [];
    for (const o of cat.options) {
      const c = cat.collegeByKey.get(o.college);
      const course = cat.courseOf.get(`${o.degree}|${o.specialty}`);
      if (!c || !course) continue;
      const quota = quotaIn(exams[exam], o.quota);
      if (match(`${c.name} ${c.state ?? ""} ${c.address ?? ""} ${course.degree} ${course.name} ${quota}`)) hits.push({ id: o.id, college: c.name, state: c.state, course: `${course.degree} ${course.name}`, quota });
    }
    hits.sort((a, b) => a.college.localeCompare(b.college) || a.course.localeCompare(b.course) || a.quota.localeCompare(b.quota));
    return { hits: hits.slice(0, LIMIT), total: hits.length };
  } catch (e) {
    console.error("[held] find seats", e);
    return null;
  }
}
