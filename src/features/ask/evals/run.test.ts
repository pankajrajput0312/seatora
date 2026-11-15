import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { EvalCase } from "./grade";

// `npm run ask:eval`: the eval set against the real model (Bedrock env loaded) and the real MCC import (DATABASE_URL).
// Spends real money (about 18 questions): the owner runs it after changing prompts, skills or tools. Skipped in `npm test`.
const live = vi.hoisted(() => {
  // No request here: with the site gate on (or closed), the catalog's access check would fail every lookup. Gate off.
  for (const k of ["SITE_ACCESS_SECRET", "SEATORA_OPEN_ACCESS", "SEATORA_ALLOWED_EMAILS"]) delete process.env[k];
  return process.env.ASK_EVAL === "1" && !!process.env.DATABASE_URL && !!process.env.AWS_BEARER_TOKEN_BEDROCK;
});
// Outside a request there is no session: let residents_at read (the route checks the owner in production).
vi.mock("@/features/decide/server/residents", async (orig) => ({ ...(await orig<object>()), canSeeResidents: async () => true, residentsBudget: async () => true }));

const HER = "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE";
// USD per million tokens at Anthropic's list prices for Claude Opus 5.5 (Bedrock bills its own rates).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

it.skipIf(!live)("Ask Seatora evals", { timeout: 30 * 60_000 }, async () => {
  const { db } = await import("@/lib/db");
  const { chooseEffort, runAsk } = await import("../agent");
  const { askClient } = await import("../client");
  const { askConfig } = await import("../config");
  const { grade } = await import("./grade");
  const { profileFromParams } = await import("@/features/decide/profile");
  const cases: EvalCase[] = JSON.parse(readFileSync(path.join(process.cwd(), "src/features/ask/evals/cases.json"), "utf8"));
  const only = process.env.ASK_EVAL_ONLY?.split(",");
  const user = await db.user.create({ data: { email: `ask-eval-${Date.now()}@seatora.test`, name: "Ask eval", passwordHash: "x" } });
  const cfg = askConfig();
  const rows: string[] = [];
  let failed = 0;
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    for (const c of cases.filter((x) => !only || only.includes(x.id))) {
      const profile = profileFromParams(new URLSearchParams(c.profile ?? HER));
      let answer = "";
      const t0 = Date.now();
      const history = [...(c.history ?? []), { role: "user" as const, content: c.question }];
      const r = await runAsk({
        client: askClient(), model: cfg.model, effort: chooseEffort(c.question), maxOutputTokens: cfg.maxOutputTokens, history,
        ctx: { userId: user.id, profile }, signal: AbortSignal.timeout(cfg.timeoutMs * 2), emit: (e) => { if (e.type === "text") answer += e.text; },
      }).catch((e) => ({ outcome: "error" as const, usage: e.partial?.usage ?? total, tools: [], rounds: 0, transcript: [], error: String(e) }));
      const given = [c.question, ...history.map((h) => h.content), profile ? `AIR ${profile.rank}` : "", ...r.transcript.map((t) => t.result)].join("\n");
      const g = r.outcome === "ok" ? grade(c, answer, { tools: r.tools, given }) : { pass: false, failures: [`outcome ${r.outcome}`] };
      if (!g.pass) failed++;
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r.usage[k];
      const cost = (r.usage.input * PRICE.input + r.usage.output * PRICE.output + r.usage.cacheRead * PRICE.cacheRead + r.usage.cacheWrite * PRICE.cacheWrite) / 1e6;
      rows.push(`${g.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(26)} ${String(Date.now() - t0).padStart(6)}ms  in ${r.usage.input} out ${r.usage.output} cacheR ${r.usage.cacheRead} cacheW ${r.usage.cacheWrite}  ~$${cost.toFixed(3)}  tools ${r.tools.join(",") || "-"}${g.pass ? "" : `\n        ${g.failures.join("\n        ")}`}`);
      if (process.env.ASK_EVAL_SHOW === "1") rows.push(`----- ${c.id}\n${answer}\n-----`);
    }
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
  const cost = (total.input * PRICE.input + total.output * PRICE.output + total.cacheRead * PRICE.cacheRead + total.cacheWrite * PRICE.cacheWrite) / 1e6;
  // stdout directly: vitest hides console output of passing tests.
  process.stdout.write(`\n${rows.join("\n")}\n\n${rows.filter((x) => /^(PASS|FAIL)/.test(x)).length - failed} passed, ${failed} failed · tokens in ${total.input} out ${total.output} cacheRead ${total.cacheRead} cacheWrite ${total.cacheWrite} · ~$${cost.toFixed(2)} at list prices\n\n`);
  expect(failed).toBe(0);
});
