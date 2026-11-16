// Pure choice-list logic (tested). Items are snapshots so a list renders without refetching.
import { z } from "zod";

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

/** The PIN in the item's college key (types.ts optionId: "NAME…#PIN~degree~specialty~quota"); null when the key has none. */
export const pinOf = (i: Pick<ChoiceItem, "id">) => /#(\d{6})~/.exec(i.id)?.[1] ?? null;

/** Text in the order to type into the MCC portal: institute, state and PIN (two colleges can share a name), course, MCC quota. */
export function toMccText(list: ChoiceList): string {
  return list.items.map((i, n) => `${n + 1}. ${[i.institute, [i.state, pinOf(i)].filter(Boolean).join(" ")].filter(Boolean).join(", ")} — ${i.course} — ${i.quota}`).join("\n");
}

export function toCsv(list: ChoiceList): string {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  return ["Order,Institute,State,PIN,Course,Quota", ...list.items.map((i, n) => [n + 1, esc(i.institute), esc(i.state), esc(pinOf(i)), esc(i.course), esc(i.quota)].join(","))].join("\n");
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
 * distinct saved ids that changed (old ids).
 */
export function renameSaved(state: ChoicesState, compare: string[], of: RenamedOf) {
  const changed = new Set<string>();
  const id = (x: string) => {
    const y = renameOptionId(x, of);
    if (y !== x) changed.add(x);
    return y;
  };
  const lists = state.lists.map((l) => {
    const items = l.items.map((i) => {
      const r = of(collegeKeyOf(i.id));
      return r ? { ...i, id: id(i.id), slug: r.slug, institute: r.name } : i;
    });
    return { ...l, items: items.filter((i, n) => items.findIndex((x) => x.id === i.id) === n), typedIds: [...new Set(l.typedIds.map(id))] };
  });
  return { choices: { ...state, lists }, compare: [...new Set(compare.map(id))], renamed: [...changed] };
}
