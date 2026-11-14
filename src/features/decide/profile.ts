import { z } from "zod";
import { baseCategories } from "./types";

/** Her profile: user-entered, saved in localStorage, and mirrored into the URL so server pages can read it. */
export const profileSchema = z.object({
  rank: z.number().int().min(1).max(300000),
  category: z.enum(baseCategories),
  pwd: z.boolean(),
  /** Specialty codes, e.g. ANAESTHESIOLOGY. Empty = all. */
  specialties: z.array(z.string()),
  /** e.g. MD, DNB, NBEMS Diploma. Empty = all. */
  degrees: z.array(z.string()),
  /** MCC quota labels. Empty = all. */
  quotas: z.array(z.string()),
  states: z.array(z.string()),
  maxFeeLakh: z.number().positive().nullable(),
  maxBondYears: z.number().min(0).nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE_KEY = "medpath.profile";
export const profileParamKeys = ["rank", "cat", "pwd", "sp", "deg", "quota", "st", "fee", "bond"] as const;

const list = (p: URLSearchParams, k: string) => p.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
const num = (v: string | null) => (v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

/**
 * Reads a profile from URL params; null when there's no valid rank. Each optional field is validated on its own,
 * so one bad optional value falls back to its default instead of discarding the whole profile.
 */
export function profileFromParams(p: URLSearchParams): Profile | null {
  const rank = profileSchema.shape.rank.safeParse(num(p.get("rank")?.replace(/[,\s]/g, "") ?? null));
  if (!rank.success) return null;
  const field = <K extends keyof Profile>(k: K, v: unknown, fallback: Profile[K]): Profile[K] => {
    const r = profileSchema.shape[k].safeParse(v);
    return r.success ? (r.data as Profile[K]) : fallback;
  };
  return {
    rank: rank.data,
    category: field("category", p.get("cat"), "Open"),
    pwd: p.get("pwd") === "1",
    specialties: field("specialties", list(p, "sp"), []),
    degrees: field("degrees", list(p, "deg"), []),
    quotas: field("quotas", list(p, "quota"), []),
    states: field("states", list(p, "st"), []),
    maxFeeLakh: field("maxFeeLakh", num(p.get("fee")), null),
    maxBondYears: field("maxBondYears", num(p.get("bond")), null),
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

/** Next.js searchParams object → URLSearchParams. */
export function toURLSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
  return p;
}
