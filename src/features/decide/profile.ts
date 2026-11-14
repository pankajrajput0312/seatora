import { z } from "zod";
import { baseCategories, openQuotas } from "./types";

/** Her profile: user-entered, saved in localStorage, and mirrored into the URL so server pages can read it. */
export const profileSchema = z.object({
  rank: z.number().int().min(1).max(300000),
  category: z.enum(baseCategories),
  pwd: z.boolean(),
  /** Specialty codes, e.g. ANAESTHESIOLOGY. Empty = all. */
  specialties: z.array(z.string()),
  /** e.g. MD, DNB, NBEMS Diploma. Empty = all. */
  degrees: z.array(z.string()),
  /** MCC quota labels. Empty = the open quotas (types.ts openQuotas), never the restricted ones. */
  quotas: z.array(z.string()),
  states: z.array(z.string()),
  maxFeeLakh: z.number().positive().nullable(),
  maxBondYears: z.number().min(0).nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE_KEY = "medpath.profile";
export const profileParamKeys = ["rank", "cat", "pwd", "sp", "deg", "quota", "st", "fee", "bond"] as const;
/** Profile params that hold several values: repeated (sp=A&sp=B, what GET forms send) or comma-joined (sp=A,B). */
const listKeys = new Set<string>(["sp", "deg", "quota", "st"]);

/** Choices offered for the fee and bond caps, shared by the profile dialog and page filters. */
export const FEE_LAKH_CHOICES = [2, 5, 10, 20, 30, 50];
export const BOND_YEAR_CHOICES = [0, 1, 2, 3];
/** The fee choices plus her current cap when it isn't one of them (an imported profile), so a select never drops it. */
export const feeChoices = (current: number | null | undefined) =>
  current != null && !FEE_LAKH_CHOICES.includes(current) ? [...FEE_LAKH_CHOICES, current].sort((a, b) => a - b) : FEE_LAKH_CHOICES;

/** The quotas her profile covers: the ones she ticked, else the open quotas. */
export const profileQuotas = (p: Pick<Profile, "quotas">) => (p.quotas.length ? p.quotas : openQuotas);

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
  return {
    rank: num(p.get("rank")?.replace(/[,\s]/g, "")),
    category: baseCategories.find((c) => c.toLowerCase() === cat.toLowerCase()) ?? cat, // "obc" is OBC
    pwd: flag(p.get("pwd")),
    specialties: list(p, "sp"),
    degrees: list(p, "deg"),
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
  return {
    rank: rank.data,
    category: field("category", "Open"),
    pwd: field("pwd", false),
    specialties: field("specialties", []),
    degrees: field("degrees", []),
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
