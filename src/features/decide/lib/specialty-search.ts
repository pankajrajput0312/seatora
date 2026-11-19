/**
 * Specialty search by common names (Radiology finds Radio-diagnosis, Skin finds DVL…) and tidy display names, shared
 * by the profile dialog and the Course filters.
 */

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** What doctors type → a piece of the official name (compared without spaces or punctuation). */
const ALIASES: Record<string, string[]> = {
  radiology: ["radiodiagnosis"],
  dermatology: ["derm"],
  skin: ["derm"],
  dvl: ["derm"],
  obg: ["obst", "gynae"],
  obgy: ["obst", "gynae"],
  obstetrics: ["obst"],
  gynae: ["gynae"],
  gynaecology: ["gynae"],
  gynecology: ["gynae"],
  ent: ["otorhinolaryngology"],
  respiratory: ["respiratory", "chest"],
  chest: ["respiratory", "chest"],
  tb: ["respiratory", "chest"],
  pulmonology: ["respiratory", "chest"],
  ortho: ["orthopaedics"],
  medicine: ["generalmedicine"],
  surgery: ["generalsurgery"],
  paeds: ["paediatric"],
  peds: ["paediatric"],
  pediatrics: ["paediatric"],
  psych: ["psychiatry"],
  anaesthesia: ["anaesthesiology"],
  anesthesia: ["anaesthesiology"],
  anesthesiology: ["anaesthesiology"],
  // Everyday words (a parent searching for his daughter): eye, child, bones…
  eye: ["ophthalmology"],
  eyes: ["ophthalmology"],
  child: ["paediatric"],
  children: ["paediatric"],
  kids: ["paediatric"],
  bone: ["orthopaedics"],
  bones: ["orthopaedics"],
  women: ["obst", "gynae"],
  pregnancy: ["obst"],
  heart: ["cardio", "generalmedicine"],
  mind: ["psychiatry"],
  mental: ["psychiatry"],
  ear: ["otorhinolaryngology"],
  nose: ["otorhinolaryngology"],
  throat: ["otorhinolaryngology"],
  xray: ["radiodiagnosis"],
  scan: ["radiodiagnosis"],
};

/** Does `label` match what she typed: every typed word is in it, or the typed text is (the start of) a common name. */
export function matchesSpecialty(query: string, label: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const l = label.toLowerCase();
  if (words.every((w) => l.includes(w))) return true;
  const q = compact(query);
  const lc = compact(label);
  // Exact short names (ENT, TB), or 3+ letters of a longer one ("radiol").
  const hit = (alias: string) => alias === q || (q.length >= 3 && (alias.startsWith(q) || q.startsWith(alias)));
  return Object.entries(ALIASES).some(([alias, targets]) => hit(alias) && targets.some((t) => lc.includes(t)));
}

/** Names that read badly even title-cased (abbreviated in the MCC lists). */
const NAMES: Record<string, string> = {
  DERMATOLOGY: "Dermatology, Venereology and Leprosy (DVL)",
  OBG: "Obstetrics and Gynaecology",
  PHYSICALMEDICINEANDREHABILITATION: "Physical Medicine and Rehabilitation",
  COMMUNITYHEALTHADMINISTRATION: "Community Health and Administration",
  RESPIRATORYMEDICINE: "Respiratory Medicine",
};
const KEEP = new Set(["ENT", "DVL", "OBG", "TB"]);
const SMALL = new Set(["and", "of", "in"]);

/** A specialty's display name: ALL-CAPS MCC names title-cased ("T.B. and CHEST DISEASES" → "T.B. and Chest Diseases"). */
export function specialtyName(name: string, code?: string): string {
  if (code && NAMES[code]) return NAMES[code];
  if (!/[A-Z]{3}/.test(name)) return name;
  return name.replace(/[A-Za-z]+/g, (w, i: number) => {
    if (KEEP.has(w) || w.length === 1) return w;
    const lower = w.toLowerCase();
    return i > 0 && SMALL.has(lower) ? lower : lower[0].toUpperCase() + lower.slice(1);
  });
}

/**
 * A deemed university's per-course fee (a fee record's fee_variants, applies_to "MD ANAESTHESIOLOGY") for one course:
 * its degree and specialty, else its specialty alone; undefined when the record lists none for it.
 */
export function variantFor<V extends { applies_to: string }>(variants: V[], degree: string, specialty: string): V | undefined {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const want = norm(`${degree} ${specialty}`);
  return variants.find((x) => norm(x.applies_to) === want) ?? variants.find((x) => norm(x.applies_to).endsWith(norm(specialty)));
}
