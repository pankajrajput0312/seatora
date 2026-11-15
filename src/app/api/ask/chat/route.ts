import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { askUser } from "@/features/ask/access";
import { chatBodySchema, chooseEffort, runAsk, trimHistory, type AskEvent, type RunResult } from "@/features/ask/agent";
import { finishAsk, startAsk, zeroUsage, type Outcome } from "@/features/ask/budget";
import { askClient } from "@/features/ask/client";
import { sseFrame } from "@/features/ask/sse";
import { ASK_MAX_TURNS, askConfig } from "@/features/ask/config";
import { profileFromParams } from "@/features/decide/profile";

// Ask Seatora's chat (owner only, ASK_ENABLED=1): POST { messages, profile } → text/event-stream of
// `data: {"type":"text"|"tool"|"done"|"error",...}` lines. The stream always ends with one done or error event.
// Logs token counts, tool names, latency and outcome only: never message text or names.

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// no-transform: the server must not compress (and so buffer) the event stream.
const noStore = { "Cache-Control": "private, no-store, no-transform", "X-Robots-Tag": "noindex, nofollow" };
const json = (status: number, body: unknown) => Response.json(body, { status, headers: noStore });
const notFound = () => json(404, { ok: false, error: { code: "not_found" } });

/** What she sees for a failure; the outcome is what the log records. */
function classify(e: unknown, timedOut: boolean): { outcome: Outcome; message: string } {
  if (timedOut) return { outcome: "timeout", message: "That took too long. Try a narrower question (one course or one college)." };
  if (e instanceof Anthropic.APIUserAbortError) return { outcome: "aborted", message: "Stopped." };
  if (e instanceof Anthropic.RateLimitError) return { outcome: "rate_limited", message: "The assistant is busy right now. Try again in a minute." };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { outcome: "timeout", message: "The assistant timed out. Try again." };
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return { outcome: "error", message: "The assistant is unavailable right now. Try again shortly." };
  return { outcome: "error", message: "Something went wrong. Try again." };
}

export async function POST(req: Request) {
  const user = await askUser();
  if (!user) return notFound();
  const cfg = askConfig();

  const raw = await req.text();
  if (raw.length > 200_000) return json(413, { ok: false, error: { code: "too_large", message: "Conversation too long. Start a new chat." } });
  let body: z.infer<typeof chatBodySchema>;
  try {
    const parsed = chatBodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json(400, { ok: false, error: { code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid request" } });
    body = parsed.data;
  } catch {
    return json(400, { ok: false, error: { code: "invalid", message: "Invalid JSON" } });
  }

  const question = body.messages.at(-1)!.content;
  const effort = chooseEffort(question);
  const started = await startAsk(user.id, { model: cfg.model, effort }, { hourly: cfg.hourlyRequests, daily: cfg.dailyTokens });
  if (!started.ok)
    return json(429, { ok: false, error: { code: "limit", message: started.reason === "hourly" ? "Hourly limit reached. Try again later." : "Today's assistant budget is used up. It resets at 05:30 IST." } });

  const profile = profileFromParams(new URLSearchParams(body.profile));
  const history = trimHistory(body.messages, cfg.historyTokens, ASK_MAX_TURNS * 2);
  const t0 = Date.now();
  const deadline = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    deadline.abort();
  }, cfg.timeoutMs);
  const signal = AbortSignal.any([req.signal, deadline.signal]);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: AskEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(sseFrame(e)));
        } catch {
          open = false; // the client went away
        }
      };
      let result: RunResult = { outcome: "error", usage: zeroUsage(), tools: [], rounds: 0, transcript: [] };
      try {
        result = await runAsk({ client: askClient(), model: cfg.model, effort, maxOutputTokens: cfg.maxOutputTokens, history, ctx: { userId: user.id, profile }, signal, emit });
        emit({ type: "done", outcome: result.outcome });
      } catch (e) {
        const partial = (e as { partial?: RunResult }).partial;
        if (partial) result = partial;
        const c = classify(e, timedOut);
        result.outcome = req.signal.aborted ? "aborted" : c.outcome;
        if (c.outcome === "error") console.error("[ask] failed", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e instanceof Error ? e.name : "error");
        emit({ type: "error", outcome: result.outcome, message: c.message });
      } finally {
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;
        const { usage, tools, rounds, outcome } = result;
        console.info("[ask]", JSON.stringify({ model: cfg.model, effort, in: usage.input, out: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, tools, rounds, latencyMs, outcome }));
        await finishAsk(started.id, { usage, tools, rounds, latencyMs, outcome }).catch(() => console.error("[ask] log write failed"));
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      deadline.abort();
    },
  });
  return new Response(stream, { headers: { ...noStore, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

export const GET = notFound;
