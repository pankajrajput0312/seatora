import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The per-owner limits on a real database (local DATABASE_URL exported; skipped otherwise, as the other *.db tests).
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("AskLog limits", async () => {
  const { db } = await import("@/lib/db");
  const { finishAsk, startAsk } = await import("./budget");
  const email = `ask-budget-${Date.now()}@seatora.test`;
  let userId = "";
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email, name: "Budget test", passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await db.user.delete({ where: { id: userId } }); // logs cascade
  });

  it("counts her questions in the last hour (not continue runs) and tokens since 00:00 UTC", async () => {
    const row = { model: "m", effort: "low" };
    const conv = await db.askConversation.create({ data: { userId, title: "t" } });
    const ask = (n: number) => db.askMessage.create({ data: { conversationId: conv.id, requestId: `req-budget-${n}`, role: "user", content: "q" } });
    await ask(1);
    const a = await startAsk(userId, row, { hourly: 2, daily: 1000 });
    expect(a.ok).toBe(true);
    await finishAsk((a as { id: string }).id, { usage: { input: 600, output: 300, cacheRead: 5000, cacheWrite: 50 }, tools: ["schedule"], rounds: 2, latencyMs: 1234, outcome: "ok" });
    // Continue runs of the same answer: logged, never counted as questions.
    for (let i = 0; i < 3; i++) expect((await startAsk(userId, row, { hourly: 2, daily: 1_000_000 })).ok).toBe(true);
    await ask(2);
    const b = await startAsk(userId, row, { hourly: 2, daily: 1000 }); // 950 of 1000 tokens: fits; the 2nd question of 2
    expect(b.ok).toBe(true);
    await ask(3);
    expect(await startAsk(userId, row, { hourly: 2, daily: 1_000_000 })).toEqual({ ok: false, reason: "hourly" });
    await finishAsk((b as { id: string }).id, { usage: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 }, tools: [], rounds: 1, latencyMs: 1, outcome: "ok" });
    expect(await startAsk(userId, row, { hourly: 10, daily: 1000 })).toEqual({ ok: false, reason: "daily" });
    // An hour later the questions are free again.
    expect((await startAsk(userId, row, { hourly: 2, daily: 1_000_000 }, new Date(Date.now() + 2 * 3_600_000))).ok).toBe(true);
    const logged = await db.askLog.findUnique({ where: { id: (a as { id: string }).id } });
    expect(logged).toMatchObject({ inputTokens: 600, outputTokens: 300, cacheReadTokens: 5000, cacheWriteTokens: 50, tools: ["schedule"], rounds: 2, latencyMs: 1234, outcome: "ok" });
  });
});
