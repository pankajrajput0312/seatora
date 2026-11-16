"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/lib/session";
import { choicesSchema, parseChoices } from "@/features/decide/lib/choices";
import { profileSchema } from "@/features/decide/profile";
import { planCap } from "@/features/plans/usage";
import { db } from "@/lib/db";

// The profile and choice lists of the signed-in account (components/account-sync.tsx). Signed out: null, and the
// browser keeps them in localStorage only.

/** Generous: a list of 500 choices is about 150 KB. */
const MAX_JSON = 400_000;
const kindSchema = z.enum(["profile", "choices"]);
export type SyncKind = z.infer<typeof kindSchema>;
export type Synced = { value: unknown; at: number };

// Both tables have the same columns (userId, json, updatedAt).
const table = (kind: SyncKind) => (kind === "profile" ? db.userProfile : (db.userChoices as unknown as typeof db.userProfile));
const read = async (kind: SyncKind, userId: string): Promise<Synced | null> => {
  const r = await table(kind).findUnique({ where: { userId } });
  return r && { value: r.json, at: r.updatedAt.getTime() };
};

/** The account's copies; null when signed out. */
export async function loadSynced(): Promise<{ uid: string; profile: Synced | null; choices: Synced | null } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [profile, choices] = await Promise.all([read("profile", user.id), read("choices", user.id)]);
  return { uid: user.id, profile, choices };
}

/**
 * Saves one copy if the account's is still the one this device last saw (`base`: its time; null = none yet). Otherwise
 * `{ ok: false, server }`, so the device merges and saves again instead of overwriting another device's changes.
 * Null when signed out or the value is invalid or too large.
 */
export async function saveSynced(kind: SyncKind, value: unknown, base: number | null): Promise<{ ok: true; at: number } | { ok: false; server: Synced | null } | null> {
  const k = kindSchema.safeParse(kind);
  const b = z.number().int().nonnegative().nullable().safeParse(base);
  if (!k.success || !b.success || (JSON.stringify(value) ?? "").length > MAX_JSON) return null;
  const parsed = k.data === "profile" ? profileSchema.safeParse(value) : choicesSchema.safeParse(value);
  if (!parsed.success) return null;
  const json = (k.data === "profile" ? parsed.data : parseChoices(value)) as Prisma.InputJsonValue;
  const user = await getCurrentUser();
  if (!user) return null;
  // The plan's saved lists (features/plans): more lists than the plan gives and than the account already holds are not
  // saved (the Choices page offers no "Duplicate" past the cap; lists kept from a bigger plan stay editable).
  if (k.data === "choices") {
    const lists = parseChoices(value).lists.length;
    if (lists > (await planCap("choiceLists"))) {
      const saved = await read("choices", user.id);
      if (lists > (saved ? parseChoices(saved.value).lists.length : 1)) return null;
    }
  }
  const now = new Date();
  const t = table(k.data);
  try {
    if (b.data == null) await t.create({ data: { userId: user.id, json, updatedAt: now } });
    else if (!(await t.updateMany({ where: { userId: user.id, updatedAt: new Date(b.data) }, data: { json, updatedAt: now } })).count) return { ok: false, server: await read(k.data, user.id) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, server: await read(k.data, user.id) };
    throw e;
  }
  return { ok: true, at: now.getTime() };
}
