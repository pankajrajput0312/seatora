import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PREF_KEYS, type PrefKey } from "./prefs";

// Ask Seatora's memory, all scoped to the owner's account: saved chats (AskConversation / AskMessage, 30 days after the
// last activity) and the preferences she asks it to remember (AskPreference). Every read takes the user id: no chat or
// preference is ever read across accounts.

export { PREF_KEYS, prefLabel, type PrefKey } from "./prefs";

export const RETENTION_DAYS = 30;
/**
 * A run saves at least every 2 s while it works: an answer "streaming" with no save for this long lost its run (the
 * function was stopped). With a checkpoint it can be resumed (status checkpoint); without one it shows as partial
 * (failed if empty).
 */
export const STALE_MS = 45_000;
const statusOf = (m: { status: string; updatedAt: Date; content: string; checkpoint?: unknown }) =>
  m.status === "streaming" && Date.now() - m.updatedAt.getTime() > STALE_MS ? (m.checkpoint ? "checkpoint" : m.content.trim() ? "partial" : "error") : m.status;
export type Turn = { role: "user" | "assistant"; content: string };
export type StoredMessage = { id: string; requestId: string; role: "user" | "assistant"; content: string; thinking: string | null; status: string; segment: number; phase: string | null; createdAt: string };

export async function getPreferences(userId: string): Promise<Partial<Record<PrefKey, string>>> {
  const rows = await db.askPreference.findMany({ where: { userId }, orderBy: { key: "asc" } });
  return Object.fromEntries(rows.filter((r) => (PREF_KEYS as readonly string[]).includes(r.key)).map((r) => [r.key, r.value]));
}

/** Saves one preference; an empty value forgets it. */
export async function setPreference(userId: string, key: PrefKey, value: string) {
  const v = value.trim().slice(0, 300);
  if (!v) await db.askPreference.deleteMany({ where: { userId, key } });
  else await db.askPreference.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value: v }, update: { value: v } });
}

const cutoff = () => new Date(Date.now() - RETENTION_DAYS * 86_400_000);

/** Her chats, newest first; chats past the retention are deleted here. */
export async function listConversations(userId: string) {
  await db.askConversation.deleteMany({ where: { userId, updatedAt: { lt: cutoff() } } });
  const rows = await db.askConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, updatedAt: true } });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

export async function getConversation(id: string, userId: string) {
  const c = await db.askConversation.findFirst({ where: { id, userId, updatedAt: { gte: cutoff() } }, include: { messages: { orderBy: [{ createdAt: "asc" }, { role: "desc" }] } } });
  if (!c) return null;
  return {
    id: c.id,
    title: c.title,
    messages: c.messages.map((m): StoredMessage => ({ id: m.id, requestId: m.requestId, role: m.role as StoredMessage["role"], content: m.content, thinking: m.thinking, status: statusOf(m), segment: m.segment, phase: m.phase, createdAt: m.createdAt.toISOString() })),
  };
}

export const deleteConversation = async (id: string, userId: string) => (await db.askConversation.deleteMany({ where: { id, userId } })).count > 0;

/**
 * Starts one turn. A request id seen before in this chat returns that turn's answer (`existing`: done, still streaming,
 * or failed) instead of running again. Otherwise stores her question and an empty answer (status streaming) and returns
 * the chat's earlier turns (failed and stopped-empty turns left out).
 */
export async function startTurn(userId: string, t: { conversationId?: string; requestId: string; question: string }) {
  const conv = t.conversationId
    ? await db.askConversation.findFirst({ where: { id: t.conversationId, userId } })
    : await db.askConversation.create({ data: { userId, title: t.question.replace(/\s+/g, " ").trim().slice(0, 80) } });
  if (!conv) return { ok: false as const };
  const existing = await db.askMessage.findUnique({ where: { conversationId_requestId_role: { conversationId: conv.id, requestId: t.requestId, role: "assistant" } } });
  if (existing) return { ok: true as const, conversationId: conv.id, existing: { id: existing.id, content: existing.content, thinking: existing.thinking, status: statusOf(existing), segment: existing.segment } };
  const before = await db.askMessage.findMany({ where: { conversationId: conv.id }, orderBy: [{ createdAt: "asc" }, { role: "desc" }] });
  try {
    await db.askMessage.create({ data: { conversationId: conv.id, requestId: t.requestId, role: "user", content: t.question } });
  } catch (e) {
    // The same request arriving twice at once: the second finds the first's turn.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return startTurn(userId, { ...t, conversationId: conv.id });
    throw e;
  }
  const answer = await db.askMessage.create({ data: { conversationId: conv.id, requestId: t.requestId, role: "assistant", status: "streaming" } });
  await db.askConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  return { ok: true as const, conversationId: conv.id, answerId: answer.id, history: historyOf(before.map((m) => ({ ...m, status: statusOf(m) }))) };
}

/** Earlier turns for the model: a question whose answer failed (or was stopped empty) is left out with its answer. */
export function historyOf(msgs: { requestId: string; role: string; content: string; status: string }[]): Turn[] {
  const answered = new Set(msgs.filter((m) => m.role === "assistant" && m.content.trim() && ["done", "partial", "stopped", "checkpoint"].includes(m.status)).map((m) => m.requestId));
  return msgs.filter((m) => answered.has(m.requestId) && m.content.trim()).map((m) => ({ role: m.role as Turn["role"], content: m.content }));
}

/** Saves the answer so far while it streams; false once she stopped it (the row is no longer streaming). */
export async function saveProgress(answerId: string, p: { content: string; thinking: string | null; phase: string | null }) {
  return (await db.askMessage.updateMany({ where: { id: answerId, status: "streaming" }, data: p })).count > 0;
}

/** Saves where the run stands after a finished round (and the text shown by then). */
export async function saveCheckpoint(answerId: string, checkpoint: unknown, content: string) {
  await db.askMessage.updateMany({ where: { id: answerId, status: "streaming" }, data: { checkpoint: checkpoint as Prisma.InputJsonValue, content } });
}

export async function finishTurn(answerId: string, r: { content: string; thinking: string | null; status: "done" | "partial" | "error" | "stopped" | "checkpoint" }) {
  // A stopped turn keeps "stopped" and its text so far. A finished turn drops its checkpoint (it can be large).
  await db.askMessage.updateMany({ where: { id: answerId, status: "streaming" }, data: { ...r, phase: null, ...(r.status !== "checkpoint" && { checkpoint: Prisma.DbNull }) } });
}

/**
 * Claims run `segment` of a turn: only when the answer waits at a checkpoint (or its run died: no save for STALE_MS),
 * and its last run was `segment - 1`. A repeated or racing continue gets null and just reads the turn.
 */
export async function claimRun(userId: string, conversationId: string, requestId: string, segment: number) {
  const conv = await db.askConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
  if (!conv) return null;
  const stale = new Date(Date.now() - STALE_MS);
  const where = {
    conversationId, requestId, role: "assistant", segment: segment - 1, checkpoint: { not: Prisma.DbNull },
    OR: [{ status: "checkpoint" }, { status: "streaming", updatedAt: { lt: stale } }],
  };
  const row = await db.askMessage.findFirst({ where });
  if (!row) return null;
  const won = await db.askMessage.updateMany({ where: { ...where, id: row.id }, data: { status: "streaming", segment } });
  if (!won.count) return null;
  const turn = await db.askMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "asc" }, { role: "desc" }] });
  const mine = turn.findIndex((m) => m.id === row.id);
  return { answerId: row.id, content: row.content, thinking: row.thinking, checkpoint: row.checkpoint, startedAt: row.createdAt, question: turn[mine - 1]?.content ?? "", history: historyOf(turn.slice(0, Math.max(0, mine - 1)).map((m) => ({ ...m, status: statusOf(m) }))) };
}

/** A turn's state now (a continue that lost the claim, or a replay). */
export async function turnState(conversationId: string, requestId: string) {
  const m = await db.askMessage.findUnique({ where: { conversationId_requestId_role: { conversationId, requestId, role: "assistant" } } });
  return m && { content: m.content, thinking: m.thinking, status: statusOf(m), segment: m.segment, phase: m.phase };
}

/** Stop pressed: marks the answer stopped; the running turn sees it at its next save and ends. */
export async function stopTurn(conversationId: string, requestId: string, userId: string) {
  const conv = await db.askConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
  if (!conv) return false;
  return (await db.askMessage.updateMany({ where: { conversationId, requestId, role: "assistant", status: { in: ["streaming", "checkpoint"] } }, data: { status: "stopped", phase: null, checkpoint: Prisma.DbNull } })).count > 0;
}
