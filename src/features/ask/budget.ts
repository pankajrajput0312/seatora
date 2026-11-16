import "server-only";
import { db } from "@/lib/db";

// Per-owner limits and the usage log (AskLog), in Postgres so every serverless instance counts the same. A row is written
// when a question starts (the hourly limit counts it) and finished with its usage. Never message text or names.

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type Outcome = "ok" | "partial" | "refusal" | "max_tokens" | "max_rounds" | "timeout" | "stopped" | "aborted" | "rate_limited" | "error";
export const zeroUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Starts one run if the account is within its limits: `limits.hourly` questions asked in the last hour (her saved
 * questions, this one included; the runs that continue an answer don't count), `limits.daily` tokens (input + output +
 * cache writes, every run) since 00:00 UTC. Returns the log row's id, or why not.
 * ponytail: count-then-insert can let two simultaneous requests past the last slot; fine for one owner, use a locked counter row if this opens up.
 */
export async function startAsk(userId: string, row: { model: string; effort: string }, limits: { hourly: number; daily: number }, now = new Date()) {
  const [hour, day] = await Promise.all([
    db.askMessage.count({ where: { role: "user", createdAt: { gte: new Date(now.getTime() - 3_600_000) }, conversation: { userId } } }),
    db.askLog.aggregate({ where: { userId, createdAt: { gte: utcDay(now) } }, _sum: { inputTokens: true, outputTokens: true, cacheWriteTokens: true } }),
  ]);
  if (hour > limits.hourly) return { ok: false as const, reason: "hourly" as const };
  const used = (day._sum.inputTokens ?? 0) + (day._sum.outputTokens ?? 0) + (day._sum.cacheWriteTokens ?? 0);
  if (used >= limits.daily) return { ok: false as const, reason: "daily" as const };
  const { id } = await db.askLog.create({ data: { userId, model: row.model, effort: row.effort, tools: [] }, select: { id: true } });
  return { ok: true as const, id };
}

export async function finishAsk(
  id: string,
  r: { usage: Usage; tools: string[]; rounds: number; latencyMs: number; outcome: Outcome; conversationId?: string; check?: { passed: number; failed: number } | null; corrected?: boolean; timing?: Record<string, number | null> },
) {
  await db.askLog.update({
    where: { id },
    data: {
      inputTokens: r.usage.input, outputTokens: r.usage.output, cacheReadTokens: r.usage.cacheRead, cacheWriteTokens: r.usage.cacheWrite, tools: r.tools, rounds: r.rounds,
      latencyMs: r.latencyMs, outcome: r.outcome, conversationId: r.conversationId, checkPassed: r.check?.passed ?? 0, checkFailed: r.check?.failed ?? 0, corrected: r.corrected ?? false, timing: r.timing,
    },
  });
}
