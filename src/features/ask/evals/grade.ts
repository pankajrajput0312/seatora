import { bigNumbers } from "../check";

// The Ask eval grader (deterministic): every big number in the answer must appear in what the model was given (tool
// results, the question, her profile), required tools must have run, required links and words must be there, forbidden
// content must not.

export type EvalCase = {
  id: string;
  question: string;
  /** Deep analysis mode. */
  deep?: boolean;
  /** Earlier turns (text only, as the browser sends them). */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Profile query string; default her profile. */
  profile?: string;
  expect: {
    /** At least one of each group must have been called, e.g. [["last_ranks", "college_profile"]]. */
    tools?: string[][];
    /** Tools that must not run. */
    noTools?: string[];
    /** Substrings that must appear in the answer (links included). */
    contains?: string[];
    /** Regexes (case-insensitive) that must not match the answer. */
    forbidden?: string[];
    /** Check every number ≥ 1,000 (not a year) against the given text; default true. */
    numbers?: boolean;
    /** End to end, ms. */
    maxMs?: number;
    /** At least this many numbered table rows ("| 12 |") in the answer. */
    minRows?: number;
    /** Each group: at least one of its substrings (case-insensitive) is in the answer. */
    anyOf?: string[][];
    /** At least this many runs (checkpoint → resume); meaningful with a small ASK_SLICE_MS. */
    minSegments?: number;
  };
};

export type Graded = { pass: boolean; failures: string[] };

export function grade(c: EvalCase, answer: string, run: { tools: string[]; given: string }): Graded {
  const failures: string[] = [];
  const e = c.expect;
  // A lookup that crashed (runTool's generic message) makes the case meaningless: the model can only apologise.
  if (run.given.includes("The data lookup failed")) failures.push("a tool lookup failed (data unavailable)");
  for (const group of e.tools ?? []) if (!group.some((t) => run.tools.includes(t))) failures.push(`expected a call to ${group.join(" or ")}`);
  for (const t of e.noTools ?? []) if (run.tools.includes(t)) failures.push(`must not call ${t}`);
  const lower = answer.toLowerCase();
  for (const s of e.contains ?? []) if (!lower.includes(s.toLowerCase())) failures.push(`missing "${s}"`);
  for (const f of e.forbidden ?? []) if (new RegExp(f, "i").test(answer)) failures.push(`forbidden /${f}/`);
  for (const g of e.anyOf ?? []) if (!g.some((x) => lower.includes(x.toLowerCase()))) failures.push(`none of ${g.map((x) => `"${x}"`).join(", ")}`);
  const rows = answer.match(/^\|\s*\d+\s*\|/gm)?.length ?? 0;
  if (e.minRows && rows < e.minRows) failures.push(`only ${rows} numbered rows (want ${e.minRows})`);
  if (e.numbers !== false) {
    const known = new Set(bigNumbers(run.given));
    const unknown = [...new Set(bigNumbers(answer))].filter((n) => !known.has(n));
    if (unknown.length) failures.push(`numbers not in any tool result: ${unknown.slice(0, 8).join(", ")}`);
  }
  return { pass: failures.length === 0, failures };
}

export { bigNumbers };
