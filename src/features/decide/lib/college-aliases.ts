// What people call colleges, for the searches (Options, Institutes, Residents): a short name stands for words of the
// official name as MCC prints it in the data (each checked against the College table, 16 Nov 2026). Its city is in the
// college's address, which the searches read too ("Mumbai" finds KEM). Keys are one lowercase word; an ambiguous
// one ("MMC": Madras or Mysore) stands for each.

const ALIASES: Record<string, string[]> = {
  kem: ["gordhandas sunderdas"], // Seth Gordhandas Sunderdas Medical College (and KEM Hospital), Mumbai
  gsmc: ["gordhandas sunderdas"],
  mamc: ["maulana azad medical"],
  lhmc: ["lady hardinge"],
  ltmmc: ["lokmanya tilak medical"],
  ltmgh: ["lokmanya tilak medical"],
  sion: ["lokmanya tilak medical"],
  jj: ["grant medical college"], // Grant Medical College and Sir JJ Group of Hospitals, Mumbai
  mmc: ["madras medical college", "mysore medical college"],
  bjmc: ["b. j. medical", "b.j.government medical"], // Ahmedabad, Pune
  vmmc: ["vardhman mahavir"],
  safdarjung: ["vardhman mahavir"],
  ucms: ["university college of medical sciences"],
  gtb: ["university college of medical sciences"],
  abvims: ["atal bihari vajpayee institute of medical sciences"],
  kgmu: ["king georges medical"],
  kgmc: ["king georges medical"],
  bhu: ["banaras hindu"],
  sms: ["sawai man singh"],
  afmc: ["armed forces medical"],
  kmc: ["kasturba medical college", "kilpauk medical"],
  bmcri: ["bangalore medical college"],
  bmc: ["bangalore medical college", "burdwan medical"],
  tnmc: ["topiwala national"],
  cmc: ["christian medical college"], // Vellore
  sgpgi: ["sanjay gandhi post"],
  sgpgims: ["sanjay gandhi post"],
  tmc: ["tata memorial", "thanjavur medical"],
  ipgmer: ["ipgme&r"], // IPGME&R and SSKM Hospital, Kolkata
  ipgme: ["ipgme&r"],
  rml: ["atal bihari vajpayee institute"], // ABVIMS and Dr. RML Hospital, Delhi (once PGIMER Dr RML); the name has "RML" too
  pgimer: ["atal bihari vajpayee institute"], // PGIMER Dr RML, Delhi (PGIMER Chandigarh is INI-CET's)
  maids: ["maulana azad institute"], // Maulana Azad Institute of Dental Sciences, Delhi (NEET MDS)
};
/** Names of more than one word people type for a short name ("King Edward" for KEM). */
const PHRASES: [RegExp, string][] = [[/\bking\s+edward(\s+memorial)?\b/g, "kem"]];

/** Admitted through INI-CET (INI-SS for super-speciality), not MCC's counselling, so in none of MCC's lists in the data. PGIMER: Chandigarh's (Delhi's, Dr RML, is MCC's). */
const INI_CET = new Set(["aiims", "jipmer", "pgimer", "nimhans", "sctimst"]);

/**
 * The search as lists of words (any one list may match; every word of it must): each word as typed, or a short name
 * replaced by the words it stands for ("kem radio" → [kem, radio] or [gordhandas, sunderdas, radio]). Lowercase.
 */
export function searchAlternatives(q: string | undefined): string[][] {
  const words = PHRASES.reduce((x, [re, to]) => x.replace(re, to), q?.toLowerCase() ?? "").split(/[\s,]+/).filter(Boolean);
  let alts: string[][] = [[]];
  for (const w of words) {
    const as = [w, ...(ALIASES[w] ?? [])].map((a) => a.split(/\s+/));
    alts = alts.flatMap((alt) => as.map((a) => [...alt, ...a])).slice(0, 8);
  }
  return words.length ? alts : [];
}

/** A matcher for `q` (null: no search): some alternative has every word in `text` (any case). */
export function searchMatcher(q: string | undefined): ((text: string) => boolean) | null {
  const alts = searchAlternatives(q);
  if (!alts.length) return null;
  return (text) => {
    const t = text.toLowerCase();
    return alts.some((alt) => alt.every((w) => t.includes(w)));
  };
}

/** The INI-CET institute a search names ("AIIMS"), if any: the empty state says why it is not here. */
export const iniCetIn = (q: string | undefined) => {
  const words = q?.toLowerCase().split(/[\s,]+/) ?? [];
  const w = words.find((x) => INI_CET.has(x) && (x !== "pgimer" || words.includes("chandigarh")));
  return w ? (w === "pgimer" ? "PGIMER Chandigarh" : w.toUpperCase()) : null;
};
/** What admits the institute `iniCetIn` names for this exam instead of MCC: INI-SS for NEET SS, else INI-CET. */
export const iniWord = (exam: string) => (exam === "neet-ss" ? "INI-SS" : "INI-CET");
