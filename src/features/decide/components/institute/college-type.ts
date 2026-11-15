import type { collegeTypes } from "@/features/cutoffs/lib/import-schema";

// College type (College.type / typeBasis, bundle schema 2): a name and quota heuristic, never an official field.
// Plain .ts (no JSX): the Seats CSV (server), the term filters and TypeBadge (components/type-badge.tsx) read it.

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

/**
 * The badge colour (Badge tone): green for a government-run hospital of any kind (state, central, ESIC, municipal,
 * armed forces, railway, PSU), blue for a deemed university, neutral for private and trust hospitals.
 */
export const collegeTypeTone: Record<CollegeType["value"], "success" | "info" | "neutral"> = {
  govt: "success",
  central: "success",
  esic: "success",
  municipal: "success",
  armed_forces: "success",
  psu: "success",
  railway: "success",
  deemed: "info",
  private: "neutral",
  trust: "neutral",
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
