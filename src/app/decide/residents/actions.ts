"use server";

import { z } from "zod";
import { canSeeResidents } from "@/features/decide/server/residents";
import { residentColleges, residentNames } from "@/features/decide/server/residents-all";

/** The search dropdown's names: up to 10 distinct resident names with what she typed. Null without access. */
export async function findResidentNames(q: string) {
  const input = z.string().trim().min(2).max(60).safeParse(q);
  if (!input.success) return null;
  try {
    if (!(await canSeeResidents())) return null;
    return (await residentNames(input.data)).map((n) => ({ value: n, label: n }));
  } catch (e) {
    console.error("[residents] names", e);
    return null;
  }
}

/** The College filter's search: up to 20 colleges with residents whose name has what she typed. Null without access. */
export async function findResidentColleges(q: string) {
  const input = z.string().trim().min(2).max(60).safeParse(q);
  if (!input.success) return null;
  try {
    if (!(await canSeeResidents())) return null;
    return (await residentColleges({ q: input.data })).map((c) => ({ value: c.slug, label: c.state ? `${c.name}, ${c.state}` : c.name }));
  } catch (e) {
    console.error("[residents] colleges", e);
    return null;
  }
}
