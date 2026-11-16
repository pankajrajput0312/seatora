import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSse } from "@/features/ask/sse";

// The chat route with the owner check, the Ask tables and the Bedrock client mocked: gating, request checks, SSE framing
// (meta first, exactly one done or error last), tool rounds, the answer check's rewrite, throttling retries, time slices
// with checkpoint → continue, stall, refusal, replay of a repeated request, and that a dropped connection or Stop are
// told apart.

const m = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; name: string; role: "OWNER"; premiumUntil: null },
  start: vi.fn(), finish: vi.fn(), stream: vi.fn(), plan: vi.fn(async () => ({ allowed: true, used: 1, limit: 50, resetAt: new Date() })),
  startTurn: vi.fn(), claimRun: vi.fn(), finishTurn: vi.fn(), saveProgress: vi.fn(), saveCheckpoint: vi.fn(), turnState: vi.fn(),
}));
vi.mock("@/features/ask/access", () => ({ askUser: async () => m.user }));
vi.mock("@/features/ask/budget", async (orig) => ({ ...(await orig<object>()), startAsk: m.start, finishAsk: m.finish }));
vi.mock("@/features/plans/usage", () => ({ checkAndCount: m.plan }));
vi.mock("@/features/ask/client", () => ({ askClient: () => ({ messages: { stream: m.stream } }) }));
vi.mock("@/features/ask/memory", async (orig) => ({
  ...(await orig<object>()),
  startTurn: m.startTurn, claimRun: m.claimRun, finishTurn: m.finishTurn, saveProgress: m.saveProgress, saveCheckpoint: m.saveCheckpoint, turnState: m.turnState,
  getPreferences: async () => ({ budget: "₹10 L a year" }),
}));
vi.mock("@/features/decide/service", async (orig) => ({ ...(await orig<object>()), getDecideData: async () => ({ colleges: [{ slug: "jss-medical-college-570015" }], courses: [], sources: [] }) }));

const { POST, GET } = await import("./route");

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 };
const message = (content: unknown[], stop_reason: string) => ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason, stop_details: null, usage });
const text = (t: string) => message([{ type: "text", text: t }], "end_turn");

/** A fake MessageStream: emits `texts` then resolves `msg`; with `hang`, waits until the call is aborted. */
function fake(texts: string[], msg: unknown, hang = false, thinking: string[] = []) {
  return (_params: unknown, opts: { signal: AbortSignal }) => {
    const on: Record<string, (t: string) => void> = {};
    return {
      on(ev: string, cb: (t: string) => void) {
        on[ev] = cb;
        return this;
      },
      finalMessage: () =>
        hang
          ? new Promise((_, reject) => {
              thinking.forEach((t) => on.thinking?.(t));
              texts.forEach((t) => on.text?.(t));
              opts.signal.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
            })
          : Promise.resolve().then(() => {
              texts.forEach((t) => on.text?.(t));
              return msg;
            }),
    };
  };
}

const post = (body: unknown, signal?: AbortSignal) => POST(new Request("http://test/api/ask/chat", { method: "POST", body: JSON.stringify(body), signal }));
const ask = (q: string, extra = {}) => ({ requestId: "req-00000001", message: q, profile: "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY", ...extra });
const events = async (res: Response) => parseSse(await res.text()).events;
/** The run continues after the response (it is not awaited by the stream's reader when the browser leaves). */
const settled = () => vi.waitFor(() => expect(m.finish).toHaveBeenCalled(), { timeout: 5000 });

beforeEach(() => {
  m.user = { id: "owner1", email: "owner@seatora.test", name: "Owner", role: "OWNER", premiumUntil: null };
  m.start.mockReset().mockResolvedValue({ ok: true, id: "log1" });
  m.finish.mockReset().mockResolvedValue(undefined);
  m.stream.mockReset();
  m.startTurn.mockReset().mockResolvedValue({ ok: true, conversationId: "conv00000001", answerId: "ans1", history: [] });
  m.claimRun.mockReset();
  m.finishTurn.mockReset().mockResolvedValue(undefined);
  m.saveProgress.mockReset().mockResolvedValue(true);
  m.saveCheckpoint.mockReset().mockResolvedValue(undefined);
  m.turnState.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ["ASK_SLICE_MS", "ASK_STALL_MS"]) delete process.env[k];
});

describe("gating and request checks", () => {
  it("is a 404 for anyone but the enabled owner, before reading the body or spending budget", async () => {
    m.user = null;
    const res = await post(ask("hi"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, no-transform");
    expect(m.startTurn).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
    expect((await GET()).status).toBe(404);
  });

  it("400s bad bodies; 429s when the budget is spent, saving the turn as failed", async () => {
    expect((await POST(new Request("http://t", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await post({ message: "hi" })).status).toBe(400); // no requestId
    expect((await post(ask("x".repeat(2001)))).status).toBe(400);
    expect((await post({ continue: { conversationId: "conv00000001", requestId: "req-00000001", segment: 0 } })).status).toBe(400);
    m.start.mockResolvedValueOnce({ ok: false, reason: "daily" });
    const res = await post(ask("hi"));
    expect(res.status).toBe(429);
    expect(m.finishTurn).toHaveBeenCalledWith("ans1", expect.objectContaining({ status: "error" }));
    expect(m.stream).not.toHaveBeenCalled();
  });

  it("429s a question past the plan's daily questions before spending budget", async () => {
    m.plan.mockResolvedValueOnce({ allowed: false, used: 3, limit: 3, resetAt: new Date() });
    const res = await post(ask("hi"));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("plan_limit");
    expect(m.start).not.toHaveBeenCalled();
    expect(m.finishTurn).toHaveBeenCalledWith("ans1", expect.objectContaining({ status: "error" }));
  });

  it("replays a repeated request instead of running it again", async () => {
    m.startTurn.mockResolvedValueOnce({ ok: true, conversationId: "conv00000001", existing: { id: "ans1", content: "Saved answer.", thinking: null, status: "done", segment: 0 } });
    expect(await events(await post(ask("hi")))).toEqual([
      { type: "meta", conversationId: "conv00000001", requestId: "req-00000001" },
      { type: "reset" },
      { type: "text", text: "Saved answer." },
      { type: "done", outcome: "ok" },
    ]);
    expect(m.stream).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });
});

describe("a run", () => {
  it("streams meta, tool activity, text and done; runs tools between rounds; logs counts only", async () => {
    m.stream
      .mockImplementationOnce(fake([], message([{ type: "tool_use", id: "t1", name: "load_skill", input: { name: "dnb-vs-md" } }], "tool_use")))
      .mockImplementationOnce(fake(["DNB is ", "equivalent."], text("DNB is equivalent.")));
    const res = await post(ask("Should I choose DNB or MD?"));
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    const ev = await events(res);
    expect(ev.filter((e) => e.type !== "ping")).toEqual([
      { type: "meta", conversationId: "conv00000001", requestId: "req-00000001" },
      { type: "tool", name: "load_skill", label: "Reading a guide…" },
      { type: "text", text: "DNB is " },
      { type: "text", text: "equivalent." },
      { type: "done", outcome: "ok" },
    ]);
    const second = m.stream.mock.calls[1][0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(second.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(second.system[1].text).toContain("Budget: ₹10 L a year"); // remembered preferences
    expect(second.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
    expect(second.output_config).toEqual({ effort: "medium" });
    expect(second.thinking).toBeUndefined();
    expect(m.saveCheckpoint).toHaveBeenCalled();
    expect(m.finishTurn).toHaveBeenCalledWith("ans1", { content: "DNB is equivalent.", thinking: null, status: "done" });
    expect(m.finish).toHaveBeenCalledWith("log1", expect.objectContaining({ outcome: "ok", rounds: 2, tools: ["load_skill"], usage: { input: 200, output: 40, cacheRead: 100, cacheWrite: 20 }, check: { passed: 0, failed: 0, missingNumbers: [], badLinks: [] } }));
    const logged = (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("DNB or MD");
    expect(logged).not.toContain("equivalent");
  });

  it("asks once for a rewrite when the draft has a figure no source gave, and shows the corrected answer", async () => {
    m.stream.mockImplementationOnce(fake(["It closed at 52,000."], text("It closed at 52,000."))).mockImplementationOnce(fake(["I could not find that figure."], text("I could not find that figure.")));
    const ev = await events(await post(ask("Kokilaben closing?")));
    expect(ev.map((e) => e.type).filter((t) => t !== "ping")).toEqual(["meta", "text", "status", "replace", "text", "done"]);
    expect(m.stream.mock.calls[1][0].messages.at(-1).content[0].text).toContain("52,000");
    expect(m.finish).toHaveBeenCalledWith("log1", expect.objectContaining({ corrected: true, check: expect.objectContaining({ failed: 1, missingNumbers: ["52,000"] }) }));
    expect(m.finishTurn).toHaveBeenCalledWith("ans1", expect.objectContaining({ content: "I could not find that figure." }));
  });

  it("returns a bad tool input to the model as an error result instead of failing the turn", async () => {
    m.stream
      .mockImplementationOnce(fake([], message([{ type: "tool_use", id: "t1", name: "score_to_rank", input: { score: "lots" } }], "tool_use")))
      .mockImplementationOnce(fake(["Which score?"], text("Which score?")));
    const ev = await events(await post(ask("rank for my score")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "ok" });
    expect(m.stream.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
    expect(m.stream.mock.calls[0][0].output_config).toEqual({ effort: "low" });
  });

  it("deep analysis: effort high and the reasoning summary", async () => {
    m.stream.mockImplementationOnce(fake(["Answer."], text("Answer.")));
    await events(await post(ask("hi", { deep: true })));
    expect(m.stream.mock.calls[0][0]).toMatchObject({ output_config: { effort: "high" }, thinking: { type: "adaptive", display: "summarized" } });
  });

  it("ends a refusal politely", async () => {
    m.stream.mockImplementationOnce(fake([], message([], "refusal")));
    const ev = await events(await post(ask("something off-limits")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "refusal" });
  });

  it("retries Bedrock throttling with backoff, then reports it if it persists", async () => {
    const throttle = () => {
      throw new Anthropic.RateLimitError(429, { type: "error" }, "Too many", new Headers());
    };
    m.stream.mockImplementationOnce(throttle).mockImplementationOnce(fake(["Fine."], text("Fine.")));
    const ok = await events(await post(ask("hi")));
    expect(ok.map((e) => e.type).filter((t) => t !== "ping")).toEqual(["meta", "status", "text", "done"]);
    m.stream.mockReset().mockImplementation(throttle);
    m.finish.mockClear();
    const bad = await events(await post(ask("hi")));
    expect(bad.at(-1)).toEqual({ type: "error", outcome: "rate_limited", message: "The assistant is busy right now. Tap Retry in a minute." });
    expect(m.stream).toHaveBeenCalledTimes(3);
  }, 15_000);
});

describe("time", () => {
  it("at its time slice a run saves a checkpoint and says continue; the continue resumes it without repeating", async () => {
    process.env.ASK_SLICE_MS = "700";
    m.stream
      .mockImplementationOnce(fake([], message([{ type: "tool_use", id: "t1", name: "load_skill", input: { name: "dnb-vs-md" } }], "tool_use")))
      .mockImplementationOnce(fake(["| 1 | first line |"], null, true)); // still writing at the slice
    const ev = await events(await post(ask("Make my list")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "checkpoint", next: 1 });
    expect(m.finishTurn).toHaveBeenLastCalledWith("ans1", expect.objectContaining({ status: "checkpoint", content: "| 1 | first line |" }));
    const cp = structuredClone(m.saveCheckpoint.mock.calls.at(-1)![1]);
    expect(cp.messages.at(-1).content[0].type).toBe("tool_result");

    // The browser's continue: the claimed turn resumes from the checkpoint, told what was already shown.
    delete process.env.ASK_SLICE_MS;
    m.claimRun.mockResolvedValueOnce({ answerId: "ans1", content: "| 1 | first line |", thinking: null, checkpoint: cp, startedAt: new Date(), question: "Make my list", history: [] });
    m.stream.mockImplementationOnce(fake(["\n| 2 | second line |"], text("\n| 2 | second line |")));
    const next = await events(await post({ continue: { conversationId: "conv00000001", requestId: "req-00000001", segment: 1 } }));
    expect(next.at(-1)).toEqual({ type: "done", outcome: "ok" });
    const resumed = m.stream.mock.calls.at(-1)![0].messages.at(-1).content;
    expect(resumed.at(-1).text).toContain("| 1 | first line |");
    expect(m.finishTurn).toHaveBeenLastCalledWith("ans1", expect.objectContaining({ status: "done", content: "| 1 | first line |\n| 2 | second line |" }));
    expect(m.start).toHaveBeenLastCalledWith("owner1", expect.anything(), { hourly: Infinity, daily: Infinity }); // never refused mid-answer
  });

  it("deep analysis also resumes across a checkpoint, keeping its reasoning", async () => {
    process.env.ASK_SLICE_MS = "700";
    m.stream.mockImplementationOnce(fake(["Weighing it: "], null, true, ["Compare trends first."]));
    const ev = await events(await post(ask("Deep: DNB or deemed MD?", { deep: true })));
    expect(ev.filter((e) => e.type === "thinking")).toEqual([{ type: "thinking", text: "Compare trends first." }]);
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "checkpoint", next: 1 });
    expect(m.finishTurn).toHaveBeenLastCalledWith("ans1", { content: "Weighing it: ", thinking: "Compare trends first.", status: "checkpoint" });
    // No round finished before the slice: the first checkpoint is the question itself, and the continue starts over from it, told what was shown.
    delete process.env.ASK_SLICE_MS;
    const cp = { messages: [{ role: "user", content: "Deep: DNB or deemed MD?" }], shownLen: 0, rounds: 0, tools: [], transcript: [], timeNoted: false, check: null, corrected: false };
    m.claimRun.mockResolvedValueOnce({ answerId: "ans1", content: "Weighing it: ", thinking: "Compare trends first.", checkpoint: cp, startedAt: new Date(), question: "Deep: DNB or deemed MD?", history: [] });
    m.stream.mockImplementationOnce(fake(["DNB, on these numbers."], text("DNB, on these numbers.")));
    const next = await events(await post({ continue: { conversationId: "conv00000001", requestId: "req-00000001", segment: 1 }, deep: true }));
    expect(next.at(-1)).toEqual({ type: "done", outcome: "ok" });
    expect(m.stream.mock.calls.at(-1)![0]).toMatchObject({ thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "high" } });
    expect(m.stream.mock.calls.at(-1)![0].messages[0].content.at(-1).text).toContain("Weighing it: ");
    expect(m.finishTurn).toHaveBeenLastCalledWith("ans1", expect.objectContaining({ status: "done", content: "Weighing it: DNB, on these numbers." }));
  });

  it("runs that only restart a call without progress stall out across checkpoints (no endless continues)", async () => {
    process.env.ASK_STALL_MS = "60000";
    const cp = { messages: [{ role: "user", content: "Make my list" }], shownLen: 0, rounds: 0, tools: [], transcript: [], timeNoted: false, check: null, corrected: false, movedAt: Date.now() - 61_000 };
    m.claimRun.mockResolvedValueOnce({ answerId: "ans1", content: "", thinking: null, checkpoint: cp, startedAt: new Date(), question: "Make my list", history: [] });
    m.stream.mockImplementationOnce(fake([], null, true));
    const ev = await events(await post({ continue: { conversationId: "conv00000001", requestId: "req-00000001", segment: 7 } }));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "partial" });
  });

  it("a repeated continue reads the turn instead of running it twice", async () => {
    m.claimRun.mockResolvedValueOnce(null);
    m.turnState.mockResolvedValueOnce({ content: "Half", thinking: null, status: "streaming", segment: 1, phase: "Checking closing ranks…" });
    const ev = await events(await post({ continue: { conversationId: "conv00000001", requestId: "req-00000001", segment: 1 } }));
    expect(ev.slice(-2)).toEqual([{ type: "status", text: "Checking closing ranks…" }, { type: "done", outcome: "running" }]);
    expect(m.stream).not.toHaveBeenCalled();
  });

  it("only no progress ends a turn: the text so far is kept with a note to continue", async () => {
    process.env.ASK_STALL_MS = "600";
    m.stream.mockImplementationOnce(fake(["Partial answer"], null, true));
    const ev = await events(await post(ask("hi")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "partial" });
    expect(m.finishTurn).toHaveBeenLastCalledWith("ans1", expect.objectContaining({ status: "partial", content: expect.stringContaining("Tap **Continue**") }));
  });

  it("a dropped connection does not stop the run; Stop does", async () => {
    m.stream.mockImplementationOnce(fake(["Answer."], text("Answer.")));
    const ctrl = new AbortController();
    const res = await post(ask("hi"), ctrl.signal);
    ctrl.abort();
    await res.body?.cancel().catch(() => {});
    await settled();
    expect(m.finishTurn).toHaveBeenCalledWith("ans1", expect.objectContaining({ status: "done", content: "Answer." }));

    // Stop: the saved answer is no longer streaming, the next save sees it and the run ends.
    m.finish.mockClear();
    m.saveProgress.mockResolvedValue(false);
    m.stream.mockImplementationOnce(fake(["Long…"], null, true));
    const ev = await events(await post(ask("hi")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "stopped" });
  }, 10_000);
});
