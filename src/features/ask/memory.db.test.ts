import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Ask memory on a real database (local DATABASE_URL exported; skipped otherwise): idempotent turns, checkpoint claims,
// stale runs, history, preferences, 30-day retention, and that nothing is read across accounts.
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("Ask memory", async () => {
  const { db } = await import("@/lib/db");
  const mem = await import("./memory");
  let a = "";
  let b = "";
  beforeAll(async () => {
    a = (await db.user.create({ data: { email: `ask-mem-a-${Date.now()}@seatora.test`, name: "A", passwordHash: "x" } })).id;
    b = (await db.user.create({ data: { email: `ask-mem-b-${Date.now()}@seatora.test`, name: "B", passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("a turn runs once per request id; history leaves out failed turns", async () => {
    const t1 = await mem.startTurn(a, { requestId: "req-aaaaaaa1", question: "What can I get?" });
    if (!t1.ok || !("answerId" in t1)) throw new Error("no turn");
    const again = await mem.startTurn(a, { conversationId: t1.conversationId, requestId: "req-aaaaaaa1", question: "What can I get?" });
    expect(again).toMatchObject({ ok: true, existing: { status: "streaming" } });
    await mem.finishTurn(t1.answerId!, { content: "Likely: 3 options.", thinking: null, status: "done" });
    const t2 = await mem.startTurn(a, { conversationId: t1.conversationId, requestId: "req-aaaaaaa2", question: "And DNB?" });
    await mem.finishTurn((t2 as { answerId: string }).answerId, { content: "Something went wrong.", thinking: null, status: "error" });
    const t3 = await mem.startTurn(a, { conversationId: t1.conversationId, requestId: "req-aaaaaaa3", question: "Fees?" });
    expect((t3 as { history: unknown[] }).history).toEqual([{ role: "user", content: "What can I get?" }, { role: "assistant", content: "Likely: 3 options." }]);
    // Another account can't read, continue or stop it.
    expect(await mem.getConversation(t1.conversationId, b)).toBeNull();
    expect(await mem.startTurn(b, { conversationId: t1.conversationId, requestId: "req-bbbbbbb1", question: "x" })).toEqual({ ok: false });
    expect(await mem.stopTurn(t1.conversationId, "req-aaaaaaa3", b)).toBe(false);
    expect((await mem.listConversations(b)).length).toBe(0);
  });

  it("a checkpoint is claimed once per segment; a dead run (no save for 45 s) can be resumed", async () => {
    const t = await mem.startTurn(a, { requestId: "req-ccccccc1", question: "Make my list" });
    const { conversationId, answerId } = t as { conversationId: string; answerId: string };
    await mem.saveCheckpoint(answerId, { messages: [{ role: "user", content: "Make my list" }], shownLen: 0 }, "| 1 |");
    await mem.finishTurn(answerId, { content: "| 1 |", thinking: null, status: "checkpoint" });
    expect(await mem.claimRun(a, conversationId, "req-ccccccc1", 2)).toBeNull(); // wrong segment
    const won = await mem.claimRun(a, conversationId, "req-ccccccc1", 1);
    expect(won).toMatchObject({ answerId, content: "| 1 |", question: "Make my list" });
    expect(await mem.claimRun(a, conversationId, "req-ccccccc1", 1)).toBeNull(); // a repeat
    expect(await mem.turnState(conversationId, "req-ccccccc1")).toMatchObject({ status: "streaming", segment: 1 });
    // The run dies (no save since): after 45 s it reads as resumable and the next segment can claim it.
    await db.askMessage.update({ where: { id: answerId }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    expect(await mem.turnState(conversationId, "req-ccccccc1")).toMatchObject({ status: "checkpoint" });
    expect(await mem.claimRun(a, conversationId, "req-ccccccc1", 2)).toMatchObject({ answerId });
    // Stop wins over a later save.
    expect(await mem.stopTurn(conversationId, "req-ccccccc1", a)).toBe(true);
    expect(await mem.saveProgress(answerId, { content: "more", thinking: null, phase: null })).toBe(false);
  });

  it("preferences save, show and forget; chats older than 30 days go", async () => {
    await mem.setPreference(a, "budget", " ₹10 L a year ");
    await mem.setPreference(a, "home_state", "Maharashtra");
    expect(await mem.getPreferences(a)).toEqual({ budget: "₹10 L a year", home_state: "Maharashtra" });
    await mem.setPreference(a, "budget", "");
    expect(await mem.getPreferences(a)).toEqual({ home_state: "Maharashtra" });
    expect(await mem.getPreferences(b)).toEqual({});
    const old = await db.askConversation.create({ data: { userId: a, title: "old" } });
    await db.$executeRaw`UPDATE "AskConversation" SET "updatedAt" = now() - interval '31 days' WHERE id = ${old.id}`;
    const list = await mem.listConversations(a);
    expect(list.map((c) => c.title)).not.toContain("old");
    expect(await db.askConversation.findUnique({ where: { id: old.id } })).toBeNull();
  });
});
