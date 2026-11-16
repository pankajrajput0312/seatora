// First-party funnel events, the device cookie and error grouping (docs/FUNNEL.md). Pure (no Node, Next or Zod
// imports): the Edge middleware uses it too.

/** Anonymous device id: 16 random bytes, base64url. src/middleware.ts sets it on page requests (not for bots). */
export const AID_COOKIE = "seatora_aid";
export const AID_MAX_AGE_S = 60 * 60 * 24 * 365;
export const isAid = (v: string | undefined | null): v is string => !!v && /^[\w-]{22}$/.test(v);

/** Crawlers, link previews, scripts and headless browsers (no user agent too): no device cookie, no events. */
export const isBot = (ua: string | null | undefined) =>
  !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget|python|httpclient|go-http|node-fetch|axios|java\//i.test(ua);

export const EVENTS = [
  "landing_view",
  "pricing_view",
  "signup_view",
  "signup_done",
  "signin_done",
  "plan_popup_shown",
  "plan_popup_dismissed",
  "upgrade_click",
  "free_claimed",
  "checkout_opened",
  "checkout_cancelled",
  "payment_failed",
  "payment_paid",
  "paywall_shown",
  "referral_link_open",
  "referral_page_view",
] as const;
export type EventName = (typeof EVENTS)[number];

/** The only names the browser may send (POST /api/events); the rest are recorded on the server. */
export const CLIENT_EVENTS = [
  "landing_view",
  "pricing_view",
  "signup_view",
  "plan_popup_shown",
  "plan_popup_dismissed",
  "upgrade_click",
  "checkout_cancelled",
  "payment_failed",
  "referral_page_view",
] as const satisfies readonly EventName[];

/** Where an Upgrade was clicked (data-upgrade, else the nearest data-placement). */
export const PLACEMENTS = ["popup", "sidebar_footer", "header_chip", "home_card", "plan_page", "paywall", "pricing", "account"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** The main funnel, in order; a stage counts the people with any of its events. */
export const STAGES = [
  { label: "Visited home or pricing", short: "Visitors", events: ["landing_view", "pricing_view"] },
  { label: "Opened sign-up", short: "Sign-up page", events: ["signup_view"] },
  { label: "Signed up", short: "Signed up", events: ["signup_done"] },
  { label: "Saw the plan pop-up", short: "Pop-up", events: ["plan_popup_shown"] },
  { label: "Clicked Upgrade", short: "Upgrade", events: ["upgrade_click"] },
  { label: "Claimed free or opened checkout", short: "Claimed / checkout", events: ["free_claimed", "checkout_opened"] },
  { label: "Paid", short: "Paid", events: ["payment_paid"] },
] as const satisfies readonly { label: string; short: string; events: readonly EventName[] }[];
export const STAGE_EVENTS: EventName[] = STAGES.flatMap((s) => [...s.events]);

/** One person: the account when known, else the device; null when neither (not counted). Same as the admin SQL's coalesce. */
export const person = (r: { userId: string | null; aid: string | null }) => r.userId ?? (r.aid ? `aid:${r.aid}` : null);

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** Unique people per stage, the step conversion (vs the stage before) and overall (vs the first stage), in %. */
export function funnel(rows: readonly { name: string; userId: string | null; aid: string | null }[]) {
  const people = STAGES.map((s) => new Set(rows.filter((r) => (s.events as readonly string[]).includes(r.name)).map(person).filter(Boolean)).size);
  return STAGES.map((s, i) => ({ label: s.label, people: people[i], step: i ? pct(people[i], people[i - 1]) : null, overall: i ? pct(people[i], people[0]) : null }));
}

/**
 * An error message fit to store: the first line (and the last, where Prisma and friends put the reason) with query
 * strings, emails and tokens (letter-and-digit runs of 20+: session tokens, ids, hashes) taken out, 500 characters at most.
 * ponytail: names can't be recognised; first and last line keep Prisma's argument dump (the middle) out.
 */
export function scrub(raw: string) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const text = lines.length > 1 ? `${lines[0]} … ${lines.at(-1)}` : (lines[0] ?? "");
  return text
    .replace(/\?[^\s'"`)]+/g, "")
    .replace(/[^\s@'"`<>(),;:]+@[^\s@'"`<>(),;:]+\.[a-z]{2,}/gi, "<email>")
    .replace(/\b(?=[\w-]*\d)(?=[\w-]*[a-z])[\w-]{20,}/gi, "<token>")
    .slice(0, 500);
}

/** A path without its query or hash, scrubbed. */
export const routeOf = (path: string) => scrub(path.split(/[?#]/)[0]).slice(0, 200) || "/";

/** What the fingerprint hashes: ids (8+ characters with a digit) and numbers become placeholders, so one bug is one group. */
export const fingerprintInput = (kind: string, route: string, message: string) =>
  [kind, route, message].map((s) => s.replace(/\b(?=[\w-]*\d)[\w-]{8,}\b/g, "<id>").replace(/\d+/g, "<n>")).join("\n");

/** Alert on a fingerprint's first occurrence, its 10th and its 100th. */
export const ALERT_AT: readonly number[] = [1, 10, 100];
