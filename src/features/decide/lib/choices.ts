// Pure choice-list logic (tested). Items are snapshots so a list renders without refetching.
import { z } from "zod";
import type { ProgrammeTerms } from "../server/terms";
import { inrFull, statCells, statKeys, statLabel, type StatCell } from "./stat-format";
import { groupOf } from "@/features/exams/exam";

export type ChoiceItem = {
  id: string; // option id
  institute: string;
  slug: string;
  state: string | null;
  course: string; // e.g. "DNB Anaesthesiology"
  courseSlug?: string;
  quota: string;
  reachLabel: string;
  closedEveryRound: boolean;
};
/** typedIds: items already typed into the MCC portal, tracked by id so reordering never moves the marks. */
export type ChoiceList = { id: string; name: string; items: ChoiceItem[]; typedIds: string[] };
export type ChoicesState = { lists: ChoiceList[]; activeId: string };

export const CHOICES_KEY = "medpath.choices";
export const COMPARE_KEY = "medpath.compare";
export const MAX_COMPARE = 4;

export const defaultChoices: ChoicesState = {
  lists: [{ id: "r2-2026", name: "Round 2 · 2026", items: [], typedIds: [] }],
  activeId: "r2-2026",
};

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export function toggleItem(state: ChoicesState, item: ChoiceItem): ChoicesState {
  return updateActive(state, (l) => ({
    ...l,
    items: l.items.some((i) => i.id === item.id) ? l.items.filter((i) => i.id !== item.id) : [...l.items, item],
  }));
}

export function updateActive(state: ChoicesState, fn: (l: ChoiceList) => ChoiceList): ChoicesState {
  return { ...state, lists: state.lists.map((l) => (l.id === state.activeId ? fn(l) : l)) };
}

/**
 * The first list, still under its default name, takes the name of the round she fills next (MCC's schedule: "Round 3 ·
 * 2026"), so the star and Choices say the same; a list she named or duplicated keeps its own, and no two lists end up
 * with one name. Null: nothing to rename.
 */
export function nameFirstList(state: ChoicesState, name: string): ChoicesState | null {
  const first = defaultChoices.lists[0];
  const own = (l: ChoiceList) => l.id === first.id && l.name === first.name;
  if (name === first.name || state.lists.some((l) => l.name === name) || !state.lists.some(own)) return null;
  return { ...state, lists: state.lists.map((l) => (own(l) ? { ...l, name } : l)) };
}

/** Copies a list as the next round's list, e.g. "Round 2 · 2026" → "Round 3 · 2026". */
export function duplicateList(state: ChoicesState, sourceId: string): ChoicesState {
  const src = state.lists.find((l) => l.id === sourceId);
  if (!src) return state;
  const name = src.name.replace(/Round (\d+)/, (_, n) => `Round ${Number(n) + 1}`);
  const id = `${sourceId}-copy-${state.lists.length}`;
  return { lists: [...state.lists, { ...src, id, name: name === src.name ? `${src.name} (copy)` : name, typedIds: [] }], activeId: id };
}

/** One choice's fee, bond and penalties in words, for sharing: "Fee: ₹1.71 L/yr; Bond period: 1 year; Bond penalty: ₹10 L; Leaving penalty: None". What isn't in the data is left out. */
/** A cell in words; a fee only "On college website ↗" gives its link instead (no arrow in a message or a file). */
export const cellWords = (c: StatCell) => (c.href && c.full.endsWith("↗") ? `on the college website, ${c.href}` : c.full);
export const termsWords = (t: ProgrammeTerms) => statCells(t).filter((c) => c.key !== "stipend" && !c.missing).map((c) => `${c.label}: ${cellWords(c)}`).join("; ");

/** The list for WhatsApp, in order, one line a choice (`terms`: its termsWords, null while not loaded), then `url`: the list's page. */
/** `exam`: the exam's name ("NEET PG"). */
export function shareText(list: ChoiceList, terms: (id: string) => string | null, url: string, exam = "NEET PG") {
  const lines = list.items.map((i, n) => {
    const t = terms(i.id);
    return `${n + 1}. ${i.institute} — ${i.course}, ${i.quota}${t ? `. ${t}` : ""}`;
  });
  return [`My ${exam} choice list (${list.name}), in order:`, ...lines, "", `The list on Seatora: ${url}`].join("\n");
}

/**
 * NEET SS: the choices of another question group than hers (`groups`, from her quotas): her rank isn't one there, so
 * Copy, Share and CSV leave them out unless asked. None when she has no group (or another exam).
 */
/** A whole-course fee read "up to": a year's figure is an NBEMS maximum or a range's top (feeValue: the cautious figure). */
const upTo = (t: ProgrammeTerms) => t.years.some((y) => y.fee?.kind === "maximum" || y.fee?.min != null);
/** One choice's whole-course fee as words (NEET SS and MDS choice lists): "₹4,50,000 (3 years)", or "not published". */
export const wholeCourseWords = (t: ProgrammeTerms) =>
  t.wholeCourseFee == null ? "not published" : `${upTo(t) ? "up to " : ""}${inrFull(t.wholeCourseFee)} (${t.durationYears} ${t.durationYears === 1 ? "year" : "years"})`;
/**
 * The list's whole-course fees as a range, never a sum (she takes one seat, not all of them): the cheapest and the
 * dearest of the `n` choices that publish one (`upTo`: the dearest is a maximum or a range's top), `missing` the ones
 * that publish none, never counted as ₹0. Stipend is never taken off.
 */
export function wholeCourseRange(ts: ProgrammeTerms[]) {
  const known = ts.filter((t) => t.wholeCourseFee != null).sort((a, b) => a.wholeCourseFee! - b.wholeCourseFee!);
  const dearest = known.at(-1);
  return { min: known[0]?.wholeCourseFee ?? null, max: dearest?.wholeCourseFee ?? null, n: known.length, missing: ts.length - known.length, upTo: !!dearest && upTo(dearest) };
}

export const otherGroupItems = (items: ChoiceItem[], groups: string[]) => (groups.length ? items.filter((i) => !groups.includes(groupOf(i.quota) ?? "")) : []);

/** The PIN in the item's college key (types.ts optionId: "NAME…#PIN~degree~specialty~quota"); null when the key has none. */
export const pinOf = (i: Pick<ChoiceItem, "id">) => /#(\d{6})~/.exec(i.id)?.[1] ?? null;

/** Text in the order to type into the MCC portal: institute, state and PIN (two colleges can share a name), course, MCC quota. */
export function toMccText(list: ChoiceList): string {
  return list.items.map((i, n) => `${n + 1}. ${[i.institute, [i.state, pinOf(i)].filter(Boolean).join(" ")].filter(Boolean).join(", ")} — ${i.course} — ${i.quota}`).join("\n");
}

/** The CSV's columns after the choice: its closings and terms (`extra`, in this order; blank while not loaded). */
export const CSV_EXTRA = ["Latest closing", "Deepest closing", ...statKeys.map((k) => statLabel[k])];

/** `cols`: the extra columns' names (default CSV_EXTRA; Suggest my list: its bucket and reason). */
export function toCsv(list: ChoiceList, extra: (id: string) => (string | null)[] | null = () => null, cols: string[] = CSV_EXTRA): string {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Order", "Institute", "State", "PIN", "Course", "Quota", ...cols].join(",");
  return [head, ...list.items.map((i, n) => [n + 1, esc(i.institute), esc(i.state), esc(pinOf(i)), esc(i.course), esc(i.quota), ...cols.map((_, k) => esc(extra(i.id)?.[k] ?? null))].join(","))].join("\n");
}

/** Suggest my list's "Add": `items` after her choices (one already in the list stays where it is); `added`: how many were new. */
export function addToList(list: ChoiceList, items: ChoiceItem[]): { list: ChoiceList; added: number } {
  const have = new Set(list.items.map((i) => i.id));
  const add = items.filter((i, k) => !have.has(i.id) && items.findIndex((x) => x.id === i.id) === k);
  return { list: { ...list, items: [...list.items, ...add] }, added: add.length };
}

/** Suggest my list's "Use this order": `items` first, in their order, then her other choices in hers. Nothing is removed. */
export function putFirst(list: ChoiceList, items: ChoiceItem[]): ChoiceList {
  const ids = new Set(items.map((i) => i.id));
  const mine = new Map(list.items.map((i) => [i.id, i]));
  return { ...list, items: [...items.filter((i, k) => items.findIndex((x) => x.id === i.id) === k).map((i) => mine.get(i.id) ?? i), ...list.items.filter((i) => !ids.has(i.id))] };
}

/** Mark the first n items as typed into MCC (what's in the portal now). */
export function markTypedUpTo(list: ChoiceList, n: number): ChoiceList {
  return { ...list, typedIds: list.items.slice(0, Math.max(0, Math.min(n, list.items.length))).map((i) => i.id) };
}

/**
 * How many items from the top are exactly what's in the portal, in portal order (typedIds is stored in the order she
 * typed them): a swap inside the typed block ends the match there, so the moved items get flagged.
 */
export function typedPrefix(list: ChoiceList): number {
  let n = 0;
  while (n < list.items.length && list.items[n].id === list.typedIds[n]) n++;
  return n;
}

const itemSchema = z.object({
  id: z.string(), institute: z.string(), slug: z.string(), state: z.string().nullable(), course: z.string(),
  courseSlug: z.string().optional(), quota: z.string(), reachLabel: z.string(), closedEveryRound: z.boolean(),
});
/** An array where each element is validated on its own: bad elements are dropped, the good ones kept. */
const salvage = <T>(schema: z.ZodType<T>) =>
  z.array(z.unknown()).catch([]).transform((xs) => xs.flatMap((x) => {
    const r = schema.safeParse(x);
    return r.success ? [r.data] : [];
  }));
const listSchema = z.object({
  id: z.string(), name: z.string(), items: salvage(itemSchema),
  typedIds: z.array(z.string()).optional().catch(undefined),
  transcribedUpTo: z.number().optional().catch(undefined), // legacy count, migrated below
});
export const choicesSchema = z.object({ lists: salvage(listSchema), activeId: z.string().catch("") });
export const compareSchema = z.array(z.string()).max(MAX_COMPARE);

/**
 * Validates stored choices item by item and list by list, so one bad entry never costs her the rest (the next save
 * would overwrite them). Legacy counts become typed ids. Only a value with no valid list falls back to the default.
 */
export function parseChoices(raw: unknown): ChoicesState {
  const r = choicesSchema.safeParse(raw);
  if (!r.success || !r.data.lists.length) return defaultChoices;
  return {
    activeId: r.data.lists.some((l) => l.id === r.data.activeId) ? r.data.activeId : r.data.lists[0].id,
    lists: r.data.lists.map(({ transcribedUpTo, typedIds, ...l }) => ({ ...l, typedIds: typedIds ?? l.items.slice(0, transcribedUpTo ?? 0).map((i) => i.id) })),
  };
}

/** What a retired college key (RetiredCollegeKey) is now: the API's map, keyed by the old key or "sha256:<hex>" of it. */
export type RenamedCollege = { key: string; slug: string; name: string };
type RenamedOf = (collegeKey: string) => RenamedCollege | undefined;

/** The college key of an option id (types.ts optionId: "key~degree~specialty~quota"). */
export const collegeKeyOf = (id: string) => id.split("~")[0];
/** The option id under the key its college has now; unchanged when the key was not retired. */
export function renameOptionId(id: string, of: RenamedOf): string {
  const r = of(collegeKeyOf(id));
  return r ? r.key + id.slice(collegeKeyOf(id).length) : id;
}

/**
 * Saved choices and compare ids moved off retired college keys (merged colleges, neutral names): ids, links and names
 * follow the college; an option that now appears twice in a list (two merged colleges) is kept once. `renamed`: the
 * distinct saved ids that changed (old ids); `names`: each one as the notice names it ("New name, MD Anaesthesiology
 * (was Old name)"; a compared id: its college's new name).
 */
export function renameSaved(state: ChoicesState, compare: string[], of: RenamedOf) {
  const changed = new Map<string, string>();
  const id = (x: string, label?: string) => {
    const y = renameOptionId(x, of);
    if (y !== x && (label || !changed.has(x))) changed.set(x, label ?? of(collegeKeyOf(x))!.name);
    return y;
  };
  const lists = state.lists.map((l) => {
    const items = l.items.map((i) => {
      const r = of(collegeKeyOf(i.id));
      return r ? { ...i, id: id(i.id, `${r.name}, ${i.course}${i.institute !== r.name ? ` (was ${i.institute})` : ""}`), slug: r.slug, institute: r.name } : i;
    });
    return { ...l, items: items.filter((i, n) => items.findIndex((x) => x.id === i.id) === n), typedIds: [...new Set(l.typedIds.map((x) => id(x)))] };
  });
  return { choices: { ...state, lists }, compare: [...new Set(compare.map((x) => id(x)))], renamed: [...changed.keys()], names: [...changed.values()] };
}
