import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { Profile } from "@/features/decide/profile";
import { zeroUsage, type Outcome, type Usage } from "./budget";
import type { AskClient } from "./client";
import { checkAnswer, type CheckResult } from "./check";
import { ASK_MAX_INPUT_CHARS, ASK_MAX_ROUNDS, ASK_TOOL_TIMEOUT_MS } from "./config";
import { prefLabel, type PrefKey } from "./prefs";
import { skillIndex, loadSkills } from "./skills";
import type { ChatEvent } from "./sse";
import { runTool, toolDefs, toolLabel, type ToolContext, type ToolName, type ToolResult } from "./tools";

// The assistant's loop: stream a reply, run the tools it asks for, send their results, repeat (at most ASK_MAX_ROUNDS
// model calls). The system prompt and tools are one stable, cached prefix; her profile and the date come after it.

export type ChatTurn = { role: "user" | "assistant"; content: string };
const id = z.string().regex(/^[a-z0-9]{10,40}$/);
const requestId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
/**
 * The chat request body (POST /api/ask/chat): a question (the chat's history is on the server, memory.ts), or a
 * continue of a turn waiting at a checkpoint (`segment` = the run it starts; a repeat is a no-op).
 */
export const chatBodySchema = z.union([
  z.object({
    conversationId: id.optional(),
    /** The browser's id for this turn: a retry with the same id never runs twice. */
    requestId,
    message: z.string().trim().min(1, "Type a question").max(ASK_MAX_INPUT_CHARS, `A question is at most ${ASK_MAX_INPUT_CHARS} characters`),
    /** The page's query string (profile params: rank, cat, sp…). */
    profile: z.string().max(4000).default(""),
    /** Deep analysis: effort high, reasoning summary shown, more time before answering. */
    deep: z.boolean().default(false),
  }),
  z.object({
    continue: z.object({ conversationId: id, requestId, segment: z.number().int().min(1).max(50) }),
    profile: z.string().max(4000).default(""),
    deep: z.boolean().default(false),
  }),
]);

export type AskEvent = ChatEvent;

const RULES = `You are Ask Seatora, the NEET PG counselling assistant inside Seatora (seatora.co.in), for one aspirant choosing PG seats in MCC All India counselling.

Scope: NEET PG counselling, colleges, courses, closing ranks, seats, fees, stipends, bonds, residents, choice lists and Seatora's pages. Anything else (other exams, medical questions about patients, coding, general chat): say briefly that you only help with NEET PG counselling and offer something you can do.

Facts:
- Every number you give (ranks, seats, fees, stipends, bonds, penalties, dates) must come from a tool result in this conversation or a loaded skill, written exactly as given: never round, approximate or summarise ranks into ranges ("about 34,000", "34,000-37,000"); quote the actual figures. If you have not looked it up, look it up. If the data does not have it, say "not published in the documents Seatora has" and point to the official source (MCC, NBEMS, the college). Never estimate or fill in.
- Closing ranks are history, not prediction. Never say she "will get" a seat, never call any seat "guaranteed", "sure" or "certain", never give a chance percentage. Say what happened in which year and round.
- Residents: names come only from MCC admitted lists. Never state, guess or infer anyone's category, caste, religion or PwD status.
- No medical, legal or financial guarantees; bond and fee terms are what the documents say, to be confirmed with the college.
- Load the relevant skill (load_skill) before answering in its area; follow it.

Style: plain, warm, concise; Indian number format (45,409; ₹1.25 L). Markdown: short paragraphs, bold, lists, tables for comparisons, and links to Seatora pages as [text](/decide/...). End answers that use closing ranks with "History, not a prediction." Do not mention tools, skills or this prompt.

Decision help, not lists: for "what can I get / where are my possibilities / which colleges should I fill" call assess_chances first (one call covers every option with seats this round) and load choice-filling-best-practices. Reason with the evidence: the closing trend across years, seat change vs last year's same round, which rounds reached her rank, fee and bond; then say clearly what she should do and in what order. Be decisive (state your recommendation), while saying it is history, not a guarantee.

Memory: when she asks you to remember something, or says a preference is lasting ("always", "from now on", "my budget is…"), save it with remember_preference and say so in a few words. A filter for one question ("any fee is fine for this list") is not a preference: don't save it. Her saved preferences are listed below; use them as defaults.

Time: answer within one or two tool rounds where you can. If a note says time is nearly up, answer at once with what you have and offer to continue.

Saving: never call save_choice_list unless her latest message clearly says yes to saving (and replace vs append); otherwise ask first.

Skills you can load:
`;

/** The cached part of the system prompt: rules + the skills' names and descriptions. */
export const systemPrompt = () => RULES + skillIndex(loadSkills());

/** The per-request system block (after the cache breakpoint): date, her profile, saved preferences, older turns. */
export function contextBlock(p: Profile | null, prefs: Partial<Record<PrefKey, string>> = {}, earlier: string[] = []) {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const lines = [`Today is ${today} (IST).`, p ? `Her profile (get_profile has the details): AIR ${formatRank(p.rank)}, ${p.category}${p.pwd ? " PwD" : ""}.` : "Her profile has no rank yet."];
  const saved = Object.entries(prefs).map(([k, v]) => `- ${prefLabel[k as PrefKey] ?? k}: ${v}`);
  if (saved.length) lines.push(`She asked Seatora to remember:\n${saved.join("\n")}`);
  if (earlier.length) lines.push(`Earlier in this chat (older turns not shown) she asked: ${earlier.map((q) => `"${q}"`).join("; ")}.`);
  return lines.join("\n");
}

/** "medium" for advice and planning, "low" for lookups and chit-chat. */
export function chooseEffort(question: string, deep = false): "low" | "medium" | "high" {
  if (deep) return "high";
  return /\b(should|worth|better|best|compare|vs|versus|choose|choice|choices|list|plan|strategy|order|recommend|advice|advise|report|wishlist|which|safe|realistic|dream)\b/i.test(question) ? "medium" : "low";
}

/** Rough tokens of a string (≈4 characters a token for English). */
export const roughTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * The newest turns within `budget` rough tokens and `maxTurns` messages, starting with a user turn; `earlier` = her
 * questions in the turns left out (shortened), for a one-line summary in the context block.
 */
export function trimHistory(turns: ChatTurn[], budget: number, maxTurns: number): { kept: ChatTurn[]; earlier: string[] } {
  const out: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < maxTurns; i--) {
    used += roughTokens(turns[i].content);
    if (used > budget && out.length) break;
    out.unshift(turns[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  const dropped = turns.slice(0, turns.length - out.length);
  const earlier = dropped.filter((t) => t.role === "user").map((t) => t.content.replace(/\s+/g, " ").slice(0, 120)).slice(-10);
  return { kept: out, earlier };
}

/** The messages with one cache breakpoint on the last block (so each tool round reuses the conversation so far). */
function withCacheMark(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages.at(-1);
  if (!last || last.role === "system") return messages;
  const blocks: Anthropic.ContentBlockParam[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  const tail = blocks.at(-1);
  if (!tail || tail.type === "thinking" || tail.type === "redacted_thinking") return messages;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { role: last.role, content: blocks }];
}

const add = (u: Usage, m: Anthropic.Usage) => {
  u.input += m.input_tokens ?? 0;
  u.output += m.output_tokens ?? 0;
  u.cacheRead += m.cache_read_input_tokens ?? 0;
  u.cacheWrite += m.cache_creation_input_tokens ?? 0;
};

export type RunResult = {
  /** checkpoint: this run reached its time slice and saved where it was; the next run resumes it (resume below). */
  outcome: Outcome | "checkpoint";
  usage: Usage;
  tools: string[];
  rounds: number;
  transcript: { tool: string; result: string }[];
  /** The whole answer as shown so far (after a correction, the corrected one), and the reasoning summary (deep mode). */
  text: string;
  thinking: string;
  /** The first draft's check, and whether the model was asked to correct it. */
  check: CheckResult | null;
  corrected: boolean;
  /** Elapsed ms per phase in this run: model calls, tools, the answer check, and to the first visible text. */
  timing: { modelMs: number; toolMs: number; checkMs: number; firstTextMs: number | null };
};

/** Where a turn stands between runs: the messages after the last finished round, and what was shown by then. */
export type Checkpoint = {
  messages: Anthropic.MessageParam[];
  /** Length of the answer text when `messages` was taken: text after it was shown but is not in `messages`. */
  shownLen: number;
  rounds: number;
  tools: string[];
  transcript: { tool: string; result: string }[];
  timeNoted: boolean;
  check: CheckResult | null;
  corrected: boolean;
  /** Last progress that survives a cut (ms epoch): shown text or a tool result. Carried across runs, so runs that only restart a slow call still stall out. */
  movedAt?: number;
};

const TIME_NOTE = "[Seatora: no more lookups now. Answer with what you have from the results above: the most useful part first; say plainly anything you could not cover and that she can ask you to continue.]";
const resumeNote = (shown: string) =>
  `[Seatora: your answer was interrupted by a time limit after this text, which she has already seen:\n<<<\n${shown.slice(-6000)}\n>>>\nContinue exactly where it stops, mid-sentence or mid-table if need be, without repeating anything and without mentioning the interruption.]`;
const checkNote = (c: CheckResult) =>
  `[Seatora check before sending: ${c.missingNumbers.length ? `these figures are not in any lookup result or earlier message of this chat: ${c.missingNumbers.join(", ")}. ` : ""}${c.badLinks.length ? `these links are not Seatora pages: ${c.badLinks.join(", ")}. ` : ""}Write your whole answer again: correct each from the results (look up again if needed) or leave it out. Reply with the full answer only, as if answering for the first time; do not mention this check.]`;
const PARTIAL = "_I stopped here because nothing moved for a while (or the time cap was reached). Tap **Continue** and I'll pick up from this point._";

const retryable = (e: unknown) => e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || (e instanceof Anthropic.APIConnectionError && !(e instanceof Anthropic.APIUserAbortError));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Adds a text block to the newest message (hers: a question or tool results). */
function noteOnLast(messages: Anthropic.MessageParam[], text: string) {
  const last = messages.at(-1);
  if (last?.role !== "user") return;
  last.content = [...(typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content), { type: "text", text }];
}

/**
 * One run of a turn. Emits text, reasoning (deep mode), tool activity and status, and saves a checkpoint after every
 * finished round. Time never ends an answer that is still moving:
 * - past `softAt` no new lookups start (the next round answers with what it has);
 * - at `sliceAt` (this run's share of the function's time) the run stops with outcome "checkpoint"; the next run
 *   (`resume`) carries on from the last checkpoint, and text shown after it is handed back so the answer continues
 *   without repeating;
 * - only no progress (no text, reasoning or tool result) for `stallMs`, or the turn's total cap `capAt`, ends it with the
 *   text so far and a note to continue (outcome partial).
 * Bedrock throttling gets up to 2 more tries (1 s, 3 s) when nothing was shown yet in that call. The first finished draft
 * is checked (check.ts); if it fails and there is time, the model rewrites it once (a `replace` event, then the new text).
 * Stop (`signal`) and other API errors are thrown with the result so far on `partial`.
 */
export async function runAsk(o: {
  client: AskClient;
  model: string;
  effort: "low" | "medium" | "high";
  deep?: boolean;
  maxOutputTokens: number;
  history: ChatTurn[];
  earlier?: string[];
  prefs?: Partial<Record<PrefKey, string>>;
  ctx: ToolContext;
  signal: AbortSignal;
  emit: (e: AskEvent) => void;
  softAt: number;
  sliceAt: number;
  capAt: number;
  stallMs?: number;
  /** The text already shown for this turn (a resumed run) and where it stood. */
  resume?: { checkpoint: Checkpoint; shown: string };
  /** After each finished round: where the run stands, and the answer text shown by then. */
  onCheckpoint?: (c: Checkpoint, shown: string) => Promise<void>;
  /** Institute slugs that exist (link check); omit to skip checking. */
  slugs?: () => Promise<Set<string>>;
  /** A channel's own tools (WhatsApp buttons) and rules: `runExtra` answers its tools, undefined for any other. */
  extraTools?: Anthropic.Tool[];
  runExtra?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> | undefined;
  channelRules?: string;
}): Promise<RunResult> {
  const t0 = Date.now();
  const haiku = /haiku/.test(o.model);
  const cp = o.resume?.checkpoint;
  const res: RunResult = {
    outcome: "ok", usage: zeroUsage(), tools: cp ? [...cp.tools] : [], rounds: cp?.rounds ?? 0, transcript: cp ? [...cp.transcript] : [], text: o.resume?.shown ?? "", thinking: "",
    check: cp?.check ?? null, corrected: cp?.corrected ?? false, timing: { modelMs: 0, toolMs: 0, checkMs: 0, firstTextMs: null },
  };
  const messages: Anthropic.MessageParam[] = cp ? structuredClone(cp.messages) : o.history.map((t) => ({ role: t.role, content: t.content }));
  if (cp && o.resume!.shown.length > cp.shownLen) noteOnLast(messages, resumeNote(o.resume!.shown.slice(cp.shownLen)));
  const context = [contextBlock(o.ctx.profile, o.prefs, o.earlier), o.channelRules].filter(Boolean).join("\n\n");
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }, { type: "text", text: context }];
  const allTools = [...toolDefs, ...(o.extraTools ?? [])];
  const tools = allTools.map((t, i) => (i === allTools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
  const given = () => [context, ...o.history.map((t) => t.content), ...res.transcript.map((t) => t.result)].join("\n");
  let timeNoted = cp?.timeNoted ?? false;
  // `moved`: any progress in this run (stall check); `kept`: progress that survives a cut (shown text, a finished round),
  // carried across runs so runs that only restart a call stall out.
  let kept = cp?.movedAt ?? Date.now();
  let moved = kept;
  const write = (t: string) => {
    moved = kept = Date.now();
    res.timing.firstTextMs ??= Date.now() - t0;
    res.text += t;
    o.emit({ type: "text", text: t });
  };
  // Tools that show a block themselves (present_choice_list): straight into the answer, and into the check's sources.
  const ctx: ToolContext = {
    ...o.ctx,
    refs: o.ctx.refs ?? new Map(),
    show: (md) => {
      write(`${res.text && !res.text.endsWith("\n\n") ? "\n\n" : ""}${md}\n\n`);
      res.transcript.push({ tool: "shown", result: md });
    },
  };
  // A copy: the loop goes on changing `messages` while the save waits its turn. At a slice the messages are those of the
  // last finished round, so `shownLen` stays where that round left it (text after it is handed back on resume).
  let shownLen = cp?.shownLen ?? 0;
  let roundsDone = cp?.rounds ?? 0;
  const checkpoint = (atSlice = false) => {
    if (!atSlice) [shownLen, roundsDone] = [res.text.length, res.rounds];
    return (
      o.onCheckpoint?.(
        structuredClone({ messages, shownLen, rounds: roundsDone, tools: res.tools, transcript: res.transcript, timeNoted, check: res.check, corrected: res.corrected, movedAt: kept }),
        res.text,
      ) ?? Promise.resolve()
    );
  };
  // Why a model call was cut: her stop, this run's time slice, the turn's cap, or no progress.
  const cut = new AbortController();
  let cutWhy: "slice" | "cap" | "stall" | null = null;
  const watch = setInterval(() => {
    const now = Date.now();
    cutWhy = now >= o.capAt ? "cap" : now - moved >= (o.stallMs ?? 60_000) ? "stall" : now >= o.sliceAt ? "slice" : null;
    if (cutWhy) cut.abort();
  }, 500);
  const stopFor = async (why: "slice" | "cap" | "stall") => {
    if (why === "slice") {
      await checkpoint(true);
      res.outcome = "checkpoint";
      return res;
    }
    write(`${res.text ? "\n\n" : ""}${PARTIAL}`);
    res.outcome = "partial";
    return res;
  };
  // A first checkpoint at the start: a run cut before any round finishes can still be resumed.
  if (!cp) await checkpoint();
  try {
    for (;;) {
      if (res.rounds >= ASK_MAX_ROUNDS) {
        res.outcome = "max_rounds";
        return res;
      }
      if (cutWhy) return stopFor(cutWhy);
      res.rounds++;
      const late = res.rounds > 1 && Date.now() > o.softAt;
      const final = res.rounds === ASK_MAX_ROUNDS || late;
      if (late && !timeNoted) {
        noteOnLast(messages, TIME_NOTE);
        timeNoted = true;
        o.emit({ type: "status", text: "Putting the answer together…" });
      }
      let msg: Anthropic.Message | null = null;
      // A resumed run carries on the shown text as is (mid-sentence or mid-table): no break before it.
      let sep = !!res.text && !res.text.endsWith("\n") && !(o.resume && res.rounds === (cp?.rounds ?? 0) + 1);
      const tm = Date.now();
      for (let attempt = 0; !msg; attempt++) {
        let shown = false;
        try {
          const stream = o.client.messages.stream(
            {
              model: o.model,
              max_tokens: o.maxOutputTokens,
              system,
              tools,
              ...(final && { tool_choice: { type: "none" as const } }),
              // Haiku 4.5 (a cheap test model) takes neither effort nor adaptive thinking.
              ...(o.deep && !haiku && { thinking: { type: "adaptive" as const, display: "summarized" as const } }),
              ...(!haiku && { output_config: { effort: o.effort } }),
              messages: withCacheMark(messages),
            },
            { signal: AbortSignal.any([o.signal, cut.signal]) },
          );
          stream.on("text", (t) => {
            shown = true;
            if (sep) write("\n\n");
            sep = false;
            write(t);
          });
          // A long tool input (a 30-line list) is progress too.
          stream.on("inputJson", () => {
            moved = Date.now();
          });
          stream.on("thinking", (t) => {
            moved = Date.now();
            res.thinking += t;
            o.emit({ type: "thinking", text: t });
          });
          msg = await stream.finalMessage();
        } catch (e) {
          const wait = 1000 * 3 ** attempt;
          if (!retryable(e) || shown || attempt >= 2 || cutWhy) throw e;
          o.emit({ type: "status", text: "The assistant is busy; retrying…" });
          await sleep(wait);
          moved = Date.now();
        }
      }
      res.timing.modelMs += Date.now() - tm;
      add(res.usage, msg.usage);
      if (res.thinking && !res.thinking.endsWith("\n\n")) res.thinking += "\n\n";

      if (msg.stop_reason === "refusal") {
        write(`${res.text ? "\n\n" : ""}I can't help with that request. I can help with NEET PG counselling: options for your rank, colleges, fees and bonds, seats this round, or your choice list.`);
        res.outcome = "refusal";
        return res;
      }
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason === "max_tokens") {
        // A long answer: keep going in the next round, as a continuation (no lookups).
        messages.push({ role: "assistant", content: msg.content.filter((b) => b.type !== "tool_use") });
        messages.push({ role: "user", content: [{ type: "text", text: "[Seatora: continue your answer exactly where it stopped, without repeating.]" }] });
        await checkpoint();
        continue;
      }
      if (msg.stop_reason !== "tool_use" || !uses.length) {
        // The check: once, on the first finished draft, if a rewrite can still start.
        if (!res.check && o.slugs) {
          const tc = Date.now();
          res.check = checkAnswer(res.text, given(), await o.slugs());
          res.timing.checkMs = Date.now() - tc;
          if (res.check.failed && res.rounds < ASK_MAX_ROUNDS) {
            res.corrected = true;
            o.emit({ type: "status", text: "Double-checking the figures…" });
            o.emit({ type: "replace" });
            res.text = "";
            messages.push({ role: "assistant", content: msg.content });
            messages.push({ role: "user", content: [{ type: "text", text: checkNote(res.check) }] });
            await checkpoint();
            continue;
          }
        }
        return res;
      }

      messages.push({ role: "assistant", content: msg.content });
      const tt = Date.now();
      const results = await Promise.all(
        uses.map(async (u): Promise<Anthropic.ToolResultBlockParam> => {
          res.tools.push(u.name);
          o.emit({ type: "tool", name: u.name, label: toolLabel[u.name as ToolName] ?? "Looking it up…" });
          const r = (await o.runExtra?.(u.name, u.input, ctx)) ?? (await runTool(u.name, u.input, ctx, ASK_TOOL_TIMEOUT_MS));
          moved = kept = Date.now();
          const content = r.ok ? JSON.stringify(r.data) : r.error;
          res.transcript.push({ tool: u.name, result: content });
          return { type: "tool_result", tool_use_id: u.id, content, ...(r.ok ? {} : { is_error: true }) };
        }),
      );
      res.timing.toolMs += Date.now() - tt;
      messages.push({ role: "user", content: results });
      await checkpoint();
    }
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError && !o.signal.aborted && cutWhy) return stopFor(cutWhy);
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { partial: res });
  } finally {
    clearInterval(watch);
  }
}
