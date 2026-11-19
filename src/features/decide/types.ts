// Shapes mirror the MCC export the importer reads (prisma/import-mcc.ts, src/features/cutoffs/lib/import-schema.ts).
// No person-level data: no names.
import type { BondDetails, MccFeesStructured, PenaltyDetails } from "@/features/cutoffs/lib/import-schema";
import type { SourceType } from "@/types/provenance";
import { roundWordIn, seatPositionExams, type ExamKey } from "../exams/keys.ts";

export const rounds = ["R1", "R2", "R3", "stray", "special_stray"] as const;
export type Round = (typeof rounds)[number];
export const roundLabel: Record<Round, string> = { R1: "R1", R2: "R2", R3: "R3", stray: "Stray", special_stray: "Special stray" };
/** A round's short name as the exam says it (keys.ts roundWordIn: INI-CET's R3 "Open Round"); every other exam's roundLabel. */
export const roundShort = (r: Round, exam?: ExamKey) => roundWordIn(exam, r) ?? roundLabel[r];

export const baseCategories = ["Open", "OBC", "EWS", "SC", "ST"] as const;
export type BaseCategory = (typeof baseCategories)[number];
export type Category = BaseCategory | `${BaseCategory} PwD`;

export type College = {
  key: string;
  slug: string;
  name: string;
  state: string | null;
  pincode: string | null;
  /** As printed by MCC; null when only a short name was printed. */
  address: string | null;
  type: "Government" | "Deemed" | "Private" | "DNB hospital" | null;
  beds: number | null;
  established: number | null;
  website: string | null;
};
export type Course = { degree: string; specialty: string; name: string; slug: string };
export type Source = { key: string; url: string | null; year: number; round: Round; provisional: boolean; name: string };
export type Cutoff = {
  college: string; // College.key
  degree: string;
  specialty: string;
  year: number;
  round: Round;
  quota: string; // MCC label, e.g. "All India", "DNB Quota", "Deemed/Paid Seats"
  category: Category;
  opening: number;
  closing: number;
  /** Allotments made in that round (new or upgraded only in R2+). Not the seat matrix. */
  n: number;
  src: string; // Source.key
};
/** program "MD" = medical-college seats (MD, MS, Diploma, MCh…), "DNB" = DNB and NBEMS Diploma seats. */
export type Term = {
  college: string;
  program: "MD" | "DNB";
  kind: "FEE" | "STIPEND" | "BOND" | "PENALTY";
  text: string;
  amountInr: number | null;
  /** The document the text was taken from (an MCC institute profile, an NBEMS notice…). */
  source: { name: string; url: string | null; type: SourceType };
  /**
   * BOND / PENALTY: the verified record (status, years, amounts, penalty items); FEE / STIPEND (bundle schema 2): the
   * college + program's fee-table records (FeesStructured). Read by server/terms.ts, never parsed from `text`.
   */
  details?: BondDetails | PenaltyDetails | { records: FeeTableRecord[] };
};
/** A fee-table record (FeesStructured) as a summary line reads it: fee and stipend by course year, their sources, MCC's Round 2 forfeit. */
export type FeeTableRecord = Pick<MccFeesStructured, "programme" | "seat_groups" | "fee_per_year" | "stipend_per_month" | "sources"> & {
  /** Per-course figures of a deemed university's fee notice (applies_to "MD ANAESTHESIOLOGY"); absent in an older import. */
  fee_variants?: MccFeesStructured["fee_variants"] | null;
  /** null (an export older than it): verbatim, never a figure. */
  fee_display: MccFeesStructured["fee_display"] | null;
  /** The MCC profile's fee words for these seats (a verbatim record's only fee) and where they were read; absent in an older import. */
  fee_text?: string | null;
  fee_text_src?: MccFeesStructured["fee_text_src"] | null;
  fee_whole_course: MccFeesStructured["fee_whole_course"] | null;
  counselling_forfeit: MccFeesStructured["counselling_forfeit"] | null;
  /** The NBEMS minimum stipend by year, where the record compares a declared one with it (below_nbems_minimum). */
  stipend_nbems_minimum?: MccFeesStructured["stipend_nbems_minimum"] | null;
  /** The MCC quotas the record covers; absent in an older import (then every record stands for the programme). */
  quotas?: string[];
  /** A verbatim record's figures read out of its own fee words (each with its quote); absent in an older import. */
  fee_parsed?: MccFeesStructured["fee_parsed"] | null;
  /** Fee heads apart from the year figures (a hostel fee); absent in an older import. */
  other_fees?: MccFeesStructured["other_fees"] | null;
};
/**
 * PENALTY holds the college's or state's penalty for leaving the seat or course and MCC's forfeit if you resign or
 * don't join from Round 2 (its record says which: server/terms.ts); never a "bond penalty".
 */
export const termLabel: Record<Term["kind"], string> = { FEE: "Fee", STIPEND: "Stipend", BOND: "Service bond", PENALTY: "Leaving penalty / Round 2 forfeit" };
export type Allotment = {
  rank: number;
  category: Category;
  college: string;
  degree: string;
  specialty: string;
  year: number;
  round: Round;
  quota: string;
  /** As the PDF prints it, from `status` (server/queries.ts remarkOf). */
  remark: "Allotted" | "Fresh" | "Upgraded";
  /** MCC's remark normalised: allotted (R1, stray rounds), fresh or upgraded (R2, R3). */
  status: "allotted" | "fresh" | "upgraded";
  /** The candidate's own category as the PDF prints it ("General", "OBC" … "<X> PwD"), not the seat's; null: not in the import. */
  candidateCategory: string | null;
  /** The candidate's choice number of this seat (R2 / R3 only). */
  optionNo: number | null;
  /** R2 / R3: the seat the PDF prints in the previous round's columns (R1 for R2, R2 for R3) and its remark; null where it prints "-". */
  prev: PrevSeat | null;
};
export type PrevSeat = { college: string; degree: string; specialty: string; quota: string; remark: "reported" | "not_reported" | "seat_surrendered" | "seat_cancelled" };
export type Notice = { date: string; title: string; authority: string; url: string; kind: "schedule" | "announcement" | "merit"; status?: "done" | "open" | "upcoming" };

/** A whole dataset in memory: the shape of the unit-test fixture (test/decide.demo.ts). Runtime reads Postgres. */
export type DecideData = {
  colleges: College[];
  courses: Course[];
  sources: Source[];
  cutoffs: Cutoff[];
  terms: Term[];
  allotments: Allotment[];
};

/**
 * MCC PG quotas any candidate can take. The others are for one group only (Armed Forces Medical: in-service candidates;
 * Non-Resident Indian; Muslim/Jain Minority; Delhi/IP/BHU/AMU University: that university's graduates), so a profile
 * with no quota ticked means these three, and a restricted quota counts only once she ticks it.
 */
export const openQuotas = ["All India", "DNB Quota", "Deemed/Paid Seats"];
/** What Seatora covers: the State filter's note, and the end of the Quota notes (Options, Seats, the rank sheet). */
export const quotaScopeNote = "Seatora covers MCC's All India counselling (AIQ, central and deemed quotas). State quota counselling (e.g. Maharashtra's CET Cell) isn't covered: the State filter shows All India seats in that state.";
/** The Quota filter's note when her profile ticks none (Options, Seats, the rank sheet's Quotas). */
export const openQuotasNote = `None ticked means ${openQuotas.join(", ")}: the quotas anyone can take. Tick a restricted quota (Armed Forces, NRI, minority, a university's own) only if you are eligible. ${quotaScopeNote}`;

/**
 * Options' two views. "round": the newest round's seat lists first: every option with seats in them (in her courses,
 * quotas and seat categories), new options with no past allotment included, closed-before options shown, sorted by
 * label (reach.ts roundReachOrder: new and no-data before closed-before), then clear vacancy seats, then deepest closing. "all": every option with past allotments, closed-before hidden,
 * by label, then deepest closing. The default comes from the data (service.ts optionsView).
 */
export const optionsViews = ["round", "all"] as const;
export type OptionsView = (typeof optionsViews)[number];

/** One choosable option: an institute's course under one quota. */
export const optionId = (c: { college: string; degree: string; specialty: string; quota: string }) =>
  [c.college, c.degree, c.specialty, c.quota].join("~");

/**
 * MCC seat lists of a round (SeatSource), each a snapshot of its PDF as published: later MCC addition/removal notices
 * are not applied. clear = clear vacancy (seats nobody holds after the previous round), virtual = virtual vacancy (seats
 * held after the previous round that fall vacant only if their holder upgrades or leaves in this round), new = newly
 * added seats (added to the round after its seat matrix). The kinds OVERLAP (a newly added seat is also in that round's
 * clear vacancy list): never add them together; show one kind at a time.
 */
export const seatKinds = ["clear", "virtual", "new"] as const;
/**
 * Options' sort (after the label filter): "label" (default: the view's own order), "deep" / "tight" (the later past
 * year's deepest closing, deepest or tightest first), "fee" (year 1, lowest first), "stipend" (year 1, highest first).
 * A missing value goes last either way.
 */
export const optionSorts = ["label", "deep", "tight", "fee", "stipend"] as const;
export type OptionSort = (typeof optionSorts)[number];
export type SeatKind = (typeof seatKinds)[number];
export const seatKindLabel: Record<SeatKind, string> = { clear: "Clear vacancy", virtual: "Virtual vacancy", new: "Newly added seats" };
/** A seat row's category in words: INI-CET's "All" (JIPMER prints only a course total) is "Categories not split", never Open. */
export const seatCategoryName = (c: string) => (c === "All" ? "Categories not split" : c);
/** A seat list's kind as the exam names it: INI-CET's one list a session is AIIMS's "Seat position"; every other exam's seatKindLabel. */
export const kindName = (k: SeatKind, exam?: ExamKey) => (exam && seatPositionExams.includes(exam) ? "Seat position" : seatKindLabel[k]);
/**
 * One seat list PDF. `publishedAt` = date (YYYY-MM-DD) of the MCC notice that links the PDF, null when no imported notice
 * does (never guessed). `seats` = Σ seats the list prints (one kind, one PDF).
 */
export type SeatList = { key: string; name: string; url: string | null; year: number; round: Round; kind: SeatKind; publishedAt: string | null; seats: number; /** INI-CET: of `seats`, those on the quotas its seat position notifies apart (Sponsored / Foreign National). */ apart?: number };

/** MCC notices (Announcement), kind as notices.json gives it. */
export const noticeKinds = ["notice", "seat_matrix", "result", "schedule", "bulletin"] as const;
export type NoticeKind = (typeof noticeKinds)[number];
export type MccNotice = { title: string; date: string; url: string | null; authority: string; kind: NoticeKind; year: number; round: Round | null };

/** Steps of an MCC round (RoundStep), derived only from MCC notices. */
export const roundSteps = ["seat_matrix", "choice_filling", "provisional_result", "final_result"] as const;
export type RoundStepName = (typeof roundSteps)[number];
export const stepStatuses = ["done", "open", "suspended", "upcoming", "unknown"] as const;
export type StepStatus = (typeof stepStatuses)[number];
export type RoundStepInfo = {
  step: RoundStepName;
  status: StepStatus;
  /** Date of the notice behind the status; null when implied or upcoming. */
  date: string | null;
  /** The notice that justifies the status (for an upcoming step: the schedule notice). */
  url: string | null;
  title: string | null;
  note: string | null;
  /** Dates printed in MCC's schedule (YYYY-MM-DD or ISO date-time in IST); tentative = may change. */
  scheduled: { from: string | null; to: string | null; on: string | null; tentative: boolean } | null;
  /**
   * The schedule notice behind `scheduled`: `url` when that is a schedule notice, else the newest schedule notice of the
   * round (else of the year). `url` can be a later notice (e.g. a suspension) that prints no dates. Null without dates.
   */
  scheduledBy: { url: string; title: string } | null;
  /** Every notice matched to this step, oldest first. */
  events: { date: string; status: StepStatus; title: string; url: string }[];
};
