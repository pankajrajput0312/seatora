"use server";

import { z } from "zod";
import { residentsFilters } from "@/features/decide/components/residents-results";
import { profileFromParams } from "@/features/decide/profile";
import { canSeeResidents } from "@/features/decide/server/residents";
import { allResidentColleges, countResidentsAll, residentColleges, residentNames } from "@/features/decide/server/residents-all";
import { getMeta } from "@/features/decide/service";

/** The Filters sheet's "Show N results" as she ticks (FiltersPanel `recount`): the page's query string, counted. Null without access. */
export async function countResidents(query: string) {
  const input = z.string().max(4000).safeParse(query);
  if (!input.success) return null;
  try {
    const params = new URLSearchParams(input.data);
    const { query: q } = residentsFilters(params, profileFromParams(params), (await getMeta()).courses);
    return await countResidentsAll(q);
  } catch (e) {
    console.error("[residents] count", e);
    return null;
  }
}

/** Every college with residents, Government first: the search box's list before she types. Null without access. */
export async function listResidentColleges() {
  try {
    if (!(await canSeeResidents())) return null;
    return await allResidentColleges();
  } catch (e) {
    console.error("[residents] all colleges", e);
    return null;
  }
}

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
