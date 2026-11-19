// INI-CET's "Also in NEET PG counselling?" guide: the official rules where MCC's NEET PG counselling and AIIMS's INI-CET
// counselling meet (neetpg-planner data/exams/ini-cet/facts/crossover.json, copied as ./ini-cet-crossover.json; every
// rule with its verbatim quote, document, page and link). Server-only, like the rest of INI-CET: staff's pages only,
// never in a member's JS. Its MCC rules also make NEET PG's "What you risk" lines (./held-risk.ts), server-rendered. Validated on load; a file that doesn't fit throws (a deploy check, never a half-shown guide).
import "server-only";
import { z } from "zod";
import type { BaseCategory } from "@/features/decide/types";
import raw from "./ini-cet-crossover.json";

const rule = z.object({ id: z.string(), body: z.string(), applies_when: z.string(), rule: z.string(), quote: z.string(), url: z.url(), page: z.number().int().positive(), session: z.string(), doc: z.string(), institute: z.string().optional() });
const notFound = z.object({ id: z.string(), body: z.string(), question: z.string(), checked_in: z.array(z.string()), note: z.string() });
/** Two documents that say a thing two ways: `between` names their rules. Optional (the file may carry none). */
const contradiction = z.object({ id: z.string(), between: z.array(z.string()).optional(), note: z.string().optional(), text: z.string().optional() }).passthrough();
const source = z.object({ title: z.string(), url: z.url(), date: z.string().optional(), session: z.string().optional() }).passthrough();
const schema = z.object({
  topic: z.string(),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.record(z.string(), z.string()),
  sources: z.record(z.string(), source),
  rules: z.array(rule).min(1),
  not_found: z.array(notFound),
  contradictions: z.array(contradiction).optional(),
});
export type CrossoverRule = z.infer<typeof rule>;

const data = schema.parse(raw);

/**
 * The guide's stages, in the order they bite for someone in both counsellings (the owner's order, 19 Nov 2026); a rule
 * the list doesn't name goes to the last stage, so a new rule in the file is never dropped.
 */
const stages: { title: string; ids: string[] }[] = [
  { title: "MCC Round 1 and Round 2 (Round 2 on hold)", ids: ["mcc_r2_on_hold", "mcc_schedule_dates", "mcc_resign_r1_r2_only", "mcc_withdrawal_user_guide", "mcc_deposit_forfeit_r2_onwards", "mcc_deposit_amounts", "mcc_r2_upgrade_loses_r1", "mcc_r2_exit_then_r3", "mcc_r2_resign_state_flowchart"] },
  { title: "MCC Round 3", ids: ["mcc_r3_holder_ineligible", "mcc_r3_upgrade_no_claim", "mcc_r3_no_resign", "mcc_r3_no_resign_annexure"] },
  { title: "MCC stray round", ids: ["mcc_stray_eligibility", "mcc_stray_must_join", "mcc_stray_state_data_sharing"] },
  { title: "Original certificates: both want them", ids: ["mcc_originals_needed_to_join", "mcc_originals_retained", "aiims_report_originals_or_3l", "aiims_r1_dd_five_days", "aiims_new_r2_dd_five_days", "aiims_r2_noshow_originals_buyback", "aiims_originals_held_3l"] },
  { title: "INI-CET: already doing or done an MD/MS", ids: ["aiims_pursuing_pg_excluded"] },
  { title: "INI-CET Round 1 and Round 2", ids: ["aiims_rounds_and_dates", "aiims_two_rounds_plus_open", "aiims_last_date_admission", "aiims_no_refusal_r1", "aiims_not_joining_penalty", "aiims_r2_noshow_dd_forfeit"] },
  { title: "Leaving an INI-CET seat", ids: ["aiims_institute_rules_govern", "aiims_leaving_penalty", "aiims_jodhpur_penalty", "aiims_vacated_not_refilled", "jipmer_leaving_penalty", "pgimer_leaving_penalty", "nimhans_leaving_penalty", "sctimst_bond_50l"] },
  { title: "INI-CET Open Round", ids: ["aiims_open_round_deemed_resignation", "aiims_open_round_not_joining", "aiims_open_round_result_penalty", "aiims_open_round_refund", "jipmer_open_round_penalty"] },
  { title: "Other rules", ids: ["mcc_round_rules_apply", "mcc_refund_after_all_rounds", "mcc_college_terms_not_mcc", "mcc_afms_debarment", "mcc_state_rules_are_states"] },
];
/** Rules whose time had passed at the check (19 Nov 2026: Round 1's free exit, its resignation window closed 9 Nov): a closed group at the end. */
const OVER = ["mcc_r1_free_exit", "mcc_r1_free_exit_faq", "mcc_r1_resign_window_2026"];
/** MCC's Round 2 rules tied to dates that may move: said "as of" the check, with Notice No. 10's hold. */
const TIME_BOUND = new Set(["mcc_r2_on_hold", "mcc_schedule_dates"]);
/** Words of the file's own a rule adds that its document doesn't say: left out (the AFMS rule's "It does not bar you from NEET PG."). */
const NOT_IN_DOCUMENT: Record<string, string> = { mcc_afms_debarment: " It does not bar you from NEET PG." };

const byId = new Map(data.rules.map((r) => [r.id, { ...r, rule: NOT_IN_DOCUMENT[r.id] ? r.rule.replace(NOT_IN_DOCUMENT[r.id], "") : r.rule }]));
const placed = new Set([...stages.flatMap((s) => s.ids), ...OVER]);
const unplaced = [...byId.values()].filter((r) => !placed.has(r.id));

/**
 * The bottom line, from the documents' rules only (no advice beyond them): each line links the rules (or the
 * "not stated" question) it is made of. A link to an id the file no longer has throws (a deploy check).
 */
const bottomLine: { text: string; refs: [id: string, label: string][] }[] = [
  {
    text: "Joining an MCC seat before INI-CET seat allocation can put your INI-CET seat at risk: AIIMS does not consider anyone who has done or is \u201cpursuing\u201d an MD/MS \u201cat the time of seat allocation\u201d, and does not say what \u201cpursuing\u201d means.",
    refs: [["aiims_pursuing_pg_excluded", "the rule"], ["aiims_pursuing_definition", "not defined"]],
  },
  {
    text: "Your originals can be in one place only: MCC will not let you join without them (a letter that another institute has them is not accepted); AIIMS takes them, or a \u20b93 lakh DD with the originals due in five days. Hold both seats and one side has your originals.",
    refs: [["mcc_originals_needed_to_join", "MCC"], ["aiims_report_originals_or_3l", "AIIMS"], ["aiims_r1_dd_five_days", "five days"]],
  },
  { text: "An MCC Round 3 seat cannot be resigned once you join it.", refs: [["mcc_r3_no_resign", "the rule"]] },
  {
    text: "Leaving an INI-CET seat costs \u20b93 lakh within six months of joining, \u20b95 lakh after (JIPMER: \u20b93 lakh from depositing the originals); more at NIMHANS (up to \u20b97 lakh) and SCTIMST (a \u20b950 lakh bond if you discontinue).",
    refs: [["aiims_leaving_penalty", "AIIMS"], ["jipmer_leaving_penalty", "JIPMER"], ["pgimer_leaving_penalty", "PGIMER"], ["nimhans_leaving_penalty", "NIMHANS"], ["sctimst_bond_50l", "SCTIMST"]],
  },
];
for (const [id] of bottomLine.flatMap((l) => l.refs)) if (!byId.has(id) && !data.not_found.some((n) => n.id === id)) throw new Error(`crossover: the bottom line links ${id}, not in the file`);

/** MCC's security deposits, from its rule's own figures (null where its words changed: no line for her then). */
const deposit = ((t) => {
  const fig = (re: RegExp) => t.match(re)?.[1] ?? null;
  return { open: fig(/Rs ([\d,]+) \(AIQ, UR\/EWS\)/), reserved: fig(/Rs ([\d,]+) \(AIQ, reserved\)/), deemed: fig(/Rs ([\d,]+) if you registered for Deemed/) };
})(byId.get("mcc_deposit_amounts")?.rule ?? "");

/** Two of its rules the documents themselves don't reconcile: the file's own list, else the rules that say so in their words. */
const contradictions = (data.contradictions ?? []).length
  ? data.contradictions!.map((c) => ({ id: c.id, text: c.note ?? c.text ?? "", rules: (c.between ?? []).flatMap((id) => byId.get(id) ?? []) }))
  : data.rules.filter((r) => /do not reconcile|contradict/i.test(r.rule)).map((r) => ({ id: r.id, text: r.rule, rules: [r, ...data.rules.filter((x) => x.id !== r.id && r.rule.includes(x.id))] }));

/** A rule's or note's words for a reader: a reference to another rule by its id ("(mcc_deposit_forfeit_r2_onwards)") left out. */
const words = (s: string) => s.replace(/\s*\(([a-z0-9]+(?:_[a-z0-9]+)+)\)/g, (m, id: string) => (byId.has(id) || data.not_found.some((n) => n.id === id) ? "" : m));

export const crossover = {
  words,
  topic: data.topic,
  checked: data.checked,
  notes: data.notes,
  sources: data.sources,
  stages: stages.map((s, i) => ({ title: s.title, rules: [...s.ids.flatMap((id) => byId.get(id) ?? []), ...(i === stages.length - 1 ? unplaced : [])] })).filter((s) => s.rules.length),
  notFound: data.not_found,
  over: OVER.flatMap((id) => byId.get(id) ?? []),
  bottomLine: bottomLine.map((l) => ({ ...l, july2026: l.refs.some(([id]) => /July 2026/.test(byId.get(id)?.session ?? "")) })),
  /** The rule that carries her own deposit (`depositOf`). */
  depositRule: "mcc_deposit_amounts",
  /**
   * Her MCC security deposit from the rule's figures: UR/EWS, or reserved (OBC, SC, ST), with the Deemed one; null when
   * her category doesn't settle it (PwD in UR/EWS: the rule's words don't say) or a figure is missing.
   */
  depositOf: (category: BaseCategory, pwd: boolean) => {
    const reserved = category !== "Open" && category !== "EWS";
    const aiq = reserved ? deposit.reserved : pwd ? null : deposit.open;
    return aiq && deposit.deemed ? { aiq, deemed: deposit.deemed, reserved } : null;
  },
  contradictions,
  timeBound: (r: CrossoverRule) => TIME_BOUND.has(r.id),
  /** A rule from INI-CET's July 2026 brochures (the January 2027 one is not out yet). */
  fromJuly2026: (r: CrossoverRule) => /July 2026/.test(r.session),
};
