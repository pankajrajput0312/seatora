import type { collegeTypes } from "@/features/cutoffs/lib/import-schema";

// College type (College.type / typeBasis, bundle schema 2): a name and quota heuristic, never an official field.
// Plain .ts (no JSX): the Seats CSV (server), the term filters and TypeBadge (components/type-badge.tsx) read it.

export type CollegeType = { value: (typeof collegeTypes)[number]; basis: string };

/**
 * The six types she sees (the ones counselling sites use): Govt, Govt-Private, Private, Deemed, AFMS, Public Sector.
 * The stored type keeps the detail (municipal, central, ESIC, railway, trust), shown in the badge's (i).
 */
export const typeCategories = ["govt", "govt_private", "private", "deemed", "afms", "public_sector"] as const;
export type TypeCategory = (typeof typeCategories)[number];
export const typeCategoryLabel: Record<TypeCategory, string> = {
  govt: "Govt",
  govt_private: "Govt-Private",
  private: "Private",
  deemed: "Deemed",
  afms: "AFMS",
  public_sector: "Public Sector",
};
export const typeCategory: Record<CollegeType["value"], TypeCategory> = {
  govt: "govt",
  municipal: "govt",
  central: "govt",
  esic: "govt",
  railway: "govt",
  govt_private: "govt_private",
  private: "private",
  trust: "private",
  deemed: "deemed",
  armed_forces: "afms",
  psu: "public_sector",
};
/** The stored types in a shown type (the filters keep comparing stored types). */
export const typesIn = (c: TypeCategory) => (Object.keys(typeCategory) as CollegeType["value"][]).filter((t) => typeCategory[t] === c);
/** A stored or legacy value (an old link's ctype=esic) as its shown type. */
export const asCategory = (v: string): TypeCategory | undefined =>
  (typeCategories as readonly string[]).includes(v) ? (v as TypeCategory) : typeCategory[v as CollegeType["value"]];

/** What a stored type shows as: its one of the six. */
export const collegeTypeLabel: Record<CollegeType["value"], string> = Object.fromEntries(
  (Object.keys(typeCategory) as CollegeType["value"][]).map((t) => [t, typeCategoryLabel[typeCategory[t]]]),
) as Record<CollegeType["value"], string>;

/** The detail under a shown type, for the badge's (i): "Municipal corporation" under Govt, "Charitable trust" under Private. */
export const collegeTypeDetail: Partial<Record<CollegeType["value"], string>> = {
  municipal: "Municipal corporation",
  central: "Central government",
  esic: "ESIC",
  railway: "Indian Railways",
  trust: "Charitable trust",
  govt_private: "Government-aided, privately run",
  psu: "Public-sector undertaking",
  armed_forces: "Armed Forces Medical Services",
};

/**
 * The badge's colour group (docs/APP_DESIGN_SYSTEM.md "Colour key"), one per shown type, from the existing type colours:
 * Govt green, AFMS teal, Public Sector violet, Deemed blue, Govt-Private plum, Private neutral grey. Each badge says its
 * type in words too.
 */
export const collegeTypeGroup: Record<CollegeType["value"], "govt" | "central" | "esic" | "deemed" | "trust" | "private"> = Object.fromEntries(
  (Object.keys(typeCategory) as CollegeType["value"][]).map((t) => [
    t,
    ({ govt: "govt", afms: "central", public_sector: "esic", deemed: "deemed", govt_private: "trust", private: "private" } as const)[typeCategory[t]],
  ]),
) as Record<CollegeType["value"], "govt" | "central" | "esic" | "deemed" | "trust" | "private">;

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
  const detail = collegeTypeDetail[t.value] ? `${collegeTypeDetail[t.value]}. ` : "";
  if (t.basis.startsWith("verified") || t.basis.startsWith("correction")) return `${detail}Checked against public sources (${t.basis.replace(/^(verified|correction):\s*/, "")}). Not an official MCC field.`;
  if (!inferred(t)) return `${detail}From Seatora's research on this hospital. Not an official field.`;
  if (t.basis.includes("default")) return `${detail}Inferred from name and quota: no government word in the name, so private by default. Not an official field.`;
  if (t.basis.includes("seat-list")) return `${detail}Inferred from name and quota (the seat list's quotas). Not an official field.`;
  return `${detail}Inferred from name and quota. Not an official field.`;
}
