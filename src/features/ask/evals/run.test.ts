import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Checkpoint, RunResult } from "../agent";
import { recordingClient, replayClient, type RecordedCall } from "./fixture-client";
import type { EvalCase } from "./grade";

// `npm run ask:eval`: the eval set against the real model (Bedrock env loaded) and the real MCC import (DATABASE_URL).
// Spends real money (about 24 questions): the owner runs it after changing prompts, skills or tools. ASK_EVAL_RECORD=1
// also saves each case's model calls to fixtures/<id>.json; `npm run ask:eval:replay` replays those (no Bedrock call:
// the tools, the check and the grader run for real). Skipped in `npm test`.
const { live, replay, record } = vi.hoisted(() => {
  // No request here: with the site gate on (or closed), the catalog's access check would fail every lookup. Gate off.
  for (const k of ["SITE_ACCESS_SECRET", "SEATORA_OPEN_ACCESS", "SEATORA_ALLOWED_EMAILS"]) delete process.env[k];
  const db = !!process.env.DATABASE_URL;
  const replay = process.env.ASK_EVAL === "replay" && db;
  return { replay, record: process.env.ASK_EVAL_RECORD === "1", live: replay || (process.env.ASK_EVAL === "1" && db && !!process.env.AWS_BEARER_TOKEN_BEDROCK) };
});
// Outside a request there is no session: let residents_at read (the route checks the owner in production).
vi.mock("@/features/decide/server/residents", async (orig) => ({ ...(await orig<object>()), canSeeResidents: async () => true, residentsBudget: async () => true }));

const HER = "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE";
// USD per million tokens at Anthropic's list prices for Claude Opus 5.5 (Bedrock bills its own rates).
const PRICES = { opus: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }, haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } };

it.skipIf(!live)("Ask Seatora evals", { timeout: 30 * 60_000 }, async () => {
  const { db } = await import("@/lib/db");
  const { chooseEffort, runAsk } = await import("../agent");
  const { askClient } = await import("../client");
  const { askConfig } = await import("../config");
  const { grade } = await import("./grade");
  const { profileFromParams } = await import("@/features/decide/profile");
  const { getDecideData } = await import("@/features/decide/service");
  const slugs = async () => new Set((await getDecideData()).colleges.map((x) => x.slug));
  const cases: EvalCase[] = JSON.parse(readFileSync(path.join(process.cwd(), "src/features/ask/evals/cases.json"), "utf8"));
  const only = process.env.ASK_EVAL_ONLY?.split(",");
  const user = await db.user.create({ data: { email: `ask-eval-${Date.now()}@seatora.test`, name: "Ask eval", passwordHash: "x" } });
  const cfg = askConfig();
  const PRICE = /haiku/.test(cfg.model) ? PRICES.haiku : PRICES.opus;
  const rows: string[] = [];
  let failed = 0;
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    const fixtures = path.join(process.cwd(), "src/features/ask/evals/fixtures");
    for (const c of cases.filter((x) => !only || only.includes(x.id))) {
      const file = path.join(fixtures, `${c.id}.json`);
      if (replay && !existsSync(file)) {
        rows.push(`SKIP  ${c.id.padEnd(26)} no recorded fixture`);
        continue;
      }
      const recorded: RecordedCall[] = replay ? JSON.parse(readFileSync(file, "utf8")) : [];
      const client = replay ? replayClient(recorded) : record ? recordingClient(askClient(), recorded) : askClient();
      const profile = profileFromParams(new URLSearchParams(c.profile ?? HER));
      let answer = "";
      const t0 = Date.now();
      const history = [...(c.history ?? []), { role: "user" as const, content: c.question }];
      // Run by run, as the route does: a run that reaches its slice resumes from its checkpoint (ASK_SLICE_MS small = the resume path).
      let cp: Checkpoint | null = null;
      let r!: RunResult & { error?: string };
      let segments = 0;
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      do {
        const t1 = Date.now();
        const resume: { checkpoint: Checkpoint; shown: string } | undefined = cp ? { checkpoint: cp, shown: answer } : undefined;
        r = await runAsk({
          client, model: cfg.model, effort: chooseEffort(c.question, c.deep), deep: c.deep, maxOutputTokens: cfg.maxOutputTokens, history,
          ctx: { userId: user.id, profile }, signal: new AbortController().signal,
          emit: (e) => { if (e.type === "text") answer += e.text; else if (e.type === "replace") answer = ""; },
          softAt: t0 + (c.deep ? cfg.deepSoftMs : cfg.softMs), sliceAt: t1 + cfg.sliceMs, capAt: t0 + cfg.capMs, stallMs: cfg.stallMs, resume,
          onCheckpoint: async (x) => { cp = x; }, slugs,
        }).catch((e) => ({ ...(e.partial as RunResult), outcome: "error" as const, error: String(e) }));
        for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += r.usage?.[k] ?? 0;
        answer = r.text ?? answer;
        segments++;
      } while (r.outcome === "checkpoint" && segments < 20);
      r = { ...r, usage };
      const given = [c.question, ...history.map((h) => h.content), profile ? `AIR ${profile.rank}` : "", ...r.transcript.map((t) => t.result)].join("\n");
      const g = r.outcome === "ok" ? grade(c, answer, { tools: r.tools, given }) : { pass: false, failures: [`outcome ${r.outcome}${r.error ? `: ${r.error}` : ""}`] };
      if (c.expect.minSegments && segments < c.expect.minSegments) { g.pass = false; g.failures.push(`ran in ${segments} run(s); want ${c.expect.minSegments}+ (set ASK_SLICE_MS small)`); }
      const ms = Date.now() - t0;
      if (c.expect.maxMs && ms > c.expect.maxMs) { g.pass = false; g.failures.push(`took ${ms} ms (max ${c.expect.maxMs})`); }
      if (!g.pass) failed++;
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r.usage[k];
      const cost = (r.usage.input * PRICE.input + r.usage.output * PRICE.output + r.usage.cacheRead * PRICE.cacheRead + r.usage.cacheWrite * PRICE.cacheWrite) / 1e6;
      rows.push(`${g.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(26)} ${String(ms).padStart(6)}ms ${segments} run${segments > 1 ? "s" : ""}${r.check ? ` check ${r.check.passed}/${r.check.passed + r.check.failed}` : ""}  in ${r.usage.input} out ${r.usage.output} cacheR ${r.usage.cacheRead} cacheW ${r.usage.cacheWrite}  ~$${cost.toFixed(3)}  tools ${r.tools.join(",") || "-"}${g.pass ? "" : `\n        ${g.failures.join("\n        ")}`}`);
      if (record && !replay) {
        mkdirSync(fixtures, { recursive: true });
        writeFileSync(file, JSON.stringify(recorded));
      }
      if (process.env.ASK_EVAL_SHOW === "1") rows.push(`----- ${c.id}\n${answer}\n-----`);
    }
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
  const cost = (total.input * PRICE.input + total.output * PRICE.output + total.cacheRead * PRICE.cacheRead + total.cacheWrite * PRICE.cacheWrite) / 1e6;
  // stdout directly: vitest hides console output of passing tests.
  process.stdout.write(`\n${rows.join("\n")}\n\n${rows.filter((x) => /^(PASS|FAIL)/.test(x)).length - failed} passed, ${failed} failed · tokens in ${total.input} out ${total.output} cacheRead ${total.cacheRead} cacheWrite ${total.cacheWrite} · ~$${cost.toFixed(2)} at list prices${replay ? " (recorded; nothing spent now)" : ""}\n\n`);
  expect(failed).toBe(0);
});
