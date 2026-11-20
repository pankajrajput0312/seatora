// The public college and branch pages' words (./colleges.ts): titles that fit, descriptions, and FAQs answered only from
// the page's own figures (a question is left out when its data is missing). Pure, so tested (colleges.test.ts).
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import type { BranchRow } from "./data";
import type { At, BranchView, CollegeView, ResidentCounts } from "./colleges";

const n = formatRank;
const others = ["OBC", "EWS", "SC", "ST"] as const;
/** A quota in a sentence. */
export const quotaWord: Record<string, string> = { "All India": "All India", "Deemed/Paid Seats": "deemed (Self-Financed Merit Seat)", "DNB Quota": "DNB" };
const short: Record<string, string> = { "All India": "All India", "Deemed/Paid Seats": "deemed", "DNB Quota": "DNB" };
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const result = (at: At) => `MCC's ${at.provisional ? "provisional " : ""}NEET PG ${at.year} ${roundName[at.round]} result`;
const laterNote = (at: At) => (at.round === "R1" ? "" : ` ${roundName[at.round]} counts only new allotments (Fresh Allotted and Upgraded).`);
const HISTORY = "History, not a prediction.";
const NOT_STATE = "State quota counselling is run by each state and isn't covered.";

/**
 * A <title>: the first candidate that fits 50 characters (the layout adds " · Seatora": ~60 in all, what Google shows),
 * else the first that fits 60 on its own (`absolute`), else the last one cut to 60 in the middle: its start and its
 * end kept, so two long names that differ only at the end ("…, Doda" / "…, Doda City", a PIN code) still differ.
 */
export function fitTitle(xs: string[]): { title: string; absolute: boolean } {
  const a = xs.find((x) => x.length <= 50);
  if (a) return { title: a, absolute: false };
  const b = xs.find((x) => x.length <= 60);
  if (b) return { title: b, absolute: true };
  const x = xs.at(-1)!;
  return { title: `${x.slice(0, 42).trimEnd()}…${x.slice(-17).trimStart()}`, absolute: true };
}

/** A description ≤ 155: the first of `make(name)`'s candidates (longest first) that fits, else the last with the name cut. */
export function fitDescription(make: (name: string) => string[], name: string, max = 155): string {
  const xs = make(name);
  const fit = xs.find((x) => x.length <= max);
  if (fit) return fit;
  const last = xs.at(-1)!;
  return make(`${name.slice(0, Math.max(8, max - (last.length - name.length) - 1)).trimEnd()}…`).at(-1)!.slice(0, max);
}

// ---------- Index and state pages ----------

export const indexWords = (at: At, colleges: number) => ({
  ...fitTitle([`NEET PG Colleges ${at.year}: Cutoff, Seats, Fees, Bond`, `NEET PG Colleges ${at.year}: Cutoff by College`]),
  h1: `NEET PG ${at.year} Colleges: Cutoff, Seats, Fees and Bond`,
  description: `${n(colleges)} colleges and DNB hospitals in MCC's NEET PG ${at.year} counselling by state: type, courses, latest last rank, fees, bond. State quota not covered.`,
});

export const stateWords = (at: At, state: string, colleges: number) => ({
  ...fitTitle([`NEET PG Colleges in ${state}: ${at.year} Cutoff`, `NEET PG ${at.year} Colleges in ${state}`, `NEET PG Colleges in ${state}`]),
  h1: `NEET PG ${at.year} Colleges in ${state}: Cutoff and Seats`,
  description: fitDescription(
    (s) => [
      `${n(colleges)} colleges and DNB hospitals in ${s} in MCC's NEET PG ${at.year} counselling: type, courses, last rank in ${roundName[at.round]}. State quota not covered.`,
      `${n(colleges)} ${s} colleges in MCC's NEET PG ${at.year} counselling: type, courses, latest last rank. State quota not covered.`,
    ],
    state,
  ),
});

// ---------- One college ----------

type College = Pick<CollegeView, "college" | "at" | "d" | "courses" | "quotas" | "lists" | "programmes"> & { label: string; residents: ResidentCounts | null };

export function collegeWords(v: College) {
  const { at } = v;
  const round = roundName[at.round];
  const quotas = list(v.quotas.map((q) => short[q]));
  const state = v.college.state ? `, ${v.college.state}` : "";
  return {
    ...fitTitle([`${v.label}: NEET PG ${at.year} Cutoff`, `${v.label} NEET PG Cutoff`, `NEET PG Cutoff: ${v.label}`]),
    h1: `${v.college.name}: NEET PG ${at.year} Cutoff`,
    description: fitDescription(
      (s) =>
        v.courses
          ? [
              `${s}${state}: NEET PG ${at.year} ${round}${at.provisional ? " (provisional)" : ""} last rank for ${v.courses} courses on MCC ${quotas} seats, with seats, fee and bond. State quota not covered.`,
              `${s}: NEET PG ${at.year} ${round} last rank for ${v.courses} courses on MCC ${quotas} seats, with fee and bond. State quota not covered.`,
              `${s}: NEET PG ${at.year} ${round} last rank, MCC ${quotas} seats; fee, bond. State quota not covered.`,
            ]
          : [`${s}${state}: MCC NEET PG counselling data, with fee, stipend and bond. State quota not covered.`, `${s}: MCC NEET PG data, fee and bond. State quota not covered.`],
      v.label,
    ),
  };
}

/** The college's questions, each answered from its figures only; a question without its figures is left out. */
export function collegeFaqs(v: College): { q: string; a: string }[] {
  const { at, college } = v;
  const name = college.name;
  const round = roundName[at.round];
  const rows = v.d.tabs.flatMap((t) => t.rows as BranchRow[]).filter((r) => r.last.Open != null);
  const top = [...rows].sort((a, b) => b.n - a.n || a.course.localeCompare(b.course)).slice(0, 3);
  const fees = v.programmes.find((p) => !p.fee.missing || !p.stipend.missing || p.bondKnown);
  const listRound = v.lists[0] && `NEET PG ${v.lists[0].year} ${roundName[v.lists[0].round]}`;
  const r = v.residents;
  return [
    ...top.map((x, i) => {
      const cats = others.filter((c) => x.last[c] != null).map((c) => `${c} AIR ${n(x.last[c]!)}`);
      return {
        q: `What was the ${x.course} cutoff at ${name} in NEET PG ${at.year} ${round}?`,
        a: `In ${result(at)}, the last rank given ${x.course} at ${name} on ${quotaWord[x.quota]} Open seats was AIR ${n(x.last.Open!)}${cats.length ? ` (${list(cats)})` : ""}.${x.prev != null ? ` In ${at.prevYear}, its deepest Open closing was AIR ${n(x.prev)}.` : ""}${i === 0 ? laterNote(at) : ""} ${HISTORY}`,
      };
    }),
    ...(v.lists.length
      ? [{
          q: `How many seats did MCC's ${listRound} seat lists show at ${name}?`,
          a: `${list(v.lists.map((l) => `${n(l.seats)} seat${l.seats === 1 ? "" : "s"} in the ${l.name.toLowerCase()}`))} at ${name}, in MCC's ${listRound} seat lists as published.${v.lists.length > 1 ? " The lists overlap, so they are never added together." : ""}`,
        }]
      : []),
    ...(fees
      ? [{
          q: `What are the fee, stipend and bond for ${fees.programme} at ${name}?`,
          a: `${fees.quota ? `On ${quotaWord[fees.quota] ?? fees.quota} ${fees.programme} seats: ` : ""}fee (year 1): ${fees.fee.value}; stipend (year 1): ${fees.stipend.value}. ${fees.bond}`,
        }]
      : []),
    ...(r?.total
      ? [{
          q: `How many residents are at ${name}?`,
          a: `MCC's admitted-candidates lists have ${n(r.total)} at ${name} in ${r.courses.length} course${r.courses.length === 1 ? "" : "s"}: ${list(r.years.map((y, i) => `${n(r.byYear[i])} in ${y}`))}. Signed-in members see their names; this page shows counts only.`,
        }]
      : []),
    {
      q: `Does this page cover ${name}'s state quota seats?`,
      a: `No. It shows MCC's All India counselling${v.quotas.length ? ` (${list(v.quotas.map((q) => quotaWord[q]))} seats here)` : ""}. ${NOT_STATE}`,
    },
  ];
}

// ---------- One branch ----------

export function branchWords(v: Pick<BranchView, "course" | "at" | "colleges">) {
  const { at } = v;
  const c = v.course.label;
  return {
    ...fitTitle([`NEET PG ${at.year} ${c} Cutoff: College-wise`, `NEET PG ${at.year} ${c} Cutoff`, `${c} NEET PG ${at.year} Cutoff`]),
    h1: `NEET PG ${at.year} ${c} Cutoff: College-wise Last Rank`,
    description: fitDescription(
      (s) => [
        `${s} NEET PG ${at.year} ${roundName[at.round]}${at.provisional ? " (provisional)" : ""} last rank at ${n(v.colleges)} colleges, per category, with ${at.prevYear}'s deepest. MCC All India, deemed, DNB; no state quota.`,
        `${s}: NEET PG ${at.year} last rank at ${n(v.colleges)} colleges, MCC All India, deemed and DNB seats. State quota not covered.`,
      ],
      c,
    ),
  };
}

export function branchFaqs(v: Pick<BranchView, "course" | "at" | "d" | "prevDeepest">): { q: string; a: string }[] {
  const { at } = v;
  const c = v.course.label;
  const round = roundName[at.round];
  const tabs = v.d.tabs.map((t) => ({ ...t, open: (t.rows as BranchRow[]).filter((r) => r.last.Open != null) })).filter((t) => t.open.length);
  return [
    ...tabs.map((t, i) => {
      const [lo, hi] = [t.open[0], t.open.at(-1)!]; // branchTabs: Open last rank, lowest first
      return {
        q: i === 0 ? `What was the NEET PG ${at.year} ${c} cutoff in ${round}?` : `What was the ${t.label} ${c} cutoff in NEET PG ${at.year} ${round}?`,
        a: `On ${quotaWord[t.quota]} Open seats in ${result(at)}, ${c} ${t.open.length === 1 ? `closed at AIR ${n(lo.last.Open!)} at ${lo.course}` : `closed from AIR ${n(lo.last.Open!)} at ${lo.course} to AIR ${n(hi.last.Open!)} at ${hi.course}, across ${t.open.length} colleges`}.${i === 0 ? laterNote(at) : ""} ${HISTORY}`,
      };
    }),
    ...(v.prevDeepest
      ? [{ q: `What was the deepest ${c} closing rank in NEET PG ${at.prevYear}?`, a: `AIR ${n(v.prevDeepest.closing)}, at ${v.prevDeepest.college} in ${roundName[v.prevDeepest.round]}: the highest Open closing rank of ${at.prevYear} in any round on All India, deemed or DNB seats. ${HISTORY}` }]
      : []),
    { q: `Does this include state quota ${c} cutoffs?`, a: `No. These are MCC's All India counselling results: the All India Quota, deemed and central universities, and DNB seats. ${NOT_STATE}` },
  ];
}
