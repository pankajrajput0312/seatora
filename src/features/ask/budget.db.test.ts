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

  it("counts requests in the last hour and tokens since 00:00 UTC", async () => {
    const row = { model: "m", effort: "low" };
    const a = await startAsk(userId, row, { hourly: 2, daily: 1000 });
    expect(a.ok).toBe(true);
    await finishAsk((a as { id: string }).id, { usage: { input: 600, output: 300, cacheRead: 5000, cacheWrite: 50 }, tools: ["schedule"], rounds: 2, latencyMs: 1234, outcome: "ok" });
    // 950 of 1000 tokens used (cache reads don't count): one more fits, then the hour's 2 requests are spent.
    const b = await startAsk(userId, row, { hourly: 2, daily: 1000 });
    expect(b.ok).toBe(true);
    expect(await startAsk(userId, row, { hourly: 2, daily: 1000 })).toEqual({ ok: false, reason: "hourly" });
    await finishAsk((b as { id: string }).id, { usage: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 }, tools: [], rounds: 1, latencyMs: 1, outcome: "ok" });
    expect(await startAsk(userId, row, { hourly: 10, daily: 1000 })).toEqual({ ok: false, reason: "daily" });
    // An hour later the requests are free again; the next UTC day the tokens too.
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect((await startAsk(userId, row, { hourly: 2, daily: 1_000_000 }, later)).ok).toBe(true);
    const logged = await db.askLog.findUnique({ where: { id: (a as { id: string }).id } });
    expect(logged).toMatchObject({ inputTokens: 600, outputTokens: 300, cacheReadTokens: 5000, cacheWriteTokens: 50, tools: ["schedule"], rounds: 2, latencyMs: 1234, outcome: "ok" });
    expect(Object.keys(logged!)).not.toContain("message");
  });
});
