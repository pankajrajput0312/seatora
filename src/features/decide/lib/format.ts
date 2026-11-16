/** "13 Nov 2026" from YYYY-MM-DD. */
export const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** ₹ in lakh with up to 2 decimals: 125000 → "₹1.25 L", 2450000 → "₹24.5 L". Null → "—". */
export function formatLakh(inr: number | null): string {
  if (inr == null) return "—";
  return `₹${Number((inr / 100000).toFixed(2))} L`;
}

/** ₹ short form: under 1 L in full Indian grouping (₹55,200), then lakh (₹1.5 L) and crore (₹2 Cr). Null → "—". */
export function formatInrShort(inr: number | null): string {
  if (inr == null) return "—";
  if (inr >= 1e7) return `₹${Number((inr / 1e7).toFixed(2))} Cr`;
  return inr >= 1e5 ? formatLakh(inr) : `₹${inr.toLocaleString("en-IN")}`;
}

/** A seat list PDF's day (YYYY-MM-DD), to tell two lists of one kind in a round apart: the date in its key ("…_2025-12-11.pdf"), else its notice date. */
export const listDay = (l: { key: string; publishedAt: string | null }) => l.key.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? l.publishedAt ?? undefined;

/** Two-letter state codes (vehicle-registration style), for a short name's tail. */
const STATE_CODE: Record<string, string> = {
  "Andaman and Nicobar Islands": "AN", "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", Assam: "AS", Bihar: "BR", Chandigarh: "CH", Chhattisgarh: "CG",
  "Dadra and Nagar Haveli": "DN", Delhi: "DL", Goa: "GA", Gujarat: "GJ", Haryana: "HR", "Himachal Pradesh": "HP", "Jammu and Kashmir": "JK", Jharkhand: "JH",
  Karnataka: "KA", Kerala: "KL", Ladakh: "LA", "Madhya Pradesh": "MP", Maharashtra: "MH", Manipur: "MN", Meghalaya: "ML", Mizoram: "MZ", Nagaland: "NL",
  Odisha: "OD", Puducherry: "PY", Punjab: "PB", Rajasthan: "RJ", Sikkim: "SK", "Tamil Nadu": "TN", Telangana: "TG", Tripura: "TR", "Uttar Pradesh": "UP",
  Uttarakhand: "UK", "West Bengal": "WB",
};
// Longest first: the whole phrase before its words.
const SHORT: [RegExp, string][] = [
  [/\bAll India Institute of Medical Sciences\b/gi, "AIIMS"],
  [/\b(?:Government|Govt\.?) Medical College\b/gi, "GMC"],
  [/\bInstitute of Medical Sciences\b/gi, "IMS"],
  [/\bMedical College\b/gi, "Med. College"],
  [/\b(?:Government|Govt\.?)(?=\s)/gi, "Govt"],
  [/\bInstitute\b/gi, "Inst."],
  [/\bHospitals\b/gi, "Hosps"],
  [/\bHospital\b/gi, "Hosp."],
  [/\bResearch\b/gi, "Res."],
  [/\bSciences\b/gi, "Sci."],
  [/\bAssociated\b/gi, "Assoc."],
  [/\bAttached\b/gi, "Att."],
  [/\bSuper ?Speciality\b|\bSuper ?Specialty\b/gi, "Super Spl."],
  [/\bDistrict\b/gi, "Dist."],
  [/\s+and\s+/gi, " & "],
];
const SMALL = new Set(["of", "and", "the", "for", "in", "at", "&"]);
/** Initialisms an ALL-CAPS name keeps as they are. */
const INITIALS = new Set(["esic", "esi", "aiims", "jipmer", "pgimer", "pgi", "kem", "sms", "mgm", "nri", "ltmg", "ltmmc", "rims", "sgpgi", "nims", "hims", "kims", "bmc", "mcd", "ndmc", "cmc", "dnb"]);
/** An ALL-CAPS name in title case (short all-consonant words and initialisms stay: "ESIC", "KEM", "BJ"). */
const titleCase = (s: string) =>
  /[a-z]/.test(s)
    ? s
    : s.toLowerCase().replace(/[A-Za-z][\w.'’]*/g, (w, i: number) => (SMALL.has(w) && i > 0 ? w : INITIALS.has(w) || (w.length <= 4 && !/[aeiou]/.test(w)) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));

/**
 * A short name for a narrow cell (a phone's pinned table cell), keeping what tells two colleges apart: the words after a
 * common phrase stay ("Government Medical College, Latur" → "GMC Latur"), common words shrink (Institute → Inst.), and
 * the state code ends it ("GMC Latur, MH"). The full name stays in view on wider screens, in its title and links.
 */
export function shortName(name: string, state?: string | null): string {
  let s = titleCase(name.trim());
  for (const [re, to] of SHORT) s = s.replace(re, to);
  s = s.replace(/^(GMC|AIIMS),\s*/, "$1 ").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ");
  const code = state ? STATE_CODE[state] : undefined;
  return code ? `${s}, ${code}` : s;
}
