// Pure lookups for the Ask tools (tested): what she typed ("Seth GS", "DNB Anaesthesia") → Seatora's courses and colleges.

import type { College, Course } from "@/features/decide/types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const squash = (s: string) => norm(s).replace(/ /g, "");

/** Same stem: "anaesthesia" ~ "anaesthesiology", "paeds" ~ "paediatrics" (a 6-letter common start, or one contains the other). */
const sameStem = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b)) || (a.length >= 6 && b.length >= 6 && a.slice(0, 6) === b.slice(0, 6));

/**
 * Course words → exact courses ("degree~SPECIALTY" pairs, profile.ts pairKey). "DNB Anaesthesiology" or the course slug
 * gives one course; a specialty alone ("ANAESTHESIOLOGY", "Anaesthesia") gives every degree of it. Unknown words are
 * returned in `unknown`, never guessed.
 */
export function resolveCourses(words: string[], courses: Course[], degrees: string[]) {
  const pairs: string[] = [];
  const unknown: string[] = [];
  const byDegreeLen = [...degrees].sort((a, b) => b.length - a.length);
  for (const raw of words) {
    const w = norm(raw);
    if (!w) continue;
    const bySlug = courses.find((c) => c.slug === raw.trim().toLowerCase());
    if (bySlug) {
      pairs.push(`${bySlug.degree}~${bySlug.specialty}`);
      continue;
    }
    const degree = byDegreeLen.find((d) => w === norm(d) || w.startsWith(`${norm(d)} `));
    const rest = degree ? w.slice(norm(degree).length).trim() : w;
    const restSq = rest.replace(/ /g, "");
    const match = (c: Course) => {
      const code = c.specialty.toLowerCase();
      const name = squash(c.name);
      return restSq !== "" && (code === restSq || name === restSq || sameStem(restSq, name) || sameStem(restSq, code));
    };
    const exact = courses.filter((c) => (!degree || c.degree === degree) && (c.specialty.toLowerCase() === restSq || squash(c.name) === restSq));
    const found = exact.length ? exact : courses.filter((c) => (!degree || c.degree === degree) && match(c));
    // A stem that hits several specialties is ambiguous ("medicine"): only one specialty may match.
    const specialties = new Set(found.map((c) => c.specialty));
    if (!found.length || specialties.size > 1) unknown.push(raw);
    else for (const c of found) pairs.push(`${c.degree}~${c.specialty}`);
  }
  return { pairs: [...new Set(pairs)], unknown };
}

// Common short forms in MCC names.
const EXPAND: Record<string, string[]> = { gmc: ["government medical college", "govt medical college"], govt: ["government"], government: ["govt"] };

/**
 * Every query word matches the college's name + state: a word's start, the initials of consecutive words ("GS" =
 * Gordhandas Sunderdas) or a short form ("GMC"). `ordered`: in the query's order ("Seth GS" = Seth, then G… S…), which
 * tells "Seth GS" from "Govt Seth Govind Das"; tried first, then any order ("Nagpur GMC").
 */
function tokensMatch(query: string, c: Pick<College, "name" | "state">, ordered: boolean) {
  const words = norm(`${c.name} ${c.state ?? ""}`).split(" ");
  const name = norm(c.name);
  let from = 0;
  for (const t of norm(query).split(" ").filter(Boolean)) {
    if ((EXPAND[t] ?? []).some((e) => name.includes(e))) continue;
    let hit = -1;
    let len = 1;
    for (let j = ordered ? from : 0; j < words.length && hit < 0; j++) {
      if (words[j].startsWith(t)) hit = j;
      else if (t.length >= 2 && words.slice(j, j + t.length).map((w) => w[0]).join("") === t) [hit, len] = [j, t.length];
    }
    if (hit < 0) return false;
    if (ordered) from = hit + len;
  }
  return true;
}

/**
 * Colleges matching a slug or name words. An exact slug or exact name wins alone; else every college whose words
 * match, best first (more query words matching whole words, then shorter names).
 */
export function findColleges<C extends Pick<College, "slug" | "name" | "state">>(query: string, colleges: C[]): C[] {
  const q = query.trim();
  const exact = colleges.filter((c) => c.slug === q.toLowerCase() || norm(c.name) === norm(q));
  if (exact.length === 1) return exact;
  const qWords = norm(q).split(" ");
  const score = (c: C) => {
    const words = norm(`${c.name} ${c.state ?? ""}`).split(" ");
    return qWords.filter((t) => words.includes(t)).length;
  };
  const inOrder = colleges.filter((c) => tokensMatch(q, c, true));
  return (inOrder.length ? inOrder : colleges.filter((c) => tokensMatch(q, c, false))).sort((a, b) => score(b) - score(a) || a.name.length - b.name.length);
}
