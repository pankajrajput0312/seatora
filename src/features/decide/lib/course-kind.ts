// A course's kind, by its specialty: Seatora's own grouping (the repo holds no NMC classification to cite), as the
// MBBS years teach them: non-clinical (basic sciences, administration), para-clinical (laboratory, diagnosis, public
// health, forensic) and clinical (patient care). Every exam's specialty codes; a code it doesn't know gets no tag.

export type CourseKind = "Clinical" | "Para-clinical" | "Non-clinical";

const NON = new Set(["ANATOMY", "PHYSIOLOGY", "BIOCHEMISTRY", "BIOPHYSICS", "HOSPITALADMINISTRATION", "HEALTHADMINISTRATION", "COMMUNITYHEALTHADMINISTRATION", "DENTALMATERIALS"]);
const PARA = new Set([
  "PATHOLOGY", "MICROBIOLOGY", "PHARMACOLOGY", "FORENSICMEDICINE", "COMMUNITYMEDICINE", "CLINICALPATHOLOGY", "BACTERIOLOGY", "IMMUNOHAEMATOLOGYANDBLOODTRANSFUSION",
  "LABORATORYMEDICINE", "PUBLICHEALTH", "MPHEPIDEMIOLOGY", "VIROLOGY", "ONCOPATHOLOGY", "CLINICALPHARMACOLOGY", "ORALPATHOLOGY", "PUBLICHEALTHDENTISTRY",
]);
/** Neither clearly: no tag rather than a guess. */
const UNSURE = new Set(["AEROSPACEMEDICINE", "MARINEMEDICINE"]);

/** The kind of a specialty (its code, any exam's: INI-CET's "NEUROLOGY6Y" too); null when Seatora doesn't group it. */
export function courseKind(specialty: string): CourseKind | null {
  const s = specialty.replace(/\d+Y$/, "");
  if (!s || UNSURE.has(s)) return null;
  return NON.has(s) ? "Non-clinical" : PARA.has(s) ? "Para-clinical" : "Clinical";
}
