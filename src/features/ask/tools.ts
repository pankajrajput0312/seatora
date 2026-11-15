import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { collegeTypeLabel } from "@/features/decide/components/institute/college-type";
import { courseName, toChoiceItem } from "@/features/decide/components/options-view";
import { CHOICES_KEY, defaultChoices, parseChoices, pinOf, toMccText, type ChoiceItem, type ChoicesState } from "@/features/decide/lib/choices";
import { LATEST_YEAR, PAST_YEARS, reachLabel, reachOrder } from "@/features/decide/lib/reach";
import { clockNote, currentSteps, fmtIST, roundName, stepName, stepsNow } from "@/features/decide/lib/round-status";
import { statCells } from "@/features/decide/lib/stat-format";
import { typeValues, type TermFilters } from "@/features/decide/lib/term-filters";
import { profileQuotas, type Profile } from "@/features/decide/profile";
import { meritLists, scoreToRank } from "@/features/decide/server/merit";
import { listNotices, roundStatus } from "@/features/decide/server/notices";
import { canSeeResidents, listResidents, residentsBudget } from "@/features/decide/server/residents";
import { choiceOptions, getDecideData, getInstitute, getMeta, lastRanks, listOptions, type OptionRow } from "@/features/decide/service";
import { baseCategories, optionId, roundLabel, rounds, type SeatList } from "@/features/decide/types";
import { db } from "@/lib/db";
import { loadSkills } from "./skills";
import { findColleges, resolveCourses } from "./lookup";
import { saveReport } from "./reports";

// The assistant's tools: thin, validated wrappers over Decide's service (the same reads the pages make). Each returns
// compact JSON (rows capped, page links and source names included). Inputs come from the model: every one is parsed
// with its Zod schema here, whatever the API promised.

export type ToolContext = { userId: string; profile: Profile | null };
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

const MAX_ROWS = 25;
const MCC_BULLETIN = { name: "MCC Information Bulletin NEET-PG 2026", url: "https://cdnbbsr.s3waas.gov.in/s3e0f7a4d0ef9b84b83b693bbf3feb8e6e/uploads/2026/10/202610082121348550.pdf" };

/** A tool error the model should read and recover from (bad name, no rank…), not a crash. */
class ToolInputError extends Error {}
const fail = (m: string): never => {
  throw new ToolInputError(m);
};

const category = z.enum(baseCategories);
/** One option: its id from a tool result, or as the table names it (college with state/PIN, "DNB Anaesthesiology", MCC quota). */
const choiceRef = z.strictObject({
  id: z.string().max(300).optional(),
  college: z.string().max(200).optional(),
  course: z.string().max(120).optional(),
  quota: z.string().max(60).optional(),
});
const strs = z.array(z.string().max(120)).max(20);

/** Input schemas (strict: unknown keys are an error). Numeric limits are checked here; the API schema drops them (structured outputs don't take them). */
export const toolSchemas = {
  load_skill: z.strictObject({ name: z.string().max(60).describe("Skill name from the list in the system prompt") }),
  get_profile: z.strictObject({}),
  search_options: z.strictObject({
    courses: strs.optional().describe("Courses: 'DNB Anaesthesiology', 'MD Family Medicine', a specialty ('Anaesthesiology' = every degree) or a course slug. Default: her profile's."),
    rank: z.number().int().min(1).max(300000).optional().describe("AIR; default her profile's"),
    category: category.optional().describe("Her category; default her profile's"),
    quotas: strs.optional().describe("MCC quota labels, e.g. 'All India', 'DNB Quota', 'Deemed/Paid Seats'. Default: her profile's (else those three)."),
    states: strs.optional().describe("States to keep; default her profile's"),
    view: z.enum(["round", "all"]).optional().describe("round = options with seats in the current round's MCC seat lists; all = every option with past allotments. Default: the data's (round while choice filling is open)."),
    reach: z.array(z.enum(reachOrder)).max(8).optional().describe("Keep only these reach labels"),
    maxFeeLakh: z.number().positive().max(1000).optional().describe("Fee cap, ₹ lakh a year"),
    noBond: z.boolean().optional().describe("Only options whose documents say no bond"),
    page: z.number().int().min(1).max(40).optional(),
  }),
  college_profile: z.strictObject({
    college: z.string().min(2).max(160).describe("College name words ('Seth GS Mumbai', 'Kokilaben') or its Seatora slug"),
    course: z.string().max(120).optional().describe("Limit to one course or specialty"),
  }),
  last_ranks: z.strictObject({
    course: z.string().min(2).max(120).describe("'DNB Anaesthesiology' (one course) or a specialty ('Anaesthesiology': every degree)"),
    college: z.string().max(160).optional(),
    quota: z.string().max(60).optional(),
    category: z.enum([...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)]).optional().describe("Seat category; omit for all"),
  }),
  round_seats: z.strictObject({
    course: z.string().max(120).optional().describe("Default: her profile's courses"),
    state: z.string().max(60).optional(),
    quota: z.string().max(60).optional(),
  }),
  residents_at: z.strictObject({
    college: z.string().min(2).max(160),
    course: z.string().max(120).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
  }),
  compare: z.strictObject({
    colleges: z.array(z.string().min(2).max(160)).min(2).max(4),
    course: z.string().min(2).max(120),
  }),
  schedule: z.strictObject({}),
  score_to_rank: z.strictObject({
    score: z.number().int().min(-1000).max(1000),
    year: z.number().int().min(2000).max(2100).optional().describe("NBEMS result year; default every year in the data"),
  }),
  find_colleges: z.strictObject({
    query: z.string().min(2).max(160),
    state: z.string().max(60).optional(),
    type: z.enum(typeValues).optional().describe("govt, private, trust, deemed, central, esic, municipal, armed_forces, psu, railway"),
  }),
  draft_choice_list: z.strictObject({
    courses: strs.min(1).describe("Courses in her priority order (first = most wanted)"),
    quotas: strs.optional(),
    states: strs.optional().describe("Only these states"),
    avoidStates: strs.optional(),
    maxFeeLakh: z.number().positive().max(1000).optional(),
    maxBondYears: z.number().int().min(0).max(20).optional().describe("0 = no bond only"),
    maxBondPenaltyLakh: z.number().positive().max(10000).optional(),
    types: z.array(z.enum(typeValues)).max(10).optional().describe("College types to keep"),
    includeUnknownTerms: z.boolean().optional().describe("Keep options whose capped fee/bond is not published (default false)"),
    limit: z.number().int().min(5).max(60).optional().describe("Candidates to return, default 40"),
  }),
  save_choice_list: z.strictObject({
    items: z.array(choiceRef).min(1).max(150).describe("Her list in order: each an option id from a tool result, or college + course + quota exactly as in your table"),
    mode: z.enum(["replace", "append"]),
    listName: z.string().min(1).max(60).optional().describe("Default 'Ask Seatora plan'"),
    confirmed: z.boolean().describe("true only after she said yes in her own message"),
  }),
  create_report: z.strictObject({
    title: z.string().min(3).max(120),
    summary: z.string().min(10).max(4000).describe("Executive summary, markdown: where she stands this round"),
    choices: z.array(choiceRef.extend({ reason: z.string().max(300) })).max(150).describe("The ordered list (id, or college + course + quota) with a short reason each"),
    risks: z.array(z.string().max(500)).max(20).describe("Risks and what to watch: round dates, forfeits, leaving penalties"),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

const descriptions: Record<ToolName, string> = {
  load_skill: "Load a skill's instructions and domain knowledge by name. Load the relevant skill before answering in its area.",
  get_profile: "Her Seatora profile from this page: AIR, category, PwD, courses, quotas, states, fee and bond caps.",
  search_options: "Options (college + course + quota) for a rank, with Seatora's reach label, closing ranks by year and round, seats in the current round's lists, fee/stipend/bond. Like the Options page.",
  college_profile: "One college: type, state, beds, its courses here with closing history and current-round seats, and fee/stipend/bond/bond penalty/leaving penalty per course.",
  last_ranks: "Closing ranks of a course at every college (or one college), newest year first, rounds R1-R3 and stray. History only.",
  round_seats: "Seats in the current round's MCC seat lists (clear vacancy, virtual vacancy, newly added) for a course, state or quota.",
  residents_at: "Residents at a college from MCC's admitted lists: count and names with course and year. Never categories.",
  compare: "2-4 colleges side by side for one course: closings, seats, fee, stipend, bond, penalties.",
  schedule: "Where MCC counselling stands now: open steps, next dates, latest MCC notices with links.",
  score_to_rank: "What rank a NEET PG score was in each year's NBEMS result (history).",
  find_colleges: "Find colleges by name words, state or type; returns slugs and links.",
  draft_choice_list: "Candidates for her choice list from the current round's options, grouped dream / realistic / safe / unknown with facts and option ids. You order and explain them.",
  save_choice_list: "Save an ordered list into her Seatora Choices (account-synced, /decide/choices) as its own list. Only after she explicitly confirms in chat.",
  create_report: "Save a printable plan report (summary, ordered choices with facts, residents counts, risks, sources). Returns its link.",
};

/** Keywords structured outputs don't take; Zod still checks them on our side. */
const DROP = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern", "default"]);
function forApi(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forApi);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (!DROP.has(k)) out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, forApi(s)])) : forApi(v);
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/**
 * Strict schemas (grammar-constrained input) allow at most 24 optional parameters across all tools: the two filter-heavy
 * tools are not strict (Zod still checks them here, and a bad input goes back to the model as a tool error).
 */
const LOOSE = new Set<ToolName>(["search_options", "draft_choice_list"]);

/** The tool definitions sent to the API, in a fixed order (a stable prompt-cache prefix). */
export const toolDefs: Anthropic.Tool[] = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: forApi(z.toJSONSchema(toolSchemas[name], { io: "input" })) as Anthropic.Tool.InputSchema,
  strict: !LOOSE.has(name),
}));

/** What the chat shows while a tool runs. */
export const toolLabel: Record<ToolName, string> = {
  load_skill: "Reading a guide…",
  get_profile: "Reading your profile…",
  search_options: "Searching options for your rank…",
  college_profile: "Looking up the college…",
  last_ranks: "Looking up closing ranks…",
  round_seats: "Checking this round's seat lists…",
  residents_at: "Looking up residents…",
  compare: "Comparing colleges…",
  schedule: "Checking the MCC schedule…",
  score_to_rank: "Looking up score and rank…",
  find_colleges: "Finding colleges…",
  draft_choice_list: "Drafting candidates for your list…",
  save_choice_list: "Saving to your Choices…",
  create_report: "Writing your report…",
};

// ---- shared shaping ----

const yearRounds = (r: Pick<OptionRow, "grid">) =>
  Object.keys(r.grid)
    .map(Number)
    .sort((a, b) => b - a)
    .map((y) => {
      const g = r.grid[y];
      const cells = rounds.flatMap((rd) => {
        const c = g[rd];
        return c ? [`${roundLabel[rd]} ${formatRank(c.closing)} (${c.category}${c.provisional ? ", provisional" : ""})`] : [];
      });
      return `${y}: ${cells.join(", ")}`;
    });

/** The newest closing (R1-R3 first, then stray) as "45,409 (2025 R3, Open)". */
function lastClosing(r: Pick<OptionRow, "grid">) {
  for (const y of Object.keys(r.grid).map(Number).sort((a, b) => b - a)) {
    const main = (["R3", "R2", "R1"] as const).map((rd) => [rd, r.grid[y][rd]] as const).find(([, c]) => c);
    if (main) return `${formatRank(main[1]!.closing)} (${y} ${main[0]}, ${main[1]!.category})`;
  }
  return null;
}

const terms = (r: Pick<OptionRow, "fees">) => Object.fromEntries(statCells(r.fees).map((c) => [c.key, c.marker ? `${c.short} (${c.marker})` : c.short]));
const instLink = (slug: string, tab?: string) => `/decide/institutes/${slug}${tab ? `?tab=${tab}` : ""}`;
const seatsOf = (r: OptionRow) => (r.seatsBy ? Object.fromEntries(Object.entries(r.seatsBy).map(([k, v]) => [k, v ?? 0])) : undefined);

/** One option as the model sees it. */
function optionFacts(r: OptionRow, profile: Profile | null) {
  return {
    id: r.id,
    college: r.college.name,
    state: r.college.state,
    pin: pinOf(r),
    type: r.hospital?.type ? collegeTypeLabel[r.hospital.type.value] : null,
    course: courseName(r),
    quota: r.quota,
    ...(profile && { reach: reachLabel(r.reach, LATEST_YEAR, PAST_YEARS) + (r.reachProvisional ? " (provisional)" : "") }),
    lastClosing: lastClosing(r),
    closings: yearRounds(r),
    seatsThisRound: seatsOf(r),
    ...terms(r),
    link: instLink(r.college.slug, "courses"),
  };
}

const listNames = (lists: SeatList[]) => lists.map((l) => l.name);

async function meta() {
  return getMeta();
}

async function coursesOf(words: string[]) {
  const m = await meta();
  const r = resolveCourses(words, m.courses, m.degrees);
  if (r.unknown.length) fail(`Unknown course: ${r.unknown.join(", ")}. Use names like 'DNB Anaesthesiology', 'MD General Medicine' or a specialty name.`);
  return r.pairs;
}

async function oneCollege(q: string) {
  const { colleges } = await getDecideData();
  const found = findColleges(q, colleges);
  if (!found.length) fail(`No college matches "${q}". Try find_colleges with fewer words.`);
  // Several matches and none exact (findColleges returns an exact slug or name alone): never pick one silently.
  if (found.length > 1)
    fail(`"${q}" matches ${found.length} colleges: ${found.slice(0, 8).map((c) => `${c.name}, ${c.state ?? "?"} (slug ${c.slug})`).join("; ")}${found.length > 8 ? "; …" : ""}. Call again with the slug of the one she means, or ask her.`);
  return found[0];
}

function quotasOf(asked: string[] | undefined, known: string[]) {
  if (!asked?.length) return undefined;
  return asked.map((q) => known.find((k) => k.toLowerCase() === q.trim().toLowerCase()) ?? fail(`Unknown quota "${q}". MCC quotas: ${known.join(", ")}.`));
}
function statesOf(asked: string[] | undefined, known: string[]) {
  if (!asked?.length) return undefined;
  return asked.map((s) => known.find((k) => k.toLowerCase() === s.trim().toLowerCase()) ?? fail(`Unknown state "${s}".`));
}

/** Her profile with the tool's overrides; a rank is required. */
function profileWith(base: Profile | null, o: { rank?: number; category?: Profile["category"]; pairs?: string[]; quotas?: string[]; states?: string[] }): Profile {
  const rank = o.rank ?? base?.rank ?? fail("No rank: ask her for her NEET PG All India Rank (AIR) and category.");
  return {
    rank,
    category: o.category ?? base?.category ?? "Open",
    pwd: base?.pwd ?? false,
    specialties: o.pairs ? [] : (base?.specialties ?? []),
    degrees: o.pairs ? [] : (base?.degrees ?? []),
    pairs: o.pairs ?? base?.pairs,
    quotas: o.quotas ?? base?.quotas ?? [],
    states: o.states ?? base?.states ?? [],
    maxFeeLakh: base?.maxFeeLakh ?? null,
    maxBondYears: base?.maxBondYears ?? null,
  };
}

/** Option ids for refs (an id as given, else college + course + quota looked up); `missing` = refs that name no option. */
async function refIds(refs: z.infer<typeof choiceRef>[]) {
  const m = await meta();
  const { colleges } = await getDecideData();
  const ids: (string | null)[] = [];
  const missing: string[] = [];
  for (const r of refs) {
    if (r.id) {
      ids.push(r.id);
      continue;
    }
    const label = [r.college, r.course, r.quota].join(" / ");
    const pin = /\b(\d{6})\b/.exec(r.college ?? "")?.[1];
    // "Name, State PIN" as the table writes it: drop the PIN and a trailing state; else try the part before the first comma.
    let name = (r.college ?? "").replace(/\b\d{6}\b/, "").trim().replace(/,\s*$/, "");
    const st = m.states.find((x) => name.toLowerCase().endsWith(`, ${x.toLowerCase()}`) || name.toLowerCase().endsWith(` ${x.toLowerCase()}`));
    if (st) name = name.slice(0, -st.length).trim().replace(/,\s*$/, "");
    const atPin = (c: { slug: string; key: string }) => !pin || c.slug.endsWith(`-${pin}`) || c.key.includes(`#${pin}`);
    let found = name ? findColleges(name, colleges).filter(atPin) : [];
    if (!found.length && name.includes(",")) found = findColleges(name.split(",")[0], colleges).filter(atPin);
    const pairs = r.course ? resolveCourses([r.course], m.courses, m.degrees).pairs : [];
    const quota = m.quotas.find((q) => q.toLowerCase() === r.quota?.trim().toLowerCase());
    if (found.length < 1 || pairs.length !== 1 || !quota) {
      missing.push(label);
      ids.push(null);
      continue;
    }
    const [degree, specialty] = pairs[0].split("~");
    ids.push(optionId({ college: found[0].key, degree, specialty, quota }));
  }
  return { ids, missing };
}

const lakh = (v: number | undefined) => (v == null ? undefined : Math.round(v * 100000));

// ---- handlers ----

type Handlers = { [K in ToolName]: (input: z.infer<(typeof toolSchemas)[K]>, ctx: ToolContext) => Promise<unknown> };

const handlers: Handlers = {
  async load_skill({ name }) {
    const s = loadSkills().find((x) => x.name === name);
    return s ? { name: s.name, instructions: s.body } : fail(`No skill "${name}". Skills: ${loadSkills().map((x) => x.name).join(", ")}.`);
  },

  async get_profile(_, { profile }) {
    if (!profile) return { profile: null, note: "No rank in her profile. Ask for AIR and category, or she can set it with Edit in the sidebar." };
    const m = await meta();
    const names = (profile.pairs?.length ? profile.pairs : []).map((p) => {
      const [degree, sp] = p.split("~");
      return `${degree} ${m.courses.find((c) => c.degree === degree && c.specialty === sp)?.name ?? sp}`;
    });
    return {
      rank: profile.rank,
      category: profile.category,
      pwd: profile.pwd,
      courses: names.length ? names : profile.specialties.map((s) => m.specialties.find((x) => x.code === s)?.name ?? s),
      degrees: profile.pairs?.length ? undefined : profile.degrees,
      quotas: profileQuotas(profile),
      states: profile.states,
      maxFeeLakh: profile.maxFeeLakh,
      maxBondYears: profile.maxBondYears,
    };
  },

  async search_options(i, { profile }) {
    const m = await meta();
    const pairs = i.courses?.length ? await coursesOf(i.courses) : undefined;
    const p = profileWith(profile, { rank: i.rank, category: i.category, pairs, quotas: quotasOf(i.quotas, m.quotas), states: statesOf(i.states, m.states) });
    const tf: TermFilters = { maxFee: lakh(i.maxFeeLakh ?? p.maxFeeLakh ?? undefined) ?? null, maxBondYears: i.noBond ? 0 : (p.maxBondYears ?? null) };
    const r = await listOptions(p, { view: i.view, reach: i.reach, terms: tf }, { page: i.page ?? 1, pageSize: MAX_ROWS });
    return {
      for: { rank: p.rank, category: p.category, quotas: profileQuotas(p) },
      view: r.view,
      total: r.total,
      page: r.page,
      countsByReach: Object.fromEntries(Object.entries(r.counts).filter(([, n]) => n)),
      hiddenClosedBefore: r.hiddenClosed,
      leftOutNotPublished: r.unknownTerms,
      seatLists: listNames(r.seatLists),
      rows: r.rows.map((x) => ({ ...optionFacts(x, p), closings: yearRounds(x).slice(0, 3) })),
      link: "/decide/options" + (r.view === "all" ? "?view=all" : ""),
      sources: ["MCC PG allotment results 2024-2026 (Seatora's import)", ...listNames(r.seatLists)],
    };
  },

  async college_profile(i, { profile }) {
    const c = await oneCollege(i.college);
    const [inst, info] = await Promise.all([getInstitute(c.slug, profile), hospitalInfo()]);
    if (!inst) fail("College not found.");
    const h = info.get(c.key);
    const pairs = i.course ? await coursesOf([i.course]) : null;
    const rows = pairs ? inst!.options.filter((o) => pairs.includes(`${o.course.degree}~${o.course.specialty}`)) : inst!.yours.length ? inst!.yours : inst!.options;
    return {
      college: c.name,
      slug: c.slug,
      state: c.state,
      address: c.address,
      type: h?.type ? `${collegeTypeLabel[h.type.value]} (inferred, not official)` : null,
      beds: h?.beds ? `${h.beds.n}${h.beds.kind ? ` ${h.beds.kind}` : ""} (self-reported)` : null,
      allotmentsByYear: inst!.allotmentsByYear,
      coursesShown: pairs ? "asked course" : inst!.yours.length ? "her profile's courses" : "all courses",
      options: rows.slice(0, MAX_ROWS).map((r) => optionFacts(r, profile)),
      moreOptions: Math.max(0, rows.length - MAX_ROWS),
      programmes: inst!.fees.map((t) => ({ programme: t.programme, ...terms({ fees: t }), sources: t.sources.map((s) => s.label) })),
      seatList: inst!.seatList?.name ?? null,
      links: { overview: instLink(c.slug), fees: instLink(c.slug, "fees"), residents: instLink(c.slug, "residents"), mccProfile: h?.mccProfileUrl ?? null },
    };
  },

  async last_ranks(i) {
    const pairs = await coursesOf([i.course]);
    const specialties = [...new Set(pairs.map((p) => p.split("~")[1]))];
    const degrees = [...new Set(pairs.map((p) => p.split("~")[0]))];
    if (specialties.length !== 1) fail("One specialty at a time.");
    const m = await meta();
    const quota = i.quota ? quotasOf([i.quota], m.quotas)![0] : undefined;
    const college = i.college ? await oneCollege(i.college) : null;
    const r = await lastRanks({ specialty: specialties[0], degree: degrees.length === 1 ? degrees[0] : undefined, quota, category: i.category });
    const rows = r.rows.filter((x) => !college || x.college.key === college.key);
    const course = m.courses.find((c) => `${c.degree}~${c.specialty}` === pairs[0])!;
    return {
      seatCategory: i.category ?? "all seat categories (deepest)",
      total: rows.length,
      rows: rows.slice(0, MAX_ROWS).map((x) => ({ college: x.college.name, state: x.college.state, course: courseName(x), quota: x.quota, closings: yearRounds(x), link: instLink(x.college.slug, "courses") })),
      more: Math.max(0, rows.length - MAX_ROWS),
      link: `/decide/last-ranks?course=${course.slug}${i.category ? `&lcat=${encodeURIComponent(i.category)}` : ""}`,
      note: "History, not a prediction. R2/R3 count only new or upgraded allotments.",
      sources: ["MCC PG allotment results (Seatora's import)"],
    };
  },

  async round_seats(i, { profile }) {
    const m = await meta();
    const pairs = i.course ? await coursesOf([i.course]) : undefined;
    const p = profileWith(profile, { pairs, quotas: i.quota ? quotasOf([i.quota], m.quotas) : undefined, states: i.state ? statesOf([i.state], m.states) : undefined });
    const r = await listOptions(p, { view: "round", hasSeats: "any", showClosed: true, terms: {} }, { page: 1, pageSize: MAX_ROWS });
    return {
      seatLists: listNames(r.seatLists),
      optionsWithSeats: r.total,
      summary: r.summary,
      rows: r.rows.map((x) => ({ id: x.id, college: x.college.name, state: x.college.state, course: courseName(x), quota: x.quota, seats: seatsOf(x), reach: reachLabel(x.reach, LATEST_YEAR, PAST_YEARS), lastClosing: lastClosing(x), link: instLink(x.college.slug, "seats") })),
      note: "Seat kinds overlap (a newly added seat is also in the clear vacancy list): never add them. Lists as MCC published them.",
      link: "/decide/seats",
    };
  },

  async residents_at(i) {
    const c = await oneCollege(i.college);
    if (!(await canSeeResidents())) fail("Residents' names need a signed-in member session.");
    if (!(await residentsBudget("read"))) fail("Daily residents read limit reached. Try tomorrow or open the page.");
    const pair = i.course ? (await coursesOf([i.course]))[0] : undefined;
    const slug = pair ? (await meta()).courses.find((x) => `${x.degree}~${x.specialty}` === pair)?.slug : undefined;
    const r = await listResidents(c.key, { course: slug, year: i.year }, { page: 1, pageSize: 60 });
    return {
      college: c.name,
      total: r.total,
      shown: r.rows.length,
      residents: r.rows.map((x) => ({ name: x.name, course: `${x.course.degree} ${x.course.name}`, year: x.year })),
      link: instLink(c.slug, "residents"),
      note: "Names from MCC admitted-candidates lists. No category is held: never state or infer one. Contact respectfully.",
      sources: r.sources.filter((s) => !s.key.startsWith("nbems")).map((s) => s.name),
    };
  },

  async compare(i, { profile }) {
    const pairs = await coursesOf([i.course]);
    const out = await Promise.all(
      i.colleges.map(async (q) => {
        const c = await oneCollege(q);
        const inst = await getInstitute(c.slug, profile);
        const rows = (inst?.options ?? []).filter((o) => pairs.includes(`${o.course.degree}~${o.course.specialty}`));
        return { college: c.name, slug: c.slug, state: c.state, options: rows.slice(0, 6).map((r) => optionFacts(r, profile)), note: rows.length ? undefined : "No option for this course here." };
      }),
    );
    const ids = out.flatMap((x) => x.options.map((o) => o.id)).slice(0, 4);
    return { colleges: out, compareLink: ids.length > 1 ? `/decide/compare?ids=${ids.map(encodeURIComponent).join(",")}` : null };
  },

  async schedule() {
    const rs = await roundStatus(LATEST_YEAR);
    const notices = (await listNotices({ year: LATEST_YEAR })).slice(0, 8).map((n) => ({ date: n.date, title: n.title, url: n.url }));
    if (!rs) return { status: `No MCC round status for ${LATEST_YEAR} in the data.`, notices, link: "/decide/counselling" };
    const steps = stepsNow(rs, new Date());
    const { live, next } = currentSteps(steps);
    const line = (s: (typeof steps)[number]) => ({
      round: roundName[s.round],
      step: stepName[s.step],
      status: s.now,
      until: s.scheduled?.to ? fmtIST(s.scheduled.to, true) : null,
      from: s.scheduled?.from ? fmtIST(s.scheduled.from, true) : s.scheduled?.on ? fmtIST(s.scheduled.on, true) : null,
      tentative: s.scheduled?.tentative ?? false,
      note: clockNote(s) ?? s.note,
      notice: s.url,
    });
    return {
      year: rs.year,
      asOf: rs.asOf,
      openNow: live.map(line),
      next: next ? line(next) : null,
      allSteps: steps.map((s) => `${roundName[s.round]} ${stepName[s.step]}: ${s.now}`),
      latestNotices: notices,
      link: "/decide/counselling",
      sources: ["MCC notices (each with its link)", MCC_BULLETIN.name],
    };
  },

  async score_to_rank({ score, year }) {
    const years = year ? [year] : (await meritLists()).map((l) => l.year);
    const rows = (await Promise.all(years.map((y) => scoreToRank(y, score)))).filter((r) => r != null);
    if (!rows.length) fail(year ? `No NBEMS result data for ${year}.` : "No NBEMS result data.");
    return {
      score,
      years: rows.map((r) => ({ year: r.year, maxMarks: r.source.maxMarks, at: r.at, nearestAbove: r.above, nearestBelow: r.below, source: { name: r.source.name, url: r.source.url } })),
      note: "bestRank-worstRank = the ranks of candidates with exactly that score that year. History; each year has its own scale.",
      link: "/decide/rank-tools",
    };
  },

  async find_colleges(i) {
    const { colleges } = await getDecideData();
    const info = await hospitalInfo();
    const st = i.state?.toLowerCase();
    const found = findColleges(i.query, colleges).filter((c) => (!st || c.state?.toLowerCase() === st) && (!i.type || info.get(c.key)?.type?.value === i.type));
    return {
      total: found.length,
      colleges: found.slice(0, MAX_ROWS).map((c) => ({ name: c.name, slug: c.slug, state: c.state, type: info.get(c.key)?.type ? collegeTypeLabel[info.get(c.key)!.type!.value] : null, link: instLink(c.slug) })),
    };
  },

  async draft_choice_list(i, { profile }) {
    const m = await meta();
    const order = await Promise.all(i.courses.map((w) => coursesOf([w])));
    const pairs = [...new Set(order.flat())];
    const prio = (r: OptionRow) => order.findIndex((ps) => ps.includes(`${r.course.degree}~${r.course.specialty}`));
    const p = profileWith(profile, { pairs, quotas: quotasOf(i.quotas, m.quotas), states: statesOf(i.states, m.states) });
    const avoid = new Set(statesOf(i.avoidStates, m.states) ?? []);
    const tf: TermFilters = {
      types: i.types,
      maxFee: lakh(i.maxFeeLakh) ?? null,
      maxBondYears: i.maxBondYears ?? null,
      maxBondInr: lakh(i.maxBondPenaltyLakh) ?? null,
      keepUnknown: i.includeUnknownTerms ?? false,
    };
    const r = await listOptions(p, { showClosed: true, terms: tf }, { page: 1, pageSize: 600 });
    const deepest = (x: OptionRow) => Math.max(0, ...Object.values(x.byYear).map((d) => d?.closing ?? 0));
    const bucket = (x: OptionRow): "dream" | "realistic" | "safe" | "unknown" | null => {
      const d = deepest(x);
      if (x.reach === "new" || x.reach === "no-data") return "unknown";
      if (x.reach === "closed-before") return d >= p.rank * 0.8 ? "dream" : null; // far before her rank: not worth a line
      if (x.reach === "within-10" || x.reach === "stray-only") return "dream";
      const past = PAST_YEARS.map((y) => x.byYear[y]?.closing ?? 0);
      return x.reach === "reached-both" && Math.min(...past) >= p.rank * 1.25 ? "safe" : "realistic";
    };
    const rows = r.rows.filter((x) => !avoid.has(x.college.state ?? "")).map((x) => ({ x, b: bucket(x) })).filter((y) => y.b);
    const limit = i.limit ?? 40;
    const caps = { dream: Math.ceil(limit * 0.2), realistic: Math.ceil(limit * 0.5), safe: Math.ceil(limit * 0.25), unknown: Math.ceil(limit * 0.1) };
    const pick = (b: keyof typeof caps) =>
      rows
        .filter((y) => y.b === b)
        .sort((a, z) => prio(a.x) - prio(z.x) || (b === "safe" ? deepest(a.x) - deepest(z.x) : deepest(z.x) - deepest(a.x)))
        .slice(0, caps[b])
        .map((y) => ({ ...optionFacts(y.x, p), closings: yearRounds(y.x).slice(0, 2), coursePriority: prio(y.x) + 1, link: undefined }));
    return {
      for: { rank: p.rank, category: p.category, courses: i.courses, quotas: profileQuotas(p) },
      view: r.view,
      onlyWithSeatsThisRound: r.view === "round",
      seatLists: listNames(r.seatLists),
      matched: rows.length,
      leftOutNotPublished: r.unknownTerms,
      dream: pick("dream"),
      realistic: pick("realistic"),
      safe: pick("safe"),
      unknown: pick("unknown"),
      rules: "dream = closed within ~20% before her rank in recent rounds; realistic = reached in 2026 R1 or 2024/2025; safe = reached in both 2024 and 2025 by 25%+ margin; unknown = no past allotment on her seats. History, not a prediction.",
      choicesLink: "/decide/choices",
    };
  },

  async save_choice_list(i, { userId, profile }) {
    if (!i.confirmed) fail("Not saved: ask her to confirm in chat first (replace or append), then call again with confirmed: true.");
    const refs = await refIds(i.items);
    const wanted = [...new Set(refs.ids.filter((x): x is string => !!x))];
    const { rows } = await choiceOptions(wanted, profile);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = [...refs.missing, ...wanted.filter((id) => !byId.has(id))];
    const items: ChoiceItem[] = wanted.flatMap((id) => (byId.has(id) ? [toChoiceItem(byId.get(id)!)] : []));
    if (!items.length) fail(`None of these name an option in the data: ${missing.slice(0, 5).join("; ")}. Use ids from draft_choice_list or exact college, course and quota.`);
    const name = i.listName?.trim() || "Ask Seatora plan";
    const listId = `ask-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan"}`;
    const row = await db.userChoices.findUnique({ where: { userId } });
    const state: ChoicesState = row ? parseChoices(row.json) : defaultChoices;
    const old = state.lists.find((l) => l.id === listId);
    const kept = i.mode === "append" && old ? [...old.items, ...items.filter((x) => !old.items.some((o) => o.id === x.id))] : items;
    const list = { id: listId, name, items: kept, typedIds: i.mode === "append" && old ? old.typedIds : [] };
    const next: ChoicesState = { lists: old ? state.lists.map((l) => (l.id === listId ? list : l)) : [...state.lists, list], activeId: listId };
    const json = JSON.parse(JSON.stringify(next));
    await db.userChoices.upsert({ where: { userId }, create: { userId, json, updatedAt: new Date() }, update: { json, updatedAt: new Date() } });
    return {
      saved: kept.length,
      list: name,
      mode: i.mode,
      notFound: missing,
      mccText: toMccText(list),
      link: "/decide/choices",
      note: `Saved to her account (${CHOICES_KEY} syncs on her devices when Decide opens or the tab comes back into view).`,
    };
  },

  async create_report(i, { userId, profile }) {
    const p = profileWith(profile, {});
    const refs = await refIds(i.choices);
    const { rows } = await choiceOptions([...new Set(refs.ids.filter((x): x is string => !!x))], p);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const choices = i.choices.flatMap((c, n) => {
      const r = byId.get(refs.ids[n] ?? "");
      if (!r) return [];
      const t = terms(r);
      return [{ college: r.college.name, state: r.college.state, slug: r.college.slug, course: courseName(r), quota: r.quota, reach: reachLabel(r.reach, LATEST_YEAR, PAST_YEARS), lastClosing: lastClosing(r), seats: seatsOf(r) ?? null, fee: t.fee, stipend: t.stipend, bond: t.bond, bondInr: t.bondInr, leaving: t.leaving, reason: c.reason }];
    });
    if (!choices.length && i.choices.length) fail("None of the choices name an option in the data. Use ids from draft_choice_list or exact college, course and quota.");
    const top = [...new Map(choices.map((c) => [c.slug, c])).values()].slice(0, 5);
    const residentCounts = await Promise.all(top.map(async (c) => ({ college: c.college, slug: c.slug, residents: await db.resident.count({ where: { college: { slug: c.slug }, hidden: false } }) })));
    const termSources = rows.flatMap((r) => r.fees.sources.map((s) => ({ name: s.label, url: s.url })));
    const m = await meta();
    const resultSources = m.sources.filter((s) => s.year >= PAST_YEARS[0]).map((s) => ({ name: s.name, url: s.url }));
    const sources = [...new Map([MCC_BULLETIN, ...termSources, ...resultSources].map((s) => [s.url ?? s.name, s])).values()].slice(0, 60);
    const courseNames = (p.pairs ?? []).map((x) => {
      const [d, s] = x.split("~");
      return `${d} ${m.courses.find((c) => c.degree === d && c.specialty === s)?.name ?? s}`;
    });
    const id = await saveReport(userId, i.title, {
      profile: { rank: p.rank, category: p.category, pwd: p.pwd, courses: courseNames.length ? courseNames : p.specialties.map((x) => m.specialties.find((y) => y.code === x)?.name ?? x) },
      summary: i.summary,
      choices,
      residents: residentCounts,
      risks: i.risks,
      sources,
    });
    return { reportId: id, link: `/decide/ask/report/${id}`, choices: choices.length, notFound: i.choices.length - choices.length };
  },
};

/** Runs one tool call: validates, time-limits, and turns every failure into a message for the model (never throws). */
export async function runTool(name: string, input: unknown, ctx: ToolContext, timeoutMs: number): Promise<ToolResult> {
  if (!(name in toolSchemas)) return { ok: false, error: `Unknown tool ${name}.` };
  const parsed = toolSchemas[name as ToolName].safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = (handlers[name as ToolName] as (i: unknown, c: ToolContext) => Promise<unknown>)(parsed.data, ctx);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ToolInputError(`Timed out after ${timeoutMs / 1000}s. Try a narrower question.`)), timeoutMs);
    });
    return { ok: true, data: await Promise.race([run, timeout]) };
  } catch (e) {
    if (e instanceof ToolInputError) return { ok: false, error: e.message };
    console.error("[ask] tool failed", name, e instanceof Error ? e.name : "error"); // no inputs: they can hold names
    return { ok: false, error: "The data lookup failed. Say the data is unavailable right now; do not guess." };
  } finally {
    clearTimeout(timer);
  }
}
