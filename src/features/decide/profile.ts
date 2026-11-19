import { z } from "zod";
import { baseCategories, openQuotas, type BaseCategory } from "./types";

/** One exact course as "degree~SPECIALTY", e.g. "DNB~FAMILYMEDICINE" (the `c` URL param). */
export const pairSchema = z.string().max(200).regex(/^[^~,]+~[^~,]+$/, "degree~SPECIALTY, e.g. DNB~FAMILYMEDICINE");
export const pairKey = (c: { degree: string; specialty: string }) => `${c.degree}~${c.specialty}`;

/** Her profile: user-entered, saved in localStorage, and mirrored into the URL so server pages can read it. */
export const profileSchema = z.object({
  rank: z.number().int().min(1).max(300000),
  category: z.enum(baseCategories),
  pwd: z.boolean(),
  /** Specialty codes, e.g. ANAESTHESIOLOGY. Empty = all. */
  specialties: z.array(z.string()),
  /** e.g. MD, DNB, NBEMS Diploma. Empty = all. */
  degrees: z.array(z.string()),
  /**
   * Exact courses ("DNB~FAMILYMEDICINE"). When present they replace specialties x degrees (which then only name her
   * specialties, for display); absent or empty = specialties x degrees, as before pairs existed. Match with profileHasCourse.
   */
  pairs: z.array(pairSchema).optional(),
  /** MCC quota labels. Empty = the exam's open quotas (types.ts openQuotas for NEET PG), never the restricted ones. NEET SS: her question group's. */
  quotas: z.array(z.string()),
  states: z.array(z.string()),
  maxFeeLakh: z.number().positive().nullable(),
  maxBondYears: z.number().min(0).nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE_KEY = "medpath.profile";
export const profileParamKeys = ["rank", "cat", "pwd", "sp", "deg", "c", "quota", "st", "fee", "bond"] as const;
/** Profile params that hold several values: repeated (sp=A&sp=B, what GET forms send) or comma-joined (sp=A,B). */
const listKeys = new Set<string>(["sp", "deg", "c", "quota", "st"]);

/** Choices offered for the fee and bond caps, shared by the profile dialog and page filters. */
export const FEE_LAKH_CHOICES = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50];
export const BOND_YEAR_CHOICES = [0, 1, 2, 3];
/** Every course as an exact-pair choice (the `c` filter), grouped by specialty: "DNB Family Medicine". */
export const pairChoices = (courses: { degree: string; specialty: string; name: string }[]) =>
  [...courses].sort((a, b) => a.name.localeCompare(b.name) || a.degree.localeCompare(b.degree)).map((c) => ({ value: pairKey(c), label: `${c.degree} ${c.name}` }));
/** The fee choices plus her current cap when it isn't one of them (an imported profile), so a select never drops it. */
export const feeChoices = (current: number | null | undefined) =>
  current != null && !FEE_LAKH_CHOICES.includes(current) ? [...FEE_LAKH_CHOICES, current].sort((a, b) => a - b) : FEE_LAKH_CHOICES;

export type ProfileCourses = Pick<Profile, "specialties" | "degrees" | "pairs">;

/** The one course matcher: one of her exact pairs when she has any, else her specialties x degrees (empty = all). */
export const profileHasCourse = (p: ProfileCourses, c: { degree: string; specialty: string }) =>
  p.pairs?.length
    ? p.pairs.includes(pairKey(c))
    : (!p.specialties.length || p.specialties.includes(c.specialty)) && (!p.degrees.length || p.degrees.includes(c.degree));

/** The same courses as SQL filters (listSeats): her pairs, else her specialties and degrees; undefined = any. */
export const profileCourseFilter = (p: ProfileCourses) =>
  p.pairs?.length
    ? { pairs: p.pairs }
    : { specialties: p.specialties.length ? p.specialties : undefined, degrees: p.degrees.length ? p.degrees : undefined };

/**
 * Courses ticked in the profile dialog (specialty code → its ticked degrees) as profile fields, in the old form when it
 * can say it, else pairs: her own `degrees` when they still say it (so an unchanged profile saves unchanged), else
 * specialties only (every degree of each), else one set of degrees for all. No specialty ticked = every course of
 * `degrees` (empty = all), as before. Null when specialties are ticked but none has a degree: no course at all, which a
 * profile can't say (empty = all), so the dialog asks for one.
 */
export function coursesFromPicks(picked: Record<string, string[]>, degrees: string[], courses: { degree: string; specialty: string }[]): ProfileCourses | null {
  const specialties = Object.keys(picked).filter((s) => picked[s].length);
  if (!specialties.length) return Object.keys(picked).length ? null : { specialties: [], degrees };
  const offered = (s: string) => courses.filter((c) => c.specialty === s).map((c) => c.degree);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const says = (ds: string[]) => specialties.every((s) => same(picked[s], offered(s).filter((d) => !ds.length || ds.includes(d))));
  if (says(degrees)) return { specialties, degrees };
  if (says([])) return { specialties, degrees: [] };
  const ticked = new Set(specialties.flatMap((s) => picked[s]));
  const used = [...new Set([...degrees, ...ticked])].filter((d) => ticked.has(d)); // her old degree order first
  if (says(used)) return { specialties, degrees: used };
  return { specialties, degrees: [], pairs: specialties.flatMap((s) => picked[s].map((degree) => pairKey({ degree, specialty: s }))) };
}

/** The reverse, for the dialog: her courses as specialty → ticked degrees (a specialty ticked alone = all its degrees). */
export function picksOf(p: ProfileCourses, courses: { degree: string; specialty: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (p.pairs?.length) {
    for (const k of p.pairs) {
      const [degree, specialty] = k.split("~");
      (out[specialty] ??= []).push(degree);
    }
  } else for (const s of p.specialties) out[s] = courses.filter((c) => c.specialty === s && profileHasCourse(p, c)).map((c) => c.degree);
  return out;
}

/** The quotas her profile covers: the ones she ticked, else the exam's open quotas (`open`, exams' `quotas`; default NEET PG's; NEET SS: none, she picks her group). */
export const profileQuotas = (p: Pick<Profile, "quotas">, open: string[] = openQuotas) => (p.quotas.length ? p.quotas : open);

/** How a category is typed (letters only, any case) → Seatora's: General, GEN, UR and Unreserved are Open. */
const CATEGORY_WORDS: Record<string, BaseCategory> = { open: "Open", general: "Open", gen: "Open", ur: "Open", unreserved: "Open", obc: "OBC", obcncl: "OBC", ews: "EWS", sc: "SC", st: "ST" };
/**
 * A category as typed in a URL ("UR", "gen", "General", "UR-PwD", "OBC PWBD"): Seatora's category and whether a PwD /
 * PwBD suffix said PwD. Null: no category Seatora knows (the page says so instead of falling back unsaid).
 */
export function categoryFromText(s: string): { category: BaseCategory; pwd: boolean } | null {
  const m = /^(.*?)[\s_\-/()]*(pwbd|pwd)?\)?$/i.exec(s.trim());
  const category = CATEGORY_WORDS[(m?.[1] ?? "").toLowerCase().replace(/[^a-z]/g, "")];
  return category ? { category, pwd: !!m?.[2] } : null;
}

const list = (p: URLSearchParams, k: string) => p.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
const num = (v: string | null | undefined) => (v != null && v.trim() !== "" ? Number(v) : null);
/** 1/true/yes or 0/false/no (any case); absent is false; anything else stays a string, so strict parsing rejects it. */
const flag = (v: string | null) => {
  const s = v?.trim().toLowerCase() ?? "";
  return s === "" || ["0", "false", "no"].includes(s) ? false : ["1", "true", "yes"].includes(s) ? true : s;
};

/** Profile params as typed values with no fallbacks (NaN for a malformed number), for strict validation (HTTP API). */
export function profileInput(p: URLSearchParams) {
  const cat = p.get("cat")?.trim() ?? "Open";
  const known = categoryFromText(cat); // "obc", "UR", "GEN-PwD"
  const pairs = list(p, "c");
  return {
    rank: num(p.get("rank")?.replace(/[,\s]/g, "")),
    category: known?.category ?? cat,
    pwd: known?.pwd || flag(p.get("pwd")),
    specialties: list(p, "sp"),
    degrees: list(p, "deg"),
    pairs: pairs.length ? pairs : undefined,
    quotas: list(p, "quota"),
    states: list(p, "st"),
    maxFeeLakh: num(p.get("fee")),
    maxBondYears: num(p.get("bond")),
  };
}

/**
 * Reads a profile from URL params; null when there's no valid rank. Each optional field is validated on its own,
 * so one bad optional value falls back to its default instead of discarding the whole profile.
 */
export function profileFromParams(p: URLSearchParams): Profile | null {
  const raw = profileInput(p);
  const rank = profileSchema.shape.rank.safeParse(raw.rank);
  if (!rank.success) return null;
  const field = <K extends keyof Profile>(k: K, fallback: Profile[K]): Profile[K] => {
    const r = profileSchema.shape[k].safeParse(raw[k]);
    return r.success ? (r.data as Profile[K]) : fallback;
  };
  // Pairs item by item: a hand-edited bad one is dropped, the rest kept.
  const pairs = raw.pairs?.filter((x) => pairSchema.safeParse(x).success);
  return {
    rank: rank.data,
    category: field("category", "Open"),
    pwd: field("pwd", false),
    specialties: field("specialties", []),
    degrees: field("degrees", []),
    ...(pairs?.length ? { pairs } : {}),
    quotas: field("quotas", []),
    states: field("states", []),
    maxFeeLakh: field("maxFeeLakh", null),
    maxBondYears: field("maxBondYears", null),
  };
}

export function profileToParams(profile: Profile, base = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of profileParamKeys) p.delete(k);
  p.set("rank", String(profile.rank));
  p.set("cat", profile.category);
  if (profile.pwd) p.set("pwd", "1");
  if (profile.specialties.length) p.set("sp", profile.specialties.join(","));
  if (profile.degrees.length) p.set("deg", profile.degrees.join(","));
  if (profile.pairs?.length) p.set("c", profile.pairs.join(","));
  if (profile.quotas.length) p.set("quota", profile.quotas.join(","));
  if (profile.states.length) p.set("st", profile.states.join(","));
  if (profile.maxFeeLakh != null) p.set("fee", String(profile.maxFeeLakh));
  if (profile.maxBondYears != null) p.set("bond", String(profile.maxBondYears));
  return p;
}

/** Next.js searchParams object → URLSearchParams. Repeated keys arrive as arrays and are kept, every value. */
export function toURLSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v ?? []].flat()) p.append(k, x);
  return p;
}

/**
 * Only the profile params, in canonical form: list params comma-joined (every repeated value kept), others first value.
 * The one place links, hidden form fields and the shell copy the profile from the current URL.
 */
export function keepProfileParams(src: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of profileParamKeys) {
    const vs = src.getAll(k).filter((v) => v.trim() !== "");
    if (vs.length) p.set(k, listKeys.has(k) ? vs.join(",") : vs[0]);
  }
  return p;
}

/**
 * Her profile with a Filters sheet's choices that have a profile field ("Save as my defaults"): courses (c, or sp and
 * deg), quotas, states, the fee cap (maxfee, lakh a year) and the bond cap (bondyrs, years; 0 = no bond); "any" lifts a
 * cap, "" (Your cap) keeps hers. `fields`: the names the form has (a field it lacks leaves hers as it is; one with
 * nothing ticked is "all"). College type and the other filters have no profile field: they stay page filters.
 */
export function profileWithFilters(p: Profile, q: URLSearchParams, fields: Set<string>): Profile {
  const next: Profile = { ...p };
  const ticked = (k: string) => list(q, k);
  if (fields.has("c")) {
    const pairs = ticked("c").filter((x) => pairSchema.safeParse(x).success);
    if (pairs.length) next.pairs = pairs;
    else delete next.pairs;
  }
  if (fields.has("sp")) next.specialties = ticked("sp");
  if (fields.has("deg")) next.degrees = ticked("deg");
  if (fields.has("quota")) next.quotas = ticked("quota");
  if (fields.has("st")) next.states = ticked("st");
  const cap = (k: string, current: number | null, ok: (n: number) => boolean) => {
    const v = q.get(k)?.trim();
    if (v === "any") return null;
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && ok(n) ? n : current;
  };
  if (fields.has("maxfee")) next.maxFeeLakh = cap("maxfee", p.maxFeeLakh, (n) => n > 0);
  if (fields.has("bondyrs")) next.maxBondYears = cap("bondyrs", p.maxBondYears, (n) => n >= 0);
  return next;
}
