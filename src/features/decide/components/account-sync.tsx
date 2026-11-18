"use client";

import { useEffect, useRef } from "react";
import { loadSynced, saveSynced, type Synced, type SyncKind } from "@/app/decide/sync-actions";
import { scopedKey, type ExamKey } from "@/features/exams/keys";
import { fingerprint, hasChoices, mergeChoices, reconcile } from "../lib/account-sync";
import { CHOICES_KEY, defaultChoices, parseChoices } from "../lib/choices";
import { useLocal, writeLocal } from "../lib/local-store";
import { useExam } from "../lib/use-decide-store";
import { PROFILE_KEY, profileSchema } from "../profile";

// Signed in, the profile and choice lists follow the account (sync-actions.ts): loaded when Decide opens and when the
// tab comes back into view, saved a second after each change. Signed out, nothing leaves localStorage. The exam shown's
// (useExam): NEET PG's keys and sync meta as before, another exam's under its own (exams/keys.ts scopedKey).

/** Per kind: the account it last synced with, the server copy's time then, the value's fingerprint then, the last local edit. */
type Meta = { uid?: string; seen?: number | null; synced?: string; at?: number };
const META_KEY = "medpath.sync";
const DEBOUNCE_MS = 1000;

const kindsOf = (exam: ExamKey) => ({
  // A stored value as data to sync: null when there is nothing worth keeping (no valid profile, no choice).
  profile: { key: scopedKey(PROFILE_KEY, exam), fallback: null as unknown, value: (raw: unknown) => (profileSchema.safeParse(raw).success ? raw : null), merge: (newer: unknown) => newer, empty: null },
  choices: {
    key: scopedKey(CHOICES_KEY, exam),
    fallback: defaultChoices as unknown,
    value: (raw: unknown) => (hasChoices(parseChoices(raw)) ? raw : null),
    merge: (newer: unknown, older: unknown) => mergeChoices(parseChoices(newer), parseChoices(older)),
    empty: defaultChoices,
  },
});

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
// Per kind and exam: "profile", "choices" (NEET PG, as before), "profile.neet-mds"…
const readMetaOf = (kind: string): Meta => readJson<Partial<Record<string, Meta>>>(META_KEY, {})[kind] ?? {};
function writeMetaOf(kind: string, m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readJson(META_KEY, {}), [kind]: { ...readMetaOf(kind), ...m } }));
  } catch {}
}

export function AccountSync() {
  const exam = useExam();
  const kinds = kindsOf(exam);
  const [profileRaw, , h1] = useLocal<unknown>(kinds.profile.key, null);
  const [choicesRaw, , h2] = useLocal<unknown>(kinds.choices.key, defaultChoices);
  const uid = useRef<string | null>(null);
  // The fingerprint last seen of each kind, so writes made here (sync's own) aren't taken for her edits.
  const observed = useRef<Partial<Record<SyncKind, string>>>({});
  const timers = useRef<Partial<Record<SyncKind, ReturnType<typeof setTimeout>>>>({});
  /** Set once signed-in state is known: queues a save after a local edit. */
  const edited = useRef<(kind: SyncKind) => void>(() => {});

  useEffect(() => {
    if (!h1 || !h2) return;
    let alive = true;
    const kinds = kindsOf(exam);
    const readMeta = (kind: SyncKind) => readMetaOf(scopedKey(kind, exam));
    const writeMeta = (kind: SyncKind, m: Meta) => writeMetaOf(scopedKey(kind, exam), m);

    const keep = (kind: SyncKind, value: unknown) => {
      const stored = value ?? kinds[kind].empty;
      observed.current[kind] = fingerprint(stored);
      writeMeta(kind, { synced: fingerprint(stored) });
      writeLocal(kinds[kind].key, stored);
    };

    async function push(kind: SyncKind, depth = 0): Promise<void> {
      const value = kinds[kind].value(readJson(kinds[kind].key, kinds[kind].fallback));
      if (value == null || !uid.current) return;
      const r = await saveSynced(kind, value, readMeta(kind).seen ?? null, exam);
      if (!r || !alive) return;
      if (r.ok) {
        // Saved what was read; an edit since then stays unsynced (fingerprints differ) and has its own push queued.
        writeMeta(kind, { uid: uid.current, seen: r.at, synced: fingerprint(value) });
      } else if (depth < 3) await settle(kind, r.server, depth + 1);
    }

    async function settle(kind: SyncKind, server: Synced | null, depth = 0) {
      const k = kinds[kind];
      const m = readMeta(kind);
      const foreign = !!m.uid && m.uid !== uid.current; // another account's data on this device: not hers to upload
      const raw = readJson(k.key, k.fallback);
      const local = foreign ? null : k.value(raw);
      const serverValue = server && k.value(server.value);
      const r = reconcile(
        { local, dirty: local != null && fingerprint(raw) !== m.synced, localAt: m.at ?? 0, seen: m.seen ?? null, server: server && serverValue != null ? { value: serverValue, at: server.at } : null },
        k.merge,
      );
      writeMeta(kind, { uid: uid.current!, seen: server?.at ?? null });
      if (fingerprint(r.value ?? k.empty) !== fingerprint(raw)) keep(kind, r.value);
      else writeMeta(kind, { synced: fingerprint(raw) });
      if (r.upload) await push(kind, depth);
    }

    async function sync() {
      const s = await loadSynced(exam).catch(() => null);
      if (!alive) return;
      uid.current = s?.uid ?? null;
      if (!s) return;
      for (const kind of ["profile", "choices"] as const) await settle(kind, s[kind]).catch((e) => console.error("[sync]", e));
    }

    void sync();
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    // Each local edit: note when, and save it a second later when signed in.
    edited.current = (kind: SyncKind) => {
      clearTimeout(timers.current[kind]);
      if (uid.current) timers.current[kind] = setTimeout(() => void push(kind).catch((e) => console.error("[sync]", e)), DEBOUNCE_MS);
    };
    const pending = timers.current;
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      Object.values(pending).forEach(clearTimeout);
    };
  }, [h1, h2, exam]);

  useEffect(() => {
    if (!h1 || !h2) return;
    for (const [kind, raw] of [["profile", profileRaw], ["choices", choicesRaw]] as const) {
      const f = fingerprint(raw);
      const first = observed.current[kind] === undefined;
      if (observed.current[kind] === f) continue;
      observed.current[kind] = f;
      if (first) continue; // as loaded: settle() decides
      writeMetaOf(scopedKey(kind, exam), { at: Date.now() });
      edited.current(kind);
    }
  }, [profileRaw, choicesRaw, h1, h2, exam]);

  return null;
}
