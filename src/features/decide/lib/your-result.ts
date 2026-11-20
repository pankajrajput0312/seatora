// "Your Round 2 result" (Home's card, Ask's get_profile, the owner's list): what the latest round's result lists for her
// saved (or tried) rank, in words. Pure: the rows are rankJourney's (her rank's rows that year), the words the exam's.
import { formatRank } from "@/features/cutoffs/lib/format";
import { categoryFromText, type Profile } from "../profile";
import { prevRemarkLabel, rounds, type Allotment, type PrevSeat, type Round } from "../types";
import { heldParts } from "./held";

type Seat = { college: string; degree: string; specialty: string; quota: string; collegeName: string; courseName: string };
/** One of her rank's rows that year (service.ts rankJourney). */
export type ResultRow = Seat & Pick<Allotment, "round" | "category" | "status" | "candidateCategory"> & { prev: (Seat & Pick<PrevSeat, "remark">) | null };
/** The exam's words: "AIR", "MCC", the round with a result, its name ("Round 2"), quota names; `heldName`: her held seat's. */
export type ResultWords = { rankWord: string; by: string; round: Round; roundName: (r: Round) => string; provisional: boolean; quota: (q: string) => string; heldName?: string | null };

/**
 * found: the round's result lists her rank (one row). kept: it doesn't, an earlier round of the year does (MCC's R2 and
 * R3 results list only new allotments). none: no round of the year lists it. several: more than one row for the rank
 * (never in NEET PG; a NEET SS rank without its group), so none is picked. `flag`: the shown row's candidate category
 * isn't hers (a wrong rank or category in her profile); `held`: her "I already hold a seat" beside it.
 */
export function yourResult<T extends ResultRow>(me: Pick<Profile, "rank" | "category" | "pwd" | "held">, rows: T[], w: ResultWords) {
  const air = `${w.rankWord} ${formatRank(me.rank)}`;
  const round = w.roundName(w.round);
  const at = rounds.indexOf(w.round);
  const now = rows.filter((a) => a.round === w.round);
  const before = rows.filter((a) => rounds.indexOf(a.round) < at).at(-1) ?? null;
  const seat = (a: Seat & { category: string }) => `${a.courseName}, ${a.collegeName} · ${w.quota(a.quota)} · ${a.category} seat`;
  const h = me.held && heldParts(me.held);
  const isHeld = (a: Seat | null) => !!h && !!a && a.college === h.college && a.degree === h.degree && a.specialty === h.specialty && a.quota === h.quota;
  const heldName = w.heldName ? ` (${w.heldName})` : "";
  const mine = `${me.category}${me.pwd ? " PwD" : ""}`;
  // The candidate category MCC prints beside the row, against hers ("SC PwD" is SC with PwD; "General" is Open).
  const otherCat = (a: T | null) => {
    const c = a?.candidateCategory && categoryFromText(a.candidateCategory);
    return c && (c.category !== me.category || c.pwd !== me.pwd) ? a!.candidateCategory : null;
  };
  const flagOf = (cc: string | null) => cc && `${w.by} lists ${air}'s candidate as ${cc}; your profile says ${mine}. Check the rank and category in your profile.`;

  if (now.length > 1) return { kind: "several" as const, head: `${w.by}'s ${round} result has ${now.length} rows for ${air}: open the PDF to find yours.`, before: null, flag: null, held: null, row: null };
  if (now.length === 1) {
    const row = now[0];
    const cc = otherCat(row);
    const p = row.prev;
    const prevRound = w.roundName(rounds[Math.max(0, at - 1)]);
    const head = `${cc ? `If ${air} is yours: ` : ""}${w.by}'s ${w.provisional ? "provisional " : ""}${round} result lists ${air}${row.candidateCategory ? ` (${row.candidateCategory})` : ""}: ${seat(row)} · ${row.status === "upgraded" ? "Upgraded" : "Fresh allotment"}`;
    const was = p ? `${prevRound}: ${p.courseName}, ${p.collegeName} — ${prevRemarkLabel[p.remark]}` : before ? `${w.roundName(before.round)}: ${before.courseName}, ${before.collegeName}` : null;
    const held = !h
      ? null
      : isHeld(row)
        ? "This is the seat you hold."
        : isHeld(p)
          ? row.status === "upgraded" ? `Upgraded from the seat you hold${heldName}.` : `${w.by}'s result marks the seat you hold${heldName} ${prevRemarkLabel[p!.remark]} in ${prevRound}.`
          : `The seat you saved as held${heldName} isn't ${air}'s ${prevRound} seat in ${w.by}'s result: check your profile.`;
    return { kind: "found" as const, head, before: was, flag: flagOf(cc), held, row };
  }
  if (before) {
    const cc = otherCat(before);
    const b = w.roundName(before.round);
    const lead = `among ${round}'s new allotments: you kept your ${b} seat, weren't allotted, or didn't opt to upgrade — ${w.by}'s PDF says which.`;
    return {
      kind: "kept" as const,
      head: cc ? `If ${air} is yours: not ${lead}` : `Not ${lead}`,
      before: `Your ${b} seat: ${seat(before)}`,
      flag: flagOf(cc),
      held: !h ? null : isHeld(before) ? `That is the seat you hold: no ${round} seat replaces it.` : `The seat you saved as held${heldName} isn't ${air}'s ${b} seat in ${w.by}'s result: check your profile.`,
      row: null,
    };
  }
  return {
    kind: "none" as const,
    head: `${air} isn't in ${w.by}'s ${round} list of new allotments${at > 0 ? ", or in an earlier round's result this year" : ""}.`,
    before: null,
    flag: null,
    held: h ? `No seat for ${air} this year in ${w.by}'s results, though you saved one as held${heldName}: check the rank in your profile.` : null,
    row: null,
  };
}

/** The provisional result's own instruction in MCC's round status note ("provisional result 20 Nov: discrepancies to MCC until 6 PM on 20 Nov, approach the college only after the final result (Notice No. 12)"); null when it gives none. */
export function provisionalNote(note: string | null | undefined) {
  const c = note?.split(/;\s+|(?<=\.)\s+(?=[A-Z])/).find((x) => /provisional result/i.test(x))?.trim();
  return c ? c[0].toUpperCase() + c.slice(1) : null;
}
