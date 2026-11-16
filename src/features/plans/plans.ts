// Plans and their limits: one table, overridable per value from env (docs/PLANS_AND_ROLES.md). Pure, so tested.
// Limits are per account per IST day (00:00 Asia/Kolkata). Infinity = unlimited.

export const ROLES = ["OWNER", "ADMIN", "PREMIUM", "FREE"] as const;
export type Role = (typeof ROLES)[number];
export type Plan = "FREE" | "PREMIUM";

/** Counted per day: ask (questions), institutes (distinct institute pages), residents (name searches / views). */
export const COUNTED = ["ask", "institutes", "residents"] as const;
export type Counted = (typeof COUNTED)[number];
/** Caps and switches: csv (0 = no exports), compare (options side by side), reports (0 = none), choiceLists (saved lists). */
export type Capped = "csv" | "compare" | "reports" | "choiceLists";
export type Feature = Counted | Capped;
export type Limits = Record<Feature, number>;

const DEFAULTS: Record<Plan, Limits> = {
  FREE: { ask: 3, institutes: 10, residents: 10, csv: 0, compare: 2, reports: 0, choiceLists: 1 },
  PREMIUM: { ask: 50, institutes: Infinity, residents: 200, csv: Infinity, compare: 4, reports: Infinity, choiceLists: 10 },
};

/** Words for the paywall and the chip. */
export const FEATURE_LABEL: Record<Feature, string> = {
  ask: "Ask Seatora questions a day",
  institutes: "institute pages a day",
  residents: "residents searches a day",
  csv: "CSV exports",
  compare: "options in Compare",
  reports: "plan reports",
  choiceLists: "saved choice lists",
};

const envKey = (plan: Plan, f: Feature) => `PLAN_${plan}_${f.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
/** "unlimited" or -1 = Infinity; a whole number ≥ 0 = that; anything else = the default. */
function envLimit(raw: string | undefined, fallback: number) {
  const v = raw?.trim().toLowerCase();
  if (v === "unlimited" || v === "-1") return Infinity;
  const n = Number(v);
  return v && Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** A plan's limits: DEFAULTS, each overridable by PLAN_<PLAN>_<FEATURE> (e.g. PLAN_FREE_INSTITUTES=20, PLAN_FREE_CHOICE_LISTS=2). */
export function planLimits(plan: Plan, env: Record<string, string | undefined> = process.env): Limits {
  return Object.fromEntries(Object.entries(DEFAULTS[plan]).map(([f, n]) => [f, envLimit(env[envKey(plan, f as Feature)], n)])) as Limits;
}

/** FREE_FOR_ALL_UNTIL (ISO date-time, e.g. 2026-11-20T23:59:59+05:30): before it everyone gets Premium limits. Null: unset or invalid. */
export function freeForAllUntil(raw = process.env.FREE_FOR_ALL_UNTIL) {
  const t = raw?.trim() ? Date.parse(raw.trim()) : NaN;
  return Number.isFinite(t) ? new Date(t) : null;
}

/** FREE_FOR_ALL_UNTIL while it is still ahead, else null. */
export function freeNow(now = new Date(), raw = process.env.FREE_FOR_ALL_UNTIL) {
  const until = freeForAllUntil(raw);
  return until && until > now ? until : null;
}

export type Account = { role: Role; premiumUntil: Date | null };
export type Effective = {
  plan: Plan;
  /** OWNER or ADMIN: no limit applies (usage is still counted). */
  staff: boolean;
  /** Premium only because of FREE_FOR_ALL_UNTIL: the date it ends. */
  freeUntil: Date | null;
  limits: Limits;
};

const UNLIMITED = Object.fromEntries(Object.keys(DEFAULTS.PREMIUM).map((f) => [f, Infinity])) as Limits;

/** The plan an account gets now: Premium for staff, PREMIUM, an unexpired premiumUntil, or anyone before FREE_FOR_ALL_UNTIL. */
export function effectivePlan(a: Account, now = new Date(), env: Record<string, string | undefined> = process.env): Effective {
  const staff = a.role === "OWNER" || a.role === "ADMIN";
  const paid = staff || a.role === "PREMIUM" || (!!a.premiumUntil && a.premiumUntil > now);
  const until = freeForAllUntil(env.FREE_FOR_ALL_UNTIL);
  const freeUntil = !paid && until && until > now ? until : null;
  const plan: Plan = paid || freeUntil ? "PREMIUM" : "FREE";
  return { plan, staff, freeUntil, limits: staff ? UNLIMITED : planLimits(plan, env) };
}

export type PassState = "staff" | "pass" | "claimed" | "claimable" | "free";
/**
 * Where she stands for the Season Pass call to action. staff: owner or admin. pass: a Season Pass beyond the free period
 * (paid, PREMIUM, or granted on the admin page; `until` its end, null without one). claimed: the free upgrade, which ends
 * with FREE_FOR_ALL_UNTIL (`until`). claimable: the free period is on and she hasn't upgraded (`until` its end). free:
 * the Free plan after it.
 */
export function passState(a: Account, now = new Date(), env: Record<string, string | undefined> = process.env): { state: PassState; until: Date | null } {
  if (a.role === "OWNER" || a.role === "ADMIN") return { state: "staff", until: null };
  if (a.role === "PREMIUM") return { state: "pass", until: null };
  const all = freeForAllUntil(env.FREE_FOR_ALL_UNTIL);
  if (a.premiumUntil && a.premiumUntil > now) return { state: all && a.premiumUntil <= all ? "claimed" : "pass", until: a.premiumUntil };
  return all && all > now ? { state: "claimable", until: all } : { state: "free", until: null };
}

const IST_MS = 5.5 * 3_600_000;
/** The IST calendar day of `now` as "YYYY-MM-DD", and when it ends (the next 00:00 IST). */
export function istDay(now = new Date()) {
  const day = new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
  return { day, resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000 - IST_MS) };
}

/** "Free till 20 Nov" style date (IST). */
export const shortDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
/** "Season Pass active till 31 Mar 2027" style date (IST). */
export const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
