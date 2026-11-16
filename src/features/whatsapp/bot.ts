import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { chooseEffort, runAsk, trimHistory } from "@/features/ask/agent";
import { finishAsk, startAsk } from "@/features/ask/budget";
import { askClient } from "@/features/ask/client";
import { ASK_MAX_TURNS, askConfig } from "@/features/ask/config";
import { resolveCourses } from "@/features/ask/lookup";
import { finishTurn, getPreferences, RETENTION_DAYS, startTurn } from "@/features/ask/memory";
import type { ToolContext, ToolResult } from "@/features/ask/tools";
import { hashPassword } from "@/features/auth/lib/password";
import { profileSchema, type Profile } from "@/features/decide/profile";
import { getDecideData, getMeta } from "@/features/decide/service";
import { baseCategories } from "@/features/decide/types";
import { checkAndCount } from "@/features/plans/usage";
import { db } from "@/lib/db";
import { sendChoices, sendText, toWhatsApp, type Choice, type Incoming } from "./cloud-api";

// Ask Seatora on WhatsApp: the same assistant, tools, memory and plan limits as the Ask page, with two tools of its own
// (offer_choices: buttons and lists; update_profile: her rank, category and courses) and rules for short chat messages.
// Each number is one Seatora account (User.phone), made on its first message. One rolling chat per number.

/** The voice agent's chat rules (gsy-voice-agent creator_agent STYLE, 10_rules, 60_conversation), for NEET PG. */
const RULES = `This chat is on WhatsApp, not the Ask page:
- Short messages: 1 to 6 short lines, plain words, at most one emoji. WhatsApp formatting only: *bold*, lines starting "• " or "1.". No tables, no headings. A longer answer (a list of colleges) is at most 8 lines, best first, then offer more.
- One question per message; the test is the word "and". Never repeat her answer back before the next question. Never open two messages the same way.
- When the answer is one of a few fixed options (category, a course from a short list, yes/no, what next), call offer_choices: your text is then only a short lead-in, or empty. Open answers (rank, score, a college name) she types.
- A greeting or a first message with no question: one line saying you are Seatora's NEET PG counselling assistant, then offer_choices "My chances", "College info", "Fees & bonds".
- Her options or chances with no profile (no rank below): ask one at a time, course first (offer_choices with up to 9 common courses and "Other (type it)"), then category (offer_choices: Open, OBC, EWS, SC, ST), then her NEET PG AIR (she types it). Then call update_profile with all of it, then assess_chances. She can change any of them later the same way.
- A college she names that matches several: offer_choices with each one (title a short name, description the full name and state).
- Reply in the language and script she writes in (English, Hindi or Hinglish). Asked whether you are a bot: say so honestly.
- Never ask her to send a document, photo or payment. Links are fine; the site is https://www.seatora.co.in.`;

const choicesInput = z.strictObject({
  question: z.string().min(1).max(1024).describe("The question, shown above the buttons or list"),
  options: z.array(z.strictObject({ title: z.string().min(1).max(24), description: z.string().max(72).optional() })).min(2).max(10).describe("2-3 options (titles ≤ 20) show as buttons; 4-10 as a list"),
});
const profileInput = z.strictObject({
  rank: z.number().int().min(1).max(300000).optional().describe("NEET PG AIR"),
  category: z.enum(baseCategories).optional(),
  pwd: z.boolean().optional(),
  courses: z.array(z.string().min(1).max(80)).max(12).optional().describe("Course or specialty names, e.g. 'MD Radiodiagnosis', 'Anaesthesiology' (every degree)"),
});
const schema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input" }) as Anthropic.Tool.InputSchema;
const extraTools: Anthropic.Tool[] = [
  { name: "offer_choices", description: "Shows her tappable options on WhatsApp (buttons or a list). Her tap comes back as her next message, the option's title.", input_schema: schema(choicesInput) },
  { name: "update_profile", description: "Saves her AIR, category, PwD and courses to her Seatora profile (what assess_chances and search_options use by default). The first save needs rank.", input_schema: schema(profileInput) },
];

/** The rolling chat: her latest WhatsApp chat still within retention, else a new one. */
async function chatOf(userId: string) {
  const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const c = await db.askConversation.findFirst({ where: { userId, title: "WhatsApp", updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  return c?.id ?? (await db.askConversation.create({ data: { userId, title: "WhatsApp" }, select: { id: true } })).id;
}

/** The account of this number, made on its first message (placeholder email, a password nobody knows). */
async function accountOf(phone: string, name: string | null) {
  const found = await db.user.findUnique({ where: { phone } });
  if (found) return found;
  try {
    return await db.user.create({
      data: { phone, email: `wa-${phone}@whatsapp.seatora.co.in`, name: name?.slice(0, 80) || "Doctor", passwordHash: await hashPassword(randomBytes(32).toString("hex")), createdVia: "whatsapp" },
    });
  } catch (e) {
    // Two first messages at once: the other made it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return db.user.findUniqueOrThrow({ where: { phone } });
    throw e;
  }
}

async function saveProfile(userId: string, current: Profile | null, input: z.infer<typeof profileInput>): Promise<Profile> {
  let pairs = current?.pairs;
  if (input.courses?.length) {
    const m = await getMeta();
    const r = resolveCourses(input.courses, m.courses, m.degrees);
    if (r.unknown.length) throw new Error(`Unknown course: ${r.unknown.join(", ")}. Use names like 'MD General Medicine' or a specialty name, or ask her.`);
    pairs = r.pairs;
  }
  const rank = input.rank ?? current?.rank;
  if (!rank) throw new Error("No rank yet: ask her NEET PG AIR first, then save everything together.");
  const p = profileSchema.parse({
    rank,
    category: input.category ?? current?.category ?? "Open",
    pwd: input.pwd ?? current?.pwd ?? false,
    specialties: pairs ? [...new Set(pairs.map((x) => x.split("~")[1]))] : (current?.specialties ?? []),
    degrees: pairs ? [...new Set(pairs.map((x) => x.split("~")[0]))] : (current?.degrees ?? []),
    ...(pairs?.length ? { pairs } : {}),
    quotas: current?.quotas ?? [],
    states: current?.states ?? [],
    maxFeeLakh: current?.maxFeeLakh ?? null,
    maxBondYears: current?.maxBondYears ?? null,
  });
  const json = p as unknown as Prisma.InputJsonValue;
  await db.userProfile.upsert({ where: { userId }, create: { userId, json, updatedAt: new Date() }, update: { json, updatedAt: new Date() } });
  return p;
}

/** One WhatsApp message in, the assistant's reply out (text, then any options). A repeated delivery is ignored. */
export async function handleMessage(m: Incoming) {
  if (!m.text) return sendText(m.phone, "I can read text messages only for now. Please type your question.");
  const cfg = askConfig();
  const user = await accountOf(m.phone, m.name);
  // Meta redelivers until it gets a 200: the message id is the turn's request id, so a repeat never runs twice.
  const requestId = createHash("sha256").update(m.id).digest("hex").slice(0, 40);
  const turn = await startTurn(user.id, { conversationId: await chatOf(user.id), requestId, question: m.text.slice(0, 2000) });
  if (!turn.ok || turn.existing) return;

  const q = await checkAndCount(user.id, "ask", undefined, { account: user });
  if (!q.allowed) {
    const message = `You've asked today's ${q.limit} questions on your plan. More at 00:00 IST, or get the Season Pass: https://www.seatora.co.in/pricing`;
    await finishTurn(turn.answerId, { content: message, thinking: null, status: "error" });
    return sendText(m.phone, message);
  }
  const effort = chooseEffort(m.text);
  const started = await startAsk(user.id, { model: cfg.model, effort }, { hourly: cfg.hourlyRequests, daily: cfg.dailyTokens });
  if (!started.ok) {
    await finishTurn(turn.answerId, { content: "limit", thinking: null, status: "error" });
    return sendText(m.phone, "You've reached the limit for now. Please try again in a while.");
  }

  const saved = await db.userProfile.findUnique({ where: { userId: user.id } });
  const profile = saved ? (profileSchema.safeParse(saved.json).data ?? null) : null;
  const { kept, earlier } = trimHistory([...turn.history, { role: "user", content: m.text }], cfg.historyTokens, ASK_MAX_TURNS * 2);
  let choices: z.infer<typeof choicesInput> | null = null;
  const runExtra = (name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> | undefined => {
    if (name === "offer_choices") {
      const r = choicesInput.safeParse(input);
      if (!r.success) return Promise.resolve({ ok: false, error: r.error.issues[0]?.message ?? "invalid" });
      choices = r.data;
      return Promise.resolve({ ok: true, data: { shown: true, note: "She sees these after your text; her tap is her next message." } });
    }
    if (name === "update_profile") {
      const r = profileInput.safeParse(input);
      if (!r.success) return Promise.resolve({ ok: false, error: r.error.issues[0]?.message ?? "invalid" });
      return saveProfile(user.id, ctx.profile, r.data).then(
        (p) => ((ctx.profile = p), { ok: true as const, data: { saved: p } }),
        (e: Error) => ({ ok: false as const, error: e.message }),
      );
    }
    return undefined;
  };

  const t0 = Date.now();
  let text = "";
  let status: "done" | "error" = "done";
  let result: Awaited<ReturnType<typeof runAsk>> | null = null;
  try {
    // One run, no checkpoints: a chat reply is short, and nobody is waiting to tap Continue.
    result = await runAsk({
      client: askClient(), model: cfg.model, effort, maxOutputTokens: cfg.maxOutputTokens,
      history: kept, earlier, prefs: await getPreferences(user.id), ctx: { userId: user.id, profile }, signal: new AbortController().signal,
      emit: (e) => {
        if (e.type === "text") text += e.text;
        else if (e.type === "replace") text = "";
      },
      softAt: t0 + cfg.softMs, sliceAt: t0 + 240_000, capAt: t0 + 240_000, stallMs: cfg.stallMs,
      slugs: async () => new Set((await getDecideData()).colleges.map((c) => c.slug)),
      extraTools, runExtra, channelRules: RULES,
    });
  } catch (e) {
    status = "error";
    const x = e as { name?: string; status?: number; message?: string };
    console.error("[whatsapp] ask failed", x.name, x.status ?? "", String(x.message ?? e).slice(0, 300));
    text = "Sorry, I couldn't answer that right now. Please send it again in a minute.";
  }
  const offered = choices as z.infer<typeof choicesInput> | null;
  await finishTurn(turn.answerId, { content: text + (offered ? `\n\n[Options: ${offered.options.map((o) => o.title).join(" | ")}]` : ""), thinking: null, status });
  if (result) {
    const { usage, tools, rounds, check, corrected, timing } = result;
    const outcome = result.outcome === "checkpoint" ? "partial" : result.outcome;
    await finishAsk(started.id, { usage, tools, rounds, latencyMs: Date.now() - t0, outcome, conversationId: turn.conversationId, check, corrected, timing }).catch(() => console.error("[whatsapp] log write failed"));
  }
  if (text.trim()) await sendText(m.phone, toWhatsApp(text));
  if (offered) await sendChoices(m.phone, toWhatsApp(offered.question), offered.options as Choice[]);
}
