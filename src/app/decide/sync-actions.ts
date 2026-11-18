"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/lib/session";
import { examPart, withExamPart } from "@/features/decide/lib/account-sync";
import { choicesSchema, parseChoices } from "@/features/decide/lib/choices";
import { profileSchema } from "@/features/decide/profile";
import { DEFAULT_EXAM, examKeys, type ExamKey } from "@/features/exams/keys";
import { planCap } from "@/features/plans/usage";
import { db } from "@/lib/db";

// The profile and choice lists of the signed-in account (components/account-sync.tsx). Signed out: null, and the
// browser keeps them in localStorage only. One exam's (default NEET PG, stored as before); another exam's only for staff
// (OWNER, ADMIN), under its key in the same row (lib/account-sync.ts examPart).

/** Generous: a list of 500 choices is about 150 KB. */
const MAX_JSON = 400_000;
const kindSchema = z.enum(["profile", "choices"]);
export type SyncKind = z.infer<typeof kindSchema>;
export type Synced = { value: unknown; at: number };

// Both tables have the same columns (userId, json, updatedAt).
const table = (kind: SyncKind) => (kind === "profile" ? db.userProfile : (db.userChoices as unknown as typeof db.userProfile));
const row = (kind: SyncKind, userId: string) => table(kind).findUnique({ where: { userId } });
const read = async (kind: SyncKind, userId: string, exam: ExamKey): Promise<Synced | null> => {
  const r = await row(kind, userId);
  return r && { value: examPart(r.json, exam), at: r.updatedAt.getTime() };
};
const staff = (u: { role: string }) => u.role === "OWNER" || u.role === "ADMIN";
/** The exam asked for: NEET PG unless named; another exam only for staff (null: not hers to read or write). */
const examOf = (asked: unknown, user: { role: string }): ExamKey | null => {
  const e = z.enum(examKeys).safeParse(asked ?? DEFAULT_EXAM);
  return !e.success ? null : e.data === DEFAULT_EXAM || staff(user) ? e.data : null;
};

/** The account's copies of one exam's; null when signed out. */
export async function loadSynced(exam?: ExamKey): Promise<{ uid: string; profile: Synced | null; choices: Synced | null } | null> {
  const user = await getCurrentUser();
  const ex = user && examOf(exam, user);
  if (!user || !ex) return null;
  const [profile, choices] = await Promise.all([read("profile", user.id, ex), read("choices", user.id, ex)]);
  return { uid: user.id, profile, choices };
}

/**
 * Saves one copy if the account's is still the one this device last saw (`base`: its time; null = none yet). Otherwise
 * `{ ok: false, server }`, so the device merges and saves again instead of overwriting another device's changes.
 * Null when signed out or the value is invalid or too large.
 */
export async function saveSynced(kind: SyncKind, value: unknown, base: number | null, exam?: ExamKey): Promise<{ ok: true; at: number } | { ok: false; server: Synced | null } | null> {
  const k = kindSchema.safeParse(kind);
  const b = z.number().int().nonnegative().nullable().safeParse(base);
  if (!k.success || !b.success || (JSON.stringify(value) ?? "").length > MAX_JSON) return null;
  const parsed = k.data === "profile" ? profileSchema.safeParse(value) : choicesSchema.safeParse(value);
  if (!parsed.success) return null;
  let json = (k.data === "profile" ? parsed.data : parseChoices(value)) as Prisma.InputJsonValue;
  const user = await getCurrentUser();
  const ex = user && examOf(exam, user);
  if (!user || !ex) return null;
  // The plan's saved lists (features/plans): more lists than the plan gives and than the account already holds are not
  // saved (the Choices page offers no "Duplicate" past the cap; lists kept from a bigger plan stay editable).
  if (k.data === "choices") {
    const lists = parseChoices(value).lists.length;
    if (lists > (await planCap("choiceLists"))) {
      const saved = await read("choices", user.id, ex);
      if (lists > (saved?.value != null ? parseChoices(saved.value).lists.length : 1)) return null;
    }
  }
  const t = table(k.data);
  // Staff may hold other exams' copies in the row: written into it, the others kept (updateMany below still checks `base`).
  if (staff(user)) {
    const r = await row(k.data, user.id);
    if (r && b.data == null) return { ok: false, server: await read(k.data, user.id, ex) };
    if (r || ex !== DEFAULT_EXAM) json = withExamPart(r?.json, ex, json as object) as Prisma.InputJsonValue;
  }
  const now = new Date();
  try {
    if (b.data == null) await t.create({ data: { userId: user.id, json, updatedAt: now } });
    else if (!(await t.updateMany({ where: { userId: user.id, updatedAt: new Date(b.data) }, data: { json, updatedAt: now } })).count) return { ok: false, server: await read(k.data, user.id, ex) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, server: await read(k.data, user.id, ex) };
    throw e;
  }
  return { ok: true, at: now.getTime() };
}
