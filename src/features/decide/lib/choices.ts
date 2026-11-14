// Pure choice-list logic (tested). Items are snapshots so a list renders without refetching.

export type ChoiceItem = {
  id: string; // option id
  institute: string;
  slug: string;
  state: string | null;
  course: string; // e.g. "DNB Anaesthesiology"
  quota: string;
  reachLabel: string;
  closedEveryRound: boolean;
};
export type ChoiceList = { id: string; name: string; items: ChoiceItem[]; transcribedUpTo: number };
export type ChoicesState = { lists: ChoiceList[]; activeId: string };

export const CHOICES_KEY = "medpath.choices";
export const COMPARE_KEY = "medpath.compare";
export const MAX_COMPARE = 4;

export const defaultChoices: ChoicesState = {
  lists: [{ id: "r2-2026", name: "Round 2 · 2026", items: [], transcribedUpTo: 0 }],
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

/** Copies a list as the next round's list, e.g. "Round 2 · 2026" → "Round 3 · 2026". */
export function duplicateList(state: ChoicesState, sourceId: string): ChoicesState {
  const src = state.lists.find((l) => l.id === sourceId);
  if (!src) return state;
  const name = src.name.replace(/Round (\d+)/, (_, n) => `Round ${Number(n) + 1}`);
  const id = `${sourceId}-copy-${state.lists.length}`;
  return { lists: [...state.lists, { ...src, id, name: name === src.name ? `${src.name} (copy)` : name, transcribedUpTo: 0 }], activeId: id };
}

/** Text in the order to type into the MCC portal. */
export function toMccText(list: ChoiceList): string {
  return list.items.map((i, n) => `${n + 1}. ${i.institute} — ${i.course} — ${i.quota}`).join("\n");
}

export function toCsv(list: ChoiceList): string {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  return ["Order,Institute,State,Course,Quota", ...list.items.map((i, n) => [n + 1, esc(i.institute), esc(i.state), esc(i.course), esc(i.quota)].join(","))].join("\n");
}
