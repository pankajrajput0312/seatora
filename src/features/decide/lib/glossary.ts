import { authorityOf, DEFAULT_EXAM, type ExamKey } from "@/features/exams/keys";

// The one glossary (components/term.tsx shows an entry when a jargon word is tapped): each word in one or two plain
// sentences, in the exam's own words (MCC or AIIMS, its rounds). Plain explanations of the counselling's terms, never data.

export const termKeys = [
  "aiq", "round", "stray", "special-stray", "mop-up", "open-round", "clear", "virtual", "newly-added", "deemed", "dnb-quota", "nbems-diploma",
  "closing", "within-10", "reach", "bond", "bond-penalty", "leaving-penalty", "forfeit", "question-group", "clinical",
] as const;
export type TermKey = (typeof termKeys)[number];

/** Each word's explanation for `exam`. */
export function glossary(exam: ExamKey = DEFAULT_EXAM): Record<TermKey, string> {
  const by = authorityOf(exam);
  const ini = exam === "ini-cet";
  return {
    aiq: ini
      ? "INI-CET has no All India Quota: AIIMS fills each institute's seats from one rank list, by category and the institute's own quotas."
      : `All India Quota: the seats ${by} fills from one national rank list (50% of state government colleges' seats, and central and deemed institutes' seats). Any candidate can take them.`,
    round: ini
      ? "AIIMS allots seats in rounds (R1, R2, then the Open Round). Each later round fills the seats left or freed by the one before."
      : `${by} allots seats in rounds: R1, R2, R3, then stray rounds. Each later round fills the seats left or freed by the one before, and lets you upgrade.`,
    stray: `A last round for seats still empty after the main rounds. Its closing ranks can be far later than R1 to R3, so they never count toward "Reached".`,
    "special-stray": `A stray round held once more, for the few seats still empty after it. Like stray, it never counts toward "Reached".`,
    "mop-up": `A round after the main rounds for seats still empty (what other years call a stray round). It never counts toward "Reached".`,
    "open-round": "INI-CET's last round, open to candidates who took no seat earlier, for the seats still empty. It can close far later than R1 and R2.",
    clear: `Seats ${by} lists as empty before the round: you can be allotted one if your rank is reached.`,
    virtual: "Seats held now that fall empty only if their holder upgrades or leaves in this round. Some will, some won't.",
    "newly-added": `Seats ${by} added for this round that weren't in the earlier lists. Most are also in the clear vacancy list.`,
    deemed: "Seats at deemed universities (private, with their own fees). Anyone can take them through MCC, usually at a much higher fee than government seats.",
    "dnb-quota": "DNB seats at NBEMS-accredited hospitals, filled through MCC. NBEMS sets the most they may charge and the least they must pay as stipend.",
    "nbems-diploma": "A 2-year post-MBBS diploma run by NBEMS at accredited hospitals (not a university diploma). NBEMS sets its fee limit and minimum stipend.",
    closing: `The last (highest) rank ${by} allotted a seat to in that round, category and quota. A rank at or before it got a seat; history, not a promise.`,
    "within-10": "The closing rank came before yours, but by no more than 10% of your rank. Close: worth listing below the ones you reached.",
    reach: "How your rank compares with past closing ranks here: reached, within 10%, closed before your rank, or no allotment. History, not a prediction.",
    bond: "Years you must work for the state or college after the course. Not serving them costs the bond penalty.",
    "bond-penalty": "What you pay if you finish the course but don't serve the bond years. It is separate from the leaving penalty.",
    "leaving-penalty": "What you pay (or the rule you face) if you leave the seat or course after joining, before finishing it. It is separate from the bond penalty.",
    forfeit: ini
      ? "AIIMS's round rules: what you lose for not joining a seat or leaving it between rounds. It is separate from the college's leaving penalty."
      : `What you lose if you resign or don't join an allotted seat from Round 2 on (your security deposit, or what ${by} lets the college keep). It is separate from the college's leaving penalty.`,
    "question-group": "NEET SS ranks you within one question group (Medical, Surgical…). Only that group's courses compare with your rank.",
    clinical: "Seatora's grouping of courses: clinical (you treat patients: medicine, surgery…), para-clinical (lab and diagnosis: pathology, microbiology…), non-clinical (basic sciences: anatomy, physiology, biochemistry).",
  };
}

/** The word for a quota, when it is jargon: All India → aiq, Deemed/Paid → deemed, DNB Quota → dnb-quota. */
export function quotaTerm(quota: string): TermKey | null {
  if (/^all india$/i.test(quota)) return "aiq";
  if (/deemed|paid/i.test(quota)) return "deemed";
  if (/^dnb quota$/i.test(quota)) return "dnb-quota";
  return null;
}

/** The word for a round as shown ("R1", "Stray", "Open Round", "Mop-up"). */
export function roundTerm(shown: string): TermKey {
  if (/open round/i.test(shown)) return "open-round";
  if (/mop.?up/i.test(shown)) return "mop-up";
  if (/special/i.test(shown)) return "special-stray";
  if (/stray/i.test(shown)) return "stray";
  return "round";
}
