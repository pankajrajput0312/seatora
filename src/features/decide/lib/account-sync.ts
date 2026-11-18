// Pure rules for syncing the profile and choice lists with the account (components/account-sync.tsx, tested).
import { DEFAULT_EXAM, examKeys, type ExamKey } from "@/features/exams/keys";
import type { ChoicesState } from "./choices";

/**
 * The account's json (UserProfile, UserChoices) holds NEET PG's value at its top level, exactly as before exams; another
 * exam's (staff only) under its exam key ("neet-mds": {...}). examPart reads one exam's, withExamPart writes one and keeps
 * the others. NEET PG with no other exam saved: the value itself, unchanged.
 */
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const others = (json: unknown) => (isObject(json) ? Object.fromEntries(examKeys.filter((k) => k !== DEFAULT_EXAM && k in json).map((k) => [k, json[k]])) : {});
export function examPart(json: unknown, exam: ExamKey): unknown {
  if (exam !== DEFAULT_EXAM) return isObject(json) ? (json[exam] ?? null) : null;
  if (!isObject(json) || !Object.keys(others(json)).length) return json;
  return Object.fromEntries(Object.entries(json).filter(([k]) => !(examKeys as readonly string[]).includes(k)));
}
export const withExamPart = (json: unknown, exam: ExamKey, value: object): Record<string, unknown> =>
  exam === DEFAULT_EXAM ? { ...value, ...others(json) } : { ...(isObject(json) ? json : {}), [exam]: value };

/** The newer copy wins; every list and choice only in the older one is kept, appended, so a choice is never lost. */
export function mergeChoices(newer: ChoicesState, older: ChoicesState): ChoicesState {
  const lists = newer.lists.map((l) => {
    const o = older.lists.find((x) => x.id === l.id);
    const ids = new Set(l.items.map((i) => i.id));
    return o ? { ...l, items: [...l.items, ...o.items.filter((i) => !ids.has(i.id))] } : l;
  });
  return { ...newer, lists: [...lists, ...older.lists.filter((o) => o.items.length && !newer.lists.some((l) => l.id === o.id))] };
}

export const hasChoices = (s: ChoicesState) => s.lists.some((l) => l.items.length > 0);

/** A short fingerprint of a stored value (its JSON), to tell whether it changed since the last sync. */
export function fingerprint(value: unknown): string {
  const s = JSON.stringify(value) ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/**
 * What this device should do with one kind of data. `local`: its value here, null when empty (or another account's);
 * `dirty`: changed here since the last sync; `localAt`: when (ms; 0 unknown); `seen`: the server copy's time at the last
 * sync; `server`: the account's copy now. Result: the value to keep here and whether to upload it.
 *   no server copy: upload what's here; nothing here: take the server's; server unchanged since the last sync: upload
 *   if changed here; server changed and nothing changed here: take it; both changed: the newer wins, merged.
 */
export function reconcile<T>(
  o: { local: T | null; dirty: boolean; localAt: number; seen: number | null; server: { value: T; at: number } | null },
  merge: (newer: T, older: T) => T,
): { value: T | null; upload: boolean } {
  const { local, server } = o;
  if (!server) return { value: local, upload: local != null };
  if (local == null || !o.dirty) return { value: server.value, upload: false };
  if (server.at === o.seen) return { value: local, upload: true };
  return { value: o.localAt > server.at ? merge(local, server.value) : merge(server.value, local), upload: true };
}
