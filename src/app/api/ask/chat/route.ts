import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import type { z } from "zod";
import { askUser } from "@/features/ask/access";
import { chatBodySchema, chooseEffort, runAsk, trimHistory, type AskEvent, type Checkpoint, type ChatTurn, type RunResult } from "@/features/ask/agent";
import { finishAsk, startAsk, zeroUsage, type Outcome } from "@/features/ask/budget";
import { askClient } from "@/features/ask/client";
import { ASK_MAX_TURNS, askConfig } from "@/features/ask/config";
import { claimRun, finishTurn, getPreferences, saveCheckpoint, saveProgress, startTurn, turnState } from "@/features/ask/memory";
import { sseFrame } from "@/features/ask/sse";
import { profileFromParams } from "@/features/decide/profile";
import { getDecideData } from "@/features/decide/service";
import { checkAndCount } from "@/features/plans/usage";

// Ask Seatora's chat (owner only, ASK_ENABLED=1). POST a question { conversationId?, requestId, message, profile, deep }
// or a continue { continue: { conversationId, requestId, segment }, profile, deep } → text/event-stream of `data: {...}`
// frames (meta, text, thinking, tool, status, replace, ping every 10 s; then exactly one done or error).
// Each POST is one run of the turn, saved to Postgres as it goes (memory.ts). A run stops at its time slice with a
// checkpoint and the done event says `continue` with the next segment: the browser posts it at once and the answer
// carries on. The run finishes even if the browser goes away (`after`); a reload reads the saved turn. A repeated
// requestId or segment never runs twice. Logs token counts, tool names, timings, the answer check and the outcome only.

export const dynamic = "force-dynamic";
/** The longest a function may run with Fluid compute; ASK_SLICE_MS (default 270 s) keeps each run under it. */
export const maxDuration = 300;

// no-transform: the server must not compress (and so buffer) the event stream.
const noStore = { "Cache-Control": "private, no-store, no-transform", "X-Robots-Tag": "noindex, nofollow" };
const json = (status: number, body: unknown) => Response.json(body, { status, headers: noStore });
const notFound = () => json(404, { ok: false, error: { code: "not_found" } });
const sseHeaders = { ...noStore, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive", "X-Accel-Buffering": "no" };

/** What she sees for a failure; the outcome is what the log records. */
function classify(e: unknown): { outcome: Outcome; message: string } {
  if (e instanceof Anthropic.RateLimitError) return { outcome: "rate_limited", message: "The assistant is busy right now. Tap Retry in a minute." };
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return { outcome: "error", message: "The assistant is unavailable right now. Tap Retry shortly." };
  return { outcome: "error", message: "Something went wrong. Tap Retry." };
}

const replay = (events: AskEvent[]) => new Response(events.map(sseFrame).join(""), { headers: sseHeaders });

/** A turn that is not run by this request: what it shows now, and what the browser should do next. */
function stateEvents(meta: AskEvent, s: { content: string; thinking: string | null; status: string; segment: number; phase: string | null } | null): AskEvent[] {
  if (!s) return [meta, { type: "error", outcome: "error", message: "This answer was not found. Tap Retry." }];
  const shown: AskEvent[] = [{ type: "reset" }, ...(s.thinking ? [{ type: "thinking" as const, text: s.thinking }] : []), ...(s.content ? [{ type: "text" as const, text: s.content }] : [])];
  if (s.status === "streaming") return [meta, ...shown, { type: "status", text: s.phase ?? "Still working on this answer…" }, { type: "done", outcome: "running" }];
  if (s.status === "checkpoint") return [meta, ...shown, { type: "done", outcome: "checkpoint", next: s.segment + 1 }];
  if (s.status === "error") return [meta, { type: "error", outcome: "error", message: s.content || "This answer failed. Tap Retry." }];
  return [meta, ...shown, { type: "done", outcome: s.status === "partial" ? "partial" : s.status === "stopped" ? "stopped" : "ok" }];
}

export async function POST(req: Request) {
  const user = await askUser();
  if (!user) return notFound();
  const cfg = askConfig();

  const raw = await req.text();
  if (raw.length > 20_000) return json(413, { ok: false, error: { code: "too_large", message: "Too long." } });
  let body: z.infer<typeof chatBodySchema>;
  try {
    const parsed = chatBodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json(400, { ok: false, error: { code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid request" } });
    body = parsed.data;
  } catch {
    return json(400, { ok: false, error: { code: "invalid", message: "Invalid JSON" } });
  }

  // Which run of which turn this request is.
  let run: { conversationId: string; requestId: string; segment: number; answerId: string; question: string; history: ChatTurn[]; shown: string; thinking: string; checkpoint: Checkpoint | null; startedAt: number };
  if ("continue" in body) {
    const c = body.continue;
    const meta: AskEvent = { type: "meta", conversationId: c.conversationId, requestId: c.requestId };
    const claimed = await claimRun(user.id, c.conversationId, c.requestId, c.segment);
    if (!claimed) return replay(stateEvents(meta, await turnState(c.conversationId, c.requestId))); // a repeat or a race: read it
    run = { ...c, answerId: claimed.answerId, question: claimed.question, history: claimed.history, shown: claimed.content, thinking: claimed.thinking ?? "", checkpoint: claimed.checkpoint as Checkpoint | null, startedAt: claimed.startedAt.getTime() };
  } else {
    const turn = await startTurn(user.id, { conversationId: body.conversationId, requestId: body.requestId, question: body.message });
    if (!turn.ok) return notFound();
    const meta: AskEvent = { type: "meta", conversationId: turn.conversationId, requestId: body.requestId };
    // The same request again (a retry after a dropped connection): never run twice.
    if (turn.existing) return replay(stateEvents(meta, { ...turn.existing, phase: null }));
    run = { conversationId: turn.conversationId, requestId: body.requestId, segment: 0, answerId: turn.answerId, question: body.message, history: turn.history, shown: "", thinking: "", checkpoint: null, startedAt: Date.now() };
  }

  // The plan's questions a day (features/plans): new questions only; owner and admins are unlimited (still counted).
  if (!run.segment) {
    const q = await checkAndCount(user.id, "ask", undefined, { account: user });
    if (!q.allowed) {
      const message = `You've asked today's ${q.limit} questions on your plan. More at 00:00 IST, or get the Season Pass on the Pricing page.`;
      await finishTurn(run.answerId, { content: message, thinking: null, status: "error" });
      return json(429, { ok: false, error: { code: "plan_limit", message } });
    }
  }

  const effort = chooseEffort(run.question, body.deep);
  // Limits count questions; a continue of a running turn is never refused (it is logged).
  const started = await startAsk(user.id, { model: cfg.model, effort }, { hourly: run.segment ? Infinity : cfg.hourlyRequests, daily: run.segment ? Infinity : cfg.dailyTokens });
  if (!started.ok) {
    const message = started.reason === "hourly" ? "Hourly limit reached. Try again later." : "Today's assistant budget is used up. It resets at 05:30 IST.";
    await finishTurn(run.answerId, { content: message, thinking: null, status: "error" });
    return json(429, { ok: false, error: { code: "limit", message } });
  }

  const profile = profileFromParams(new URLSearchParams(body.profile));
  const prefs = await getPreferences(user.id);
  const { kept, earlier } = trimHistory([...run.history, { role: "user", content: run.question }], cfg.historyTokens, ASK_MAX_TURNS * 2);
  const t0 = Date.now();
  // Stop pressed (the saved answer is no longer "streaming"): ends the turn. A dropped connection does not.
  const stop = new AbortController();
  const enc = new TextEncoder();
  let sink: ReadableStreamDefaultController<Uint8Array> | null = null;
  const send = (e: AskEvent) => {
    try {
      sink?.enqueue(enc.encode(sseFrame(e)));
    } catch {
      sink = null; // the browser went away; the run carries on and is saved
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      sink = c;
    },
    cancel() {
      sink = null;
    },
  });

  let text = run.shown;
  let thinking = run.thinking;
  let phase: string | null = null;
  const emit = (e: AskEvent) => {
    if (e.type === "text") text += e.text;
    else if (e.type === "replace") text = "";
    else if (e.type === "thinking") thinking += e.text;
    else if (e.type === "tool" || e.type === "status") phase = e.type === "tool" ? e.label : e.text;
    send(e);
  };
  send({ type: "meta", conversationId: run.conversationId, requestId: run.requestId });

  const job = (async () => {
    let saving = Promise.resolve();
    const save = (fn: () => Promise<unknown>) => (saving = saving.then(fn).then(() => {}, () => {}));
    const saver = setInterval(() => {
      save(async () => {
        if (!(await saveProgress(run.answerId, { content: text, thinking: thinking || null, phase }).catch(() => true))) stop.abort();
      });
    }, 2000);
    const heartbeat = setInterval(() => send({ type: "ping" }), 10_000);
    let result: RunResult = { outcome: "error", usage: zeroUsage(), tools: [], rounds: 0, transcript: [], text: "", thinking: "", check: null, corrected: false, timing: { modelMs: 0, toolMs: 0, checkMs: 0, firstTextMs: null } };
    let status: "done" | "partial" | "error" | "stopped" | "checkpoint" = "done";
    let final: AskEvent;
    try {
      result = await runAsk({
        client: askClient(), model: cfg.model, effort, deep: body.deep, maxOutputTokens: cfg.maxOutputTokens,
        history: kept, earlier, prefs, ctx: { userId: user.id, profile }, signal: stop.signal, emit,
        softAt: run.startedAt + (body.deep ? cfg.deepSoftMs : cfg.softMs), sliceAt: t0 + cfg.sliceMs, capAt: run.startedAt + cfg.capMs, stallMs: cfg.stallMs,
        resume: run.checkpoint ? { checkpoint: run.checkpoint, shown: run.shown } : undefined,
        onCheckpoint: (c, shown) => save(() => saveCheckpoint(run.answerId, c, shown)),
        slugs: async () => new Set((await getDecideData()).colleges.map((c) => c.slug)),
      });
      if (result.outcome === "checkpoint") {
        status = "checkpoint";
        final = { type: "done", outcome: "checkpoint", next: run.segment + 1 };
      } else {
        status = ["partial", "max_rounds"].includes(result.outcome) ? "partial" : "done";
        final = { type: "done", outcome: result.outcome };
      }
    } catch (e) {
      const partial = (e as { partial?: RunResult }).partial;
      if (partial) result = partial;
      if (stop.signal.aborted) {
        result.outcome = "stopped";
        status = "stopped";
        final = { type: "done", outcome: "stopped" };
      } else {
        const c = classify(e);
        result.outcome = c.outcome;
        status = "error";
        if (c.outcome === "error") console.error("[ask] failed", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e instanceof Error ? e.name : "error");
        final = { type: "error", outcome: c.outcome, message: c.message };
      }
    }
    clearInterval(saver);
    clearInterval(heartbeat);
    await saving;
    const latencyMs = Date.now() - t0;
    const { usage, tools, rounds, check, corrected, timing } = result;
    const outcome = result.outcome === "checkpoint" ? "partial" : result.outcome;
    // A failed turn keeps what was written, with the reason, so a reload shows it and Retry is offered.
    const content = status === "error" ? `${text}${text ? "\n\n" : ""}${(final as { message?: string }).message ?? ""}` : text;
    await finishTurn(run.answerId, { content, thinking: thinking || null, status }).catch(() => console.error("[ask] save failed"));
    console.info("[ask]", JSON.stringify({ model: cfg.model, effort, segment: run.segment, in: usage.input, out: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, tools, rounds, latencyMs, timing, check: check && { passed: check.passed, failed: check.failed }, corrected, outcome: result.outcome }));
    await finishAsk(started.id, { usage, tools, rounds, latencyMs, outcome, conversationId: run.conversationId, check, corrected, timing: { ...timing, segment: run.segment } }).catch(() => console.error("[ask] log write failed"));
    send(final);
    try {
      (sink as ReadableStreamDefaultController<Uint8Array> | null)?.close();
    } catch {}
    sink = null;
  })();
  // Keep the function alive until the run is saved, whether or not the browser is still reading.
  try {
    after(job);
  } catch {
    // Outside a request (tests): the run goes on by itself.
  }
  return new Response(stream, { headers: sseHeaders });
}

export const GET = notFound;
