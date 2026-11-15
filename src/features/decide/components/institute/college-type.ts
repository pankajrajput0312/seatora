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
 * The badge's colour group (docs/APP_DESIGN_SYSTEM.md "Colour key"): state government (and municipal) green, central
 * government (AIIMS-type, armed forces, railway, PSU) teal, ESIC violet, deemed blue, trust plum, private neutral grey.
 * Each badge says its type in words too.
 */
export const collegeTypeGroup: Record<CollegeType["value"], "govt" | "central" | "esic" | "deemed" | "trust" | "private"> = {
  govt: "govt",
  municipal: "govt",
  central: "central",
  armed_forces: "central",
  psu: "central",
  railway: "central",
  esic: "esic",
  deemed: "deemed",
  trust: "trust",
  private: "private",
};

/** Badge classes per group: the colour as text on a 10% tint of itself, with a hairline of it (globals.css --color-type-*). */
export const collegeTypeClass: Record<(typeof collegeTypeGroup)[CollegeType["value"]], string> = {
  govt: "bg-type-govt/10 text-type-govt ring-1 ring-inset ring-type-govt/30",
  central: "bg-type-central/10 text-type-central ring-1 ring-inset ring-type-central/30",
  esic: "bg-type-esic/10 text-type-esic ring-1 ring-inset ring-type-esic/30",
  deemed: "bg-type-deemed/10 text-type-deemed ring-1 ring-inset ring-type-deemed/30",
  trust: "bg-type-trust/10 text-type-trust ring-1 ring-inset ring-type-trust/30",
  private: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
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
