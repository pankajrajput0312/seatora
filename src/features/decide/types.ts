// Shapes mirror the MCC export the importer reads (prisma/import-mcc.ts, src/features/cutoffs/lib/import-schema.ts).
// No person-level data: no names.
import type { SourceType } from "@/types/provenance";

export const rounds = ["R1", "R2", "R3", "stray", "special_stray"] as const;
export type Round = (typeof rounds)[number];
export const roundLabel: Record<Round, string> = { R1: "R1", R2: "R2", R3: "R3", stray: "Stray", special_stray: "Special stray" };

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
};
/** PENALTY is MCC's seat-leaving forfeit (resign / don't join from Round 2), not a bond penalty. */
export const termLabel: Record<Term["kind"], string> = { FEE: "Fee", STIPEND: "Stipend", BOND: "Service bond", PENALTY: "Seat-leaving penalty (MCC)" };
export type Allotment = {
  rank: number;
  category: Category;
  college: string;
  degree: string;
  specialty: string;
  year: number;
  round: Round;
  quota: string;
  remark: "Fresh" | "Upgraded" | "Not reported";
};
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

/** One choosable option: an institute's course under one quota. */
export const optionId = (c: { college: string; degree: string; specialty: string; quota: string }) =>
  [c.college, c.degree, c.specialty, c.quota].join("~");
