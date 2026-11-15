import type { collegeTypes } from "@/features/cutoffs/lib/import-schema";

// College type (College.type / typeBasis, bundle schema 2): a name and quota heuristic, never an official field.
// Plain .ts (no JSX): the Seats CSV (server) and TypeBadge (hospital-bits.tsx) both read it.

export type CollegeType = { value: (typeof collegeTypes)[number]; basis: string };

export const collegeTypeLabel: Record<CollegeType["value"], string> = {
  govt: "Government",
  private: "Private",
  trust: "Trust",
  deemed: "Deemed",
  central: "Central government",
  esic: "ESIC",
  municipal: "Municipal",
  armed_forces: "Armed forces",
  psu: "Public sector (PSU)",
  railway: "Railway",
};

/** Whether the type was inferred from the name and quota (else Seatora's research on the hospital named it). */
export const inferred = (t: CollegeType) => t.basis.startsWith("inferred");

/** The tooltip: how the type was arrived at, never "official". */
export function typeNote(t: CollegeType): string {
  if (!inferred(t)) return "From Seatora's research on this hospital. Not an official field.";
  if (t.basis.includes("default")) return "Inferred from name and quota: no government word in the name, so private by default. Not an official field.";
  if (t.basis.includes("seat-list")) return "Inferred from name and quota (the seat list's quotas). Not an official field.";
  return "Inferred from name and quota. Not an official field.";
}
