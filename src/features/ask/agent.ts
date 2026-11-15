import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { Profile } from "@/features/decide/profile";
import { zeroUsage, type Outcome, type Usage } from "./budget";
import type { AskClient } from "./client";
import { ASK_MAX_INPUT_CHARS, ASK_MAX_ROUNDS, ASK_MAX_TURNS, ASK_TOOL_TIMEOUT_MS } from "./config";
import { skillIndex, loadSkills } from "./skills";
import type { ChatEvent } from "./sse";
import { runTool, toolDefs, toolLabel, type ToolContext, type ToolName } from "./tools";

// The assistant's loop: stream a reply, run the tools it asks for, send their results, repeat (at most ASK_MAX_ROUNDS
// model calls). The system prompt and tools are one stable, cached prefix; her profile and the date come after it.

export type ChatTurn = { role: "user" | "assistant"; content: string };
/** The chat request body (POST /api/ask/chat). */
const turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(30_000) });
export const chatBodySchema = z.object({
  messages: z
    .array(turn)
    .min(1)
    .max(ASK_MAX_TURNS * 2 + 1)
    .refine((m) => m.at(-1)!.role === "user", "The last message must be hers")
    .refine((m) => m.at(-1)!.content.length <= ASK_MAX_INPUT_CHARS, `A question is at most ${ASK_MAX_INPUT_CHARS} characters`),
  /** The page's query string (profile params: rank, cat, sp…). */
  profile: z.string().max(4000).default(""),
});

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

Saving: never call save_choice_list unless her latest message clearly says yes to saving (and replace vs append); otherwise ask first.

Skills you can load:
`;

/** The cached part of the system prompt: rules + the skills' names and descriptions. */
export const systemPrompt = () => RULES + skillIndex(loadSkills());

function profileLine(p: Profile | null) {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  if (!p) return `Today is ${today} (IST). Her profile has no rank yet.`;
  return `Today is ${today} (IST). Her profile (get_profile has the details): AIR ${formatRank(p.rank)}, ${p.category}${p.pwd ? " PwD" : ""}.`;
}

/** "medium" for advice and planning, "low" for lookups and chit-chat. */
export function chooseEffort(question: string): "low" | "medium" {
  return /\b(should|worth|better|best|compare|vs|versus|choose|choice|choices|list|plan|strategy|order|recommend|advice|advise|report|wishlist|which|safe|realistic|dream)\b/i.test(question) ? "medium" : "low";
}

/** Rough tokens of a string (≈4 characters a token for English). */
export const roughTokens = (s: string) => Math.ceil(s.length / 4);

/** The newest turns within `budget` rough tokens and `maxTurns` messages, starting with a user turn. */
export function trimHistory(turns: ChatTurn[], budget: number, maxTurns: number): ChatTurn[] {
  const out: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < maxTurns; i--) {
    used += roughTokens(turns[i].content);
    if (used > budget && out.length) break;
    out.unshift(turns[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
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

export type RunResult = { outcome: Outcome; usage: Usage; tools: string[]; rounds: number; transcript: { tool: string; result: string }[] };

/**
 * Runs the loop, emitting text deltas and tool activity. Ends with outcome ok, refusal, max_tokens or max_rounds;
 * API errors (rate limits, timeouts, aborts) are thrown for the route to classify, with the usage so far on `partial`.
 */
export async function runAsk(o: {
  client: AskClient;
  model: string;
  effort: "low" | "medium";
  maxOutputTokens: number;
  history: ChatTurn[];
  ctx: ToolContext;
  signal: AbortSignal;
  emit: (e: AskEvent) => void;
}): Promise<RunResult> {
  const res: RunResult = { outcome: "ok", usage: zeroUsage(), tools: [], rounds: 0, transcript: [] };
  const messages: Anthropic.MessageParam[] = o.history.map((t) => ({ role: t.role, content: t.content }));
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
    { type: "text", text: profileLine(o.ctx.profile) },
  ];
  const tools = toolDefs.map((t, i) => (i === toolDefs.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
  let wrote = false;
  try {
    for (let round = 0; round < ASK_MAX_ROUNDS; round++) {
      res.rounds = round + 1;
      const last = round === ASK_MAX_ROUNDS - 1;
      const stream = o.client.messages.stream(
        {
          model: o.model,
          max_tokens: o.maxOutputTokens,
          system,
          tools,
          // The last round must answer with what it has.
          ...(last && { tool_choice: { type: "none" as const } }),
          output_config: { effort: o.effort },
          messages: withCacheMark(messages),
        },
        { signal: o.signal },
      );
      let sep = wrote;
      stream.on("text", (t) => {
        if (sep) o.emit({ type: "text", text: "\n\n" });
        sep = false;
        wrote = true;
        o.emit({ type: "text", text: t });
      });
      const msg = await stream.finalMessage();
      add(res.usage, msg.usage);

      if (msg.stop_reason === "refusal") {
        o.emit({ type: "text", text: `${wrote ? "\n\n" : ""}I can't help with that request. I can help with NEET PG counselling: options for your rank, colleges, fees and bonds, seats this round, or your choice list.` });
        res.outcome = "refusal";
        return res;
      }
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason === "max_tokens") {
        o.emit({ type: "text", text: `${wrote ? "\n\n" : ""}_(The answer was cut short. Ask a narrower question, e.g. one course or one college.)_` });
        res.outcome = "max_tokens";
        return res;
      }
      if (msg.stop_reason !== "tool_use" || !uses.length) return res;

      messages.push({ role: "assistant", content: msg.content });
      const results = await Promise.all(
        uses.map(async (u): Promise<Anthropic.ToolResultBlockParam> => {
          res.tools.push(u.name);
          o.emit({ type: "tool", name: u.name, label: toolLabel[u.name as ToolName] ?? "Looking it up…" });
          const r = await runTool(u.name, u.input, o.ctx, ASK_TOOL_TIMEOUT_MS);
          const content = r.ok ? JSON.stringify(r.data) : r.error;
          res.transcript.push({ tool: u.name, result: content });
          return { type: "tool_result", tool_use_id: u.id, content, ...(r.ok ? {} : { is_error: true }) };
        }),
      );
      messages.push({ role: "user", content: results });
    }
    res.outcome = "max_rounds";
    return res;
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { partial: res });
  }
}
