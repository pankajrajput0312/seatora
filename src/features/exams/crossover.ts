// INI-CET's "Also in NEET PG counselling?" guide: the official rules where MCC's NEET PG counselling and AIIMS's INI-CET
// counselling meet (neetpg-planner data/exams/ini-cet/facts/crossover.json, copied as ./ini-cet-crossover.json; every
// rule with its verbatim quote, document, page and link). Server-only, like the rest of INI-CET: staff's pages only,
// never in a member's JS. Validated on load; a file that doesn't fit throws (a deploy check, never a half-shown guide).
import "server-only";
import { z } from "zod";
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
  { title: "MCC Round 1 and Round 2 (Round 2 on hold)", ids: ["mcc_r2_on_hold", "mcc_schedule_dates", "mcc_r1_free_exit", "mcc_r1_free_exit_faq", "mcc_r1_resign_window_2026", "mcc_resign_r1_r2_only", "mcc_withdrawal_user_guide", "mcc_deposit_forfeit_r2_onwards", "mcc_deposit_amounts", "mcc_r2_upgrade_loses_r1", "mcc_r2_exit_then_r3", "mcc_r2_resign_state_flowchart"] },
  { title: "MCC Round 3", ids: ["mcc_r3_holder_ineligible", "mcc_r3_no_resign", "mcc_r3_no_resign_annexure"] },
  { title: "MCC stray round", ids: ["mcc_stray_eligibility", "mcc_stray_must_join", "mcc_stray_state_data_sharing"] },
  { title: "Original certificates: both want them", ids: ["mcc_originals_needed_to_join", "mcc_originals_retained", "aiims_report_originals_or_3l", "aiims_r1_dd_five_days", "aiims_new_r2_dd_five_days", "aiims_r2_noshow_originals_buyback", "aiims_originals_held_3l"] },
  { title: "INI-CET: already doing or done an MD/MS", ids: ["aiims_pursuing_pg_excluded"] },
  { title: "INI-CET Round 1 and Round 2", ids: ["aiims_rounds_and_dates", "aiims_two_rounds_plus_open", "aiims_last_date_admission", "aiims_no_refusal_r1", "aiims_not_joining_penalty", "aiims_r2_noshow_dd_forfeit"] },
  { title: "Leaving an INI-CET seat", ids: ["aiims_institute_rules_govern", "aiims_leaving_penalty", "aiims_jodhpur_penalty", "aiims_vacated_not_refilled", "jipmer_leaving_penalty", "pgimer_leaving_penalty", "nimhans_leaving_penalty", "sctimst_bond_50l"] },
  { title: "INI-CET Open Round", ids: ["aiims_open_round_deemed_resignation", "aiims_open_round_not_joining", "aiims_open_round_result_penalty", "aiims_open_round_refund", "jipmer_open_round_penalty"] },
  { title: "Other rules", ids: ["mcc_round_rules_apply", "mcc_refund_after_all_rounds", "mcc_college_terms_not_mcc", "mcc_afms_debarment", "mcc_state_rules_are_states"] },
];
/** MCC rules tied to dates that may move: said "as of" the check, with Notice No. 10's hold. */
const TIME_BOUND = new Set(["mcc_r2_on_hold", "mcc_schedule_dates", "mcc_r1_resign_window_2026"]);

const byId = new Map(data.rules.map((r) => [r.id, r]));
const placed = new Set(stages.flatMap((s) => s.ids));
const unplaced = data.rules.filter((r) => !placed.has(r.id));

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
  contradictions,
  timeBound: (r: CrossoverRule) => TIME_BOUND.has(r.id),
  /** A rule from INI-CET's July 2026 brochures (the January 2027 one is not out yet). */
  fromJuly2026: (r: CrossoverRule) => /July 2026/.test(r.session),
};
