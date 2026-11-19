// "What you risk" for someone holding a seat (Home, Options, Choice list): plain lines built only from the counselling
// body's own rules that ./crossover.ts holds with their verbatim quotes (MCC's NEET PG 2026 documents; AIIMS's INI-CET
// ones), each line naming the rules it rests on. A question the documents leave open says "not stated", never a guess.
// NEET SS and NEET MDS: no round rules in Seatora yet (covered: false; her college's own terms still show). Server-only,
// like crossover.ts: INI-CET's words reach staff's pages only.
import "server-only";
import type { BaseCategory, Round } from "@/features/decide/types";
import { crossover, type CrossoverRule } from "./crossover";
import type { ExamKey } from "./keys";

export type RiskLine = {
  key: string;
  text: string;
  /** The rules it rests on (each with its document, page and quote). */
  rules: CrossoverRule[];
  /** Not stated: what was checked, where (a "not stated" question of the file, or a gap in the rules Seatora has). */
  gap?: { note: string; checked: string[] };
  /** Tied to dates that may move: as of the file's check. */
  asOf?: true;
};
export type RiskInput = {
  exam: ExamKey;
  /** The round she joined her seat in. */
  round: Round;
  quota: string;
  category: BaseCategory;
  pwd: boolean;
  /** A deemed university's seat (its quota, or the college's type). */
  deemed: boolean;
  /** The college's name (INI-CET: which institute's rules). */
  college: string;
  /** Rounds whose result is not final yet (MCC's round status: Round 2's, on hold). */
  pending: Round[];
};

const rules = new Map([...crossover.stages.flatMap((s) => s.rules), ...crossover.over].map((r) => [r.id, r]));
const gaps = new Map(crossover.notFound.map((n) => [n.id, n]));
/** The rules of these ids the file has (one it no longer has is left out, so a line never cites what isn't there). */
const of = (...ids: string[]) => ids.flatMap((id) => rules.get(id) ?? []);
const said = (id: string) => crossover.words(rules.get(id)?.rule ?? "");
const gap = (id: string): RiskLine["gap"] => {
  const n = gaps.get(id);
  return n && { note: crossover.words(n.note), checked: n.checked_in.map((d) => crossover.sources[d]?.title ?? d) };
};
const ROUND_NO: Partial<Record<Round, string>> = { R1: "1", R2: "2", R3: "3" };

/** A document's short name for a line's source ("MCC bulletin, p. 56"). */
export const docName = (r: CrossoverRule) =>
  ({ mcc_bulletin: "MCC bulletin", mcc_user_guide: "MCC User Guide", mcc_notice5: "MCC Notice No. 5", mcc_notice10: "MCC Notice No. 10", mcc_schedule_1611: "MCC schedule of 16 Nov 2026" })[r.doc] ??
  crossover.sources[r.doc]?.title ??
  r.doc;

/** NEET PG: MCC's rules for a seat held from `round`, the most pressing first. */
function mcc(i: RiskInput): RiskLine[] {
  const n = ROUND_NO[i.round];
  const early = i.round === "R1" || i.round === "R2";
  const r2Open = i.round === "R1" && i.pending.includes("R2");
  const dep = i.deemed ? null : crossover.depositOf(i.category, i.pwd);
  const depositWords = i.deemed
    ? "Rs 2,00,000: you registered for Deemed Universities (your seat is a deemed university's)"
    : dep
      ? `Rs ${dep.aiq} for AIQ (${dep.reserved ? "reserved categories" : "UR/EWS"}), or Rs ${dep.deemed} if you registered for Deemed Universities`
      : said("mcc_deposit_amounts").replace(/^The security deposit is /, "").replace(/\.$/, "");
  const lines: (RiskLine | false)[] = [
    r2Open && { key: "r2-upgrade", text: "If Round 2 upgrades you, your Round 1 seat is cancelled automatically, at once, and goes to someone else: you must join the Round 2 seat, and not joining it in time forfeits your security deposit.", rules: of("mcc_r2_upgrade_loses_r1") },
    early && { key: "r3-upgrade", text: "If Round 3 upgrades you, you lose any claim on your earlier seat.", rules: of("mcc_r3_upgrade_no_claim") },
    early && { key: "r3-no-resign", text: "Joining a Round 3 seat means you can't resign it or upgrade from it, and you can't take part in any later MCC round.", rules: of("mcc_r3_no_resign", "mcc_r3_no_resign_annexure") },
    early && { key: "r3-join", text: "If Round 3 allots you a seat and you don't join it, you lose your security deposit and are out of every later MCC round.", rules: of("mcc_r3_no_resign") },
    i.round === "R3" && { key: "r3-held", text: "You can't resign your Round 3 seat or upgrade from it, and having joined it you can't take part in any later MCC round.", rules: of("mcc_r3_no_resign", "mcc_r3_no_resign_annexure") },
    { key: "deposit", text: `Your MCC security deposit: ${depositWords}. From Round 2 on, it is forfeited if you are allotted a seat and don't join it, or surrender it.`, rules: of("mcc_deposit_amounts", "mcc_deposit_forfeit_r2_onwards") },
    early && { key: "r3-eligible", text: `Holding your Round ${n} seat, you can take part in Round 3 only if you gave your willingness to upgrade.`, rules: of("mcc_r3_holder_ineligible") },
    r2Open && { key: "r2-hold", text: said("mcc_r2_on_hold"), rules: of("mcc_r2_on_hold"), asOf: true },
    i.round === "R2" && { key: "r2-exit", text: "If you exit your Round 2 seat with forfeiture, you can still take part in Round 3, paying the fees afresh.", rules: of("mcc_r2_exit_then_r3") },
    (early || i.round === "R3") && { key: "stray", text: "The stray vacancy round is for candidates not holding a seat: while you hold yours, you can't take part.", rules: of("mcc_stray_eligibility") },
    early && { key: "resign", text: `You can resign your Round ${n} seat and stay in the next round only under MCC's resignation rules and within the time MCC sets.`, rules: of("mcc_resign_r1_r2_only") },
    i.round === "R1" && { key: "r1-window", text: "Resigning a Round 1 seat without forfeiting the deposit was possible only until 6:00 PM on 9 Nov 2026.", rules: of("mcc_r1_resign_window_2026") },
    i.round === "stray" && { key: "stray-resign", text: "Whether a joined stray-round seat can be resigned, and on what terms: not stated.", rules: [], gap: gap("mcc_stray_resignation") },
    (i.round === "R3" || i.round === "stray" || i.round === "special_stray") && { key: "leave-late", text: "What MCC does if you leave after its resignation windows: not stated beyond the deposit.", rules: [], gap: gap("mcc_leave_after_windows") },
    i.quota === "Armed Forces Medical" && { key: "afms", text: said("mcc_afms_debarment"), rules: of("mcc_afms_debarment") },
    { key: "originals", text: "Your college keeps your original certificates and releases them only for an upgrade, or a resignation within MCC's timelines.", rules: of("mcc_originals_retained") },
    { key: "college", text: "Your college's fee, bond and service terms are the college's own, given to MCC; MCC takes no responsibility for them. They are below.", rules: of("mcc_college_terms_not_mcc") },
    early && { key: "withdraw", text: said("mcc_withdrawal_user_guide"), rules: of("mcc_withdrawal_user_guide", "mcc_resign_r1_r2_only") },
    { key: "rounds-apply", text: "Each round has its own rules, and once a round starts they apply to you too, though you were admitted in an earlier round.", rules: of("mcc_round_rules_apply") },
    { key: "refund", text: said("mcc_refund_after_all_rounds"), rules: of("mcc_refund_after_all_rounds") },
    { key: "next-year", text: "Whether leaving or not joining an MCC seat bars you from next year's NEET PG counselling: not stated.", rules: [], gap: gap("mcc_next_year_debarment") },
  ];
  return lines.filter((l): l is RiskLine => !!l && (l.rules.length > 0 || !!l.gap));
}

/** The INI its college is (Part B's rules are per institute): AIIMS unless the name says another. */
export function iniOf(college: string): "JIPMER" | "PGIMER" | "NIMHANS" | "SCTIMST" | "AIIMS" {
  const c = college.toUpperCase();
  return /JIPMER|JAWAHARLAL INSTITUTE OF POST/.test(c) ? "JIPMER" : /PGIMER|POST ?GRADUATE INSTITUTE OF MEDICAL EDUCATION/.test(c) ? "PGIMER" : /NIMHANS|MENTAL HEALTH/.test(c) ? "NIMHANS" : /SCTIMST|SREE CHITRA/.test(c) ? "SCTIMST" : "AIIMS";
}

/** INI-CET: AIIMS's round rules (July 2026, the latest published) and her institute's Part B rules. */
function aiims(i: RiskInput): RiskLine[] {
  const ini = iniOf(i.college);
  const leave = { AIIMS: /JODHPUR/i.test(i.college) ? ["aiims_jodhpur_penalty"] : ["aiims_leaving_penalty"], JIPMER: ["jipmer_leaving_penalty"], PGIMER: ["pgimer_leaving_penalty"], NIMHANS: ["nimhans_leaving_penalty"], SCTIMST: ["sctimst_bond_50l"] }[ini];
  const lines: (RiskLine | false)[] = [
    i.round !== "R3" && { key: "open-round", text: said("aiims_open_round_deemed_resignation"), rules: of("aiims_open_round_deemed_resignation", ...(ini === "JIPMER" ? ["jipmer_open_round_penalty"] : [])) },
    { key: "leaving", text: `Leaving your seat: ${said(leave[0])}`, rules: of(...leave) },
    i.round === "R1" && { key: "upgrade-not-join", text: said("aiims_not_joining_penalty"), rules: of("aiims_not_joining_penalty") },
    i.round === "R1" && { key: "r1-options", text: said("aiims_no_refusal_r1"), rules: of("aiims_no_refusal_r1") },
    i.round !== "R3" && { key: "open-not-join", text: said("aiims_open_round_not_joining"), rules: of("aiims_open_round_not_joining") },
    ini === "AIIMS" && { key: "originals", text: said("aiims_originals_held_3l"), rules: of("aiims_originals_held_3l") },
    { key: "institute", text: said("aiims_institute_rules_govern"), rules: of("aiims_institute_rules_govern") },
  ];
  return lines.filter((l): l is RiskLine => !!l && l.rules.length > 0);
}

/**
 * Her lines, most pressing first, by exam, the round she joined, her quota, category and a deemed seat. `covered`: the
 * exam's round rules are in Seatora (NEET PG: MCC's; INI-CET: AIIMS's); NEET SS / MDS not yet.
 */
export function riskLines(i: RiskInput): { covered: boolean; lines: RiskLine[] } {
  if (i.exam === "neet-pg") return { covered: true, lines: mcc(i) };
  if (i.exam === "ini-cet") return { covered: true, lines: aiims(i) };
  return { covered: false, lines: [] };
}

/** A rule from INI-CET's July 2026 brochures (the January 2027 one is not out yet), said beside it. */
export const fromJuly2026 = crossover.fromJuly2026;
/** When the rules were checked (as-of lines). */
export const checkedOn = crossover.checked;
