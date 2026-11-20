// Each exam's landing-page words (hero, metadata, the exam's own FAQs). Server only, like the registry: an exam that
// isn't open never has its words in a public page or JS chunk. Figures come from its data (./data.ts), never typed here.
import "server-only";
import { formatRank } from "@/features/cutoffs/lib/format";
import { fillWindow, fmtIST, joiningOf, nextChoiceFilling, roundName } from "@/features/decide/lib/round-status";
import { provisionalNote } from "@/features/decide/lib/your-result";
import { rounds } from "@/features/decide/types";
import { crossover } from "../crossover";
import { authorityOf, termsDocOf, type ExamKey } from "../keys";
import { hasSponsored, type cutoffPage, type LandingData } from "./data";

type Words = {
  /** <title> (≤ 50 characters: the layout adds " · Seatora") and the description search results show (≤ 155). */
  title: string;
  description: string;
  /** The hero's question, in the candidate's words. */
  headline: string;
  /** What this counselling is and the decision Seatora helps with. */
  scope: string;
  /** What Seatora does not cover, said up front. */
  notCovered?: string;
  /** Step 1's words: what she enters. */
  enter: string;
  faqs: (d: LandingData) => { q: string; a: string }[];
};

const n = (x: number) => formatRank(x);

export const landingWords: Record<ExamKey, Words> = {
  "neet-pg": {
    title: "NEET PG 2026 Counselling: Closing Ranks & Seats",
    description: "MCC NEET PG 2026 counselling: closing ranks by round for All India, deemed and DNB seats, seat matrix, fees, stipends and bonds. State quota not covered.",
    headline: "Where can your AIR get a seat, round by round?",
    scope: "MCC runs NEET PG counselling for the All India Quota seats of government medical colleges, deemed universities, central institutions and DNB hospitals. Seatora shows where ranks like yours were allotted, so you can decide which seats go on your Choice list and in what order.",
    notCovered: "State quota counselling (such as Maharashtra's CET Cell) isn't covered.",
    enter: "Your All India Rank, category and the quotas you can take.",
    faqs: (d: LandingData) => [
      { q: "Does Seatora cover state quota counselling?", a: "No. Seatora covers MCC's All India counselling: the All India Quota, central and deemed quotas, and DNB seats. State quota counselling (such as Maharashtra's CET Cell) isn't covered; a state filter shows the All India seats in that state." },
      { q: "What is a deemed university seat?", a: `A seat at a deemed university, filled in MCC's counselling alongside the All India Quota ("Deemed/Paid Seats" in its results). The fee is the university's own, not a government college's, so check it before you fill the seat.${d.deemed ? ` One example from ${d.head} is on this page.` : ""}` },
    ],
  },
  "neet-ss": {
    title: "NEET SS Counselling: DM, MCh & DrNB Closing Ranks",
    description: "Plan MCC's NEET SS counselling: D.M., M.Ch. and DrNB seats by question group, with closing ranks by round, fees, stipends and bonds from MCC's documents.",
    headline: "Which super-speciality seat can your group rank reach?",
    scope: "MCC runs NEET SS counselling for D.M., M.Ch. and DrNB seats. A NEET SS rank is a rank within one question group, so Seatora compares yours only with the seats of your group, round by round.",
    enter: "Your NEET SS group rank and your question group.",
    faqs: (d) => [
      { q: "Why do I pick a question group?", a: `A NEET SS rank is a rank within one question group: pick yours, and only that group's seats are compared with your rank.${d.groups.length ? ` MCC's ${d.head} results had ${d.groups.length} groups, from the ${d.groups[0].group} (${d.groups[0].courses} courses) down.` : ""}` },
      { q: "Which seats are covered?", a: "MCC's NEET SS counselling: D.M., M.Ch. and DrNB seats, every round MCC published, including the stray and special stray rounds. A state filter shows those seats in that state." },
    ],
  },
  "neet-mds": {
    title: "NEET MDS Counselling: Closing Ranks, Fees & Bonds",
    description: "Plan MCC's NEET MDS counselling: 50% All India Quota and deemed dental seats, with closing ranks by round, fees, stipends and bonds from MCC's documents.",
    headline: "Which MDS seat can your AIR reach?",
    scope: "MCC runs NEET MDS counselling for the 50% All India Quota of government dental colleges, deemed universities, DU, IP, BHU, AMU and AFMS. Seatora shows where ranks like yours were allotted, round by round, so you can order your choices.",
    notCovered: "State quota MDS counselling isn't covered: each state runs its own, so check your state's counselling authority for those seats.",
    enter: "Your All India Rank, category and the quotas you can take.",
    faqs: () => [
      { q: "Does Seatora cover state quota MDS seats?", a: "No. Seatora covers MCC's NEET MDS counselling only: the 50% All India Quota of government dental colleges, deemed universities, DU, IP, BHU, AMU and AFMS. Each state runs its own quota counselling; a state filter shows only MCC's seats in that state." },
      { q: "What is a Self-Financed Merit Seat?", a: "MCC's name now for the paid seats of deemed universities (its results called them \"Management/Paid Seats\" up to 2025). Seatora uses the one name in every year. Their fees are the university's own, so check the fee before you fill one." },
    ],
  },
  "ini-cet": {
    title: "INI-CET Counselling: AIIMS, JIPMER, PGIMER Ranks",
    description: "Plan INI-CET counselling for AIIMS, JIPMER, PGIMER, NIMHANS and SCTIMST seats, January and July sessions, with closing ranks by round, fees and penalties.",
    headline: "Which AIIMS, JIPMER or PGIMER seat can your rank reach?",
    scope: "AIIMS New Delhi runs INI-CET counselling for seats at AIIMS, JIPMER, PGIMER, NIMHANS and SCTIMST, twice a year: a January session and a July session. Seatora shows where ranks like yours were allotted in each session's rounds, so you can order your choices.",
    enter: "Your INI-CET rank, category and the quotas you can take.",
    faqs: (d) => [
      { q: "Why does Seatora name sessions, not years?", a: `INI-CET has two sessions a year, January and July, each with its own seat allocation: a 1st Round, a 2nd Round and the Open Round. Seatora names each by its session, from ${d.counts.first} to ${d.counts.last}.` },
      { q: "Is MDS on a separate rank list?", a: "Yes. INI-CET ranks MDS on a list of its own, so the same rank on the MD/MS list is another candidate. Seatora reads each rank against its own list." },
      { q: "I'm in NEET PG counselling too. What do the rules say?", a: crossover.bottomLine[0].text },
    ],
  },
};

/** The FAQs every exam's page has, in its words and figures. */
export function commonFaqs(d: LandingData) {
  const who = authorityOf(d.exam);
  const results = d.E.resultsName ?? `${who} allotment results`;
  const c = d.closing;
  return [
    { q: "Will Seatora tell me which seat I'll get?", a: "No one can promise that honestly. Seatora shows where ranks were allotted in past rounds, by quota and category: history, not a prediction. Seats, candidates and rounds change every year." },
    { q: "Where do the numbers come from?", a: `${results} (${n(d.counts.resultPdfs)} PDFs, ${d.counts.first} to ${d.counts.last}), ${who}'s seat lists, and for fees and bonds ${termsDocOf(d.exam)} and the documents it links. Every figure names its document.` },
    {
      q: "What is a closing rank?",
      a: `The last rank that got a seat in that round, on that quota and category.${c && c.rounds.length > 1 ? ` For ${c.course} at ${c.college.name} (${c.quota}, Open seats, ${c.year}) it went from ${n(c.rounds[0].closing)} in ${c.rounds[0].name} to ${n(c.rounds.at(-1)!.closing)} in ${c.rounds.at(-1)!.name}, as seats were given up and filled again.` : ""}`,
    },
  ];
}

type CutoffPage = NonNullable<Awaited<ReturnType<typeof cutoffPage>>>;

/**
 * A cutoff page's words (/neet-pg/round-2-cutoff-2026), every figure from its data and every date from MCC's notices:
 * `intro`, `note` (the provisional result's instruction, with its notice) and `faqs` (also llms-full.txt's).
 */
export function cutoffText({ d, status }: CutoffPage) {
  const round = roundName[d.round];
  const later = d.round !== "R1";
  const steps = status?.steps ?? [];
  const result = steps.find((s) => s.round === d.round && s.step === (d.provisional ? "provisional_result" : "final_result") && s.date);
  const said = d.provisional ? provisionalNote(steps.find((s) => s.round === d.round && s.step === "provisional_result")?.note) : null;
  const allotted = [...d.tabs.flatMap((t) => t.rows), ...d.restricted].reduce((a, r) => a + r.n, 0);
  const tabs = d.tabs.filter((t) => t.rows.length).map((t) => `${n(t.rows.length)} ${t.label}`);
  const example = d.tabs.find((t) => t.key === "aiq")?.rows.filter((r) => r.last.Open != null).sort((a, b) => b.n - a.n)[0];
  // The next round's choice filling, if MCC's notices give one (only the latest year's are still to come).
  const next = nextChoiceFilling(steps.filter((s) => rounds.indexOf(s.round) > rounds.indexOf(d.round)));
  const joining = next && joiningOf(steps.filter((s) => s.round === next.round));
  const what = later ? "new allotments (Fresh Allotted and Upgraded)" : "allotments";

  return {
    intro: [
      `MCC's ${d.provisional ? "provisional " : ""}result of NEET PG ${d.year} ${round}${result ? `, published ${fmtIST(result.date!, true)},` : ""} made ${n(allotted)} ${what}: ${tabs.slice(0, -1).join(", ")}${tabs.length > 1 ? " and " : ""}${tabs.at(-1)} branches, plus ${n(d.restricted.length)} rows in restricted quotas.`,
      `Each branch's last rank is the highest All India Rank given a seat in ${round}, per quota and seat category${later ? "; seats kept from an earlier round don't count" : ""}. History, not a prediction.`,
    ],
    note: said && result?.url ? { text: said, url: result.url } : null,
    faqs: [
      {
        q: `What is the NEET PG ${d.year} ${round} cutoff?`,
        a: `The last rank of ${round}: the highest All India Rank given a seat of a branch, per quota and seat category, in MCC's ${d.provisional ? "provisional " : ""}result.${example ? ` For example, ${example.course} on All India Open seats closed at AIR ${n(example.last.Open!)} (${n(example.n)} ${later ? "new " : ""}allotments in all its categories).` : ""} It is what happened in that round, not a prediction.`,
      },
      ...(later
        ? [{ q: `Does the ${round} cutoff count seats kept from an earlier round?`, a: `No. ${round} counts only new allotments (Fresh Allotted and Upgraded); a candidate who kept an earlier round's seat isn't in it. So a branch can close at a better (lower) rank in ${round} than in Round 1.` }]
        : []),
      ...(d.provisional
        ? [{ q: `Is the ${round} result final?`, a: `No. This is MCC's provisional result; the final result can differ, and Seatora replaces it with the final one once MCC publishes it.${said ? ` MCC's notice: ${said[0].toLowerCase()}${said.slice(1)}.` : ""}` }]
        : []),
      ...(!hasSponsored(d)
        ? [{ q: "Is there a sponsored or in-service quota in MCC's NEET PG counselling?", a: "No. MCC's NEET PG counselling has no sponsored seats; in-service and sponsored seats are filled in state counselling, which Seatora doesn't cover. NRI, AFMS, university and minority quotas are shown apart, under Restricted quotas." }]
        : []),
      ...(next
        ? [{
            q: `When is ${roundName[next.round]}?`,
            a: `${roundName[next.round]} choice filling: ${fillWindow(next)}${joining ? `; last date of joining ${joining.by}` : ""}, per MCC's notices as Seatora last read them (${fmtIST(status!.asOf)}). Dates can move: MCC posts every notice on mcc.nic.in.`,
          }]
        : []),
      { q: "Does this include state quota cutoffs?", a: "No. These are MCC's All India counselling results: the All India Quota, deemed and central universities, and DNB seats. State quota counselling (such as Maharashtra's CET Cell) is run by each state and isn't covered." },
    ],
  };
}
