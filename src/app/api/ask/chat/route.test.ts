import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSse } from "@/features/ask/sse";

// The chat route with the owner check, the budget table and the Bedrock client mocked: gating, request checks, the SSE
// framing (always ending in done or error), tool rounds, refusal, throttling and abort.

const m = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string }, start: vi.fn(), finish: vi.fn(), stream: vi.fn() }));
vi.mock("@/features/ask/access", () => ({ askUser: async () => m.user }));
vi.mock("@/features/ask/budget", async (orig) => ({ ...(await orig<object>()), startAsk: m.start, finishAsk: m.finish }));
vi.mock("@/features/ask/client", () => ({ askClient: () => ({ messages: { stream: m.stream } }) }));

const { POST, GET } = await import("./route");

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 };
const message = (content: unknown[], stop_reason: string) => ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason, stop_details: null, usage });

/** A fake MessageStream: emits `texts` then resolves `msg`; with `hang`, waits for the request's abort signal. */
function fake(texts: string[], msg: unknown, hang = false) {
  return (_params: unknown, opts: { signal: AbortSignal }) => {
    let onText: (t: string) => void = () => {};
    return {
      on(ev: string, cb: (t: string) => void) {
        if (ev === "text") onText = cb;
        return this;
      },
      finalMessage: () =>
        hang
          ? new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())))
          : Promise.resolve().then(() => {
              texts.forEach((t) => onText(t));
              return msg;
            }),
    };
  };
}

const post = (body: unknown, signal?: AbortSignal) => POST(new Request("http://test/api/ask/chat", { method: "POST", body: JSON.stringify(body), signal }));
const ask = (q: string) => ({ messages: [{ role: "user", content: q }], profile: "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY" });
const events = async (res: Response) => parseSse(await res.text()).events;

beforeEach(() => {
  m.user = { id: "owner1", email: "owner@seatora.test", name: "Owner" };
  m.start.mockReset().mockResolvedValue({ ok: true, id: "log1" });
  m.finish.mockReset().mockResolvedValue(undefined);
  m.stream.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gating", () => {
  it("is a 404 for anyone but the enabled owner, before reading the body or spending budget", async () => {
    m.user = null;
    const res = await post(ask("hi"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, no-transform");
    expect(m.start).not.toHaveBeenCalled();
    expect(m.stream).not.toHaveBeenCalled();
    expect((await GET()).status).toBe(404);
  });
});

describe("request checks", () => {
  it("400s bad bodies and too-long questions; 429s when the budget is spent", async () => {
    expect((await POST(new Request("http://t", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await post({ messages: [] })).status).toBe(400);
    expect((await post({ messages: [{ role: "assistant", content: "hi" }] })).status).toBe(400);
    expect((await post(ask("x".repeat(2001)))).status).toBe(400);
    m.start.mockResolvedValueOnce({ ok: false, reason: "daily" });
    const res = await post(ask("hi"));
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/budget/);
    expect(m.stream).not.toHaveBeenCalled();
  });
});

describe("the stream", () => {
  it("streams text, tool activity and done, runs tools between rounds, and logs counts only", async () => {
    m.stream
      .mockImplementationOnce(fake([], message([{ type: "tool_use", id: "t1", name: "load_skill", input: { name: "dnb-vs-md" } }], "tool_use")))
      .mockImplementationOnce(fake(["DNB is ", "equivalent."], message([{ type: "text", text: "DNB is equivalent." }], "end_turn")));
    const res = await post(ask("Should I choose DNB or MD?"));
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    const ev = await events(res);
    expect(ev).toEqual([
      { type: "tool", name: "load_skill", label: "Reading a guide…" },
      { type: "text", text: "DNB is " },
      { type: "text", text: "equivalent." },
      { type: "done", outcome: "ok" },
    ]);
    // Round 2 got the tool result; the cached prefix (system + tools) carries breakpoints; effort medium for advice.
    const second = m.stream.mock.calls[1][0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(second.messages.at(-1).content[0].content).toContain("NMC");
    expect(second.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(second.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
    expect(second.output_config).toEqual({ effort: "medium" });
    expect(m.finish).toHaveBeenCalledWith("log1", expect.objectContaining({ outcome: "ok", rounds: 2, tools: ["load_skill"], usage: { input: 200, output: 40, cacheRead: 100, cacheWrite: 20 } }));
    const logged = (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("DNB or MD");
    expect(logged).not.toContain("equivalent");
  });

  it("returns a bad tool input to the model as an error result instead of failing the turn", async () => {
    m.stream
      .mockImplementationOnce(fake([], message([{ type: "tool_use", id: "t1", name: "score_to_rank", input: { score: "lots" } }], "tool_use")))
      .mockImplementationOnce(fake(["Which score?"], message([{ type: "text", text: "Which score?" }], "end_turn")));
    const ev = await events(await post(ask("rank for my score")));
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "ok" });
    const result = m.stream.mock.calls[1][0].messages.at(-1).content[0];
    expect(result).toMatchObject({ is_error: true });
    expect(m.stream.mock.calls[0][0].output_config).toEqual({ effort: "low" });
  });

  it("ends a refusal with a polite note and outcome refusal", async () => {
    m.stream.mockImplementationOnce(fake([], message([], "refusal")));
    const ev = await events(await post(ask("something off-limits")));
    expect(ev[0]).toMatchObject({ type: "text" });
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "refusal" });
  });

  it("says when an answer hit max_tokens", async () => {
    m.stream.mockImplementationOnce(fake(["Long"], message([{ type: "text", text: "Long" }], "max_tokens")));
    const ev = await events(await post(ask("everything")));
    expect(ev.map((e) => e.type)).toEqual(["text", "text", "done"]);
    expect(ev.at(-1)).toEqual({ type: "done", outcome: "max_tokens" });
  });

  it("ends with an error event when Bedrock throttles", async () => {
    m.stream.mockImplementationOnce(() => {
      throw new Anthropic.RateLimitError(429, { type: "error" }, "Too many", new Headers());
    });
    const ev = await events(await post(ask("hi")));
    expect(ev).toEqual([{ type: "error", outcome: "rate_limited", message: "The assistant is busy right now. Try again in a minute." }]);
    expect(m.finish).toHaveBeenCalledWith("log1", expect.objectContaining({ outcome: "rate_limited" }));
  });

  it("stops the model call when the client disconnects, and logs it as aborted", async () => {
    m.stream.mockImplementationOnce(fake([], null, true));
    const ctrl = new AbortController();
    const res = await post(ask("hi"), ctrl.signal);
    const reader = res.body!.getReader();
    setTimeout(() => ctrl.abort(), 10);
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(parseSse(chunks.join("")).events.at(-1)).toMatchObject({ type: "error", outcome: "aborted" });
    expect(m.finish).toHaveBeenCalledWith("log1", expect.objectContaining({ outcome: "aborted" }));
  });
});
