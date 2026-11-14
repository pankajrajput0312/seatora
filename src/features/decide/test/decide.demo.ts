// TEST FIXTURE, illustrative only: unit tests run the service on it (setTestCatalog). Never imported at runtime.
// Every institute is "Example …"; ranks and fees are invented but plausible. No names of any person.
import type { Allotment, Category, College, Course, Cutoff, DecideData, Round, Source, Term } from "../types";

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const jitter = (seed: string, spread: number) => 1 + (((hash(seed) % 1000) / 1000) * 2 - 1) * spread;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const courses: Course[] = [
  { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
  { degree: "DNB", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "dnb-anaesthesiology" },
  { degree: "NBEMS Diploma", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "nbems-diploma-anaesthesiology" },
  { degree: "DNB", specialty: "FAMILYMEDICINE", name: "Family Medicine", slug: "dnb-family-medicine" },
];

type Spec = { name: string; state: string; pin: string; type: College["type"]; base: number; beds: number; est: number };
const gov: Spec[] = [
  ["Example Government Medical College, Mumbai", "Maharashtra", "400012", 6200, 1800, 1946],
  ["Example Government Medical College, Nagpur", "Maharashtra", "440003", 9800, 1400, 1947],
  ["Example Medical College, Bengaluru", "Karnataka", "560002", 13500, 1600, 1955],
  ["Example Government Medical College, Jaipur", "Rajasthan", "302004", 18200, 1500, 1947],
  ["Example Medical College, Kozhikode", "Kerala", "673008", 24100, 1100, 1957],
  ["Example Institute of Medical Sciences, Patna", "Bihar", "800014", 31500, 1200, 1983],
  ["Example Government Medical College, Bhopal", "Madhya Pradesh", "462001", 38600, 1000, 1955],
].map(([name, state, pin, base, beds, est]) => ({ name, state, pin, type: "Government", base, beds, est }) as Spec);
const deemed: Spec[] = [
  ["Example Deemed University Medical College, Pune", "Maharashtra", "411018", 55000, 1200, 1996],
  ["Example Deemed Institute of Medical Sciences, Chennai", "Tamil Nadu", "600116", 78000, 1500, 1985],
  ["Example Deemed Medical College, Manipal", "Karnataka", "576104", 98000, 1300, 1953],
  ["Example Deemed University Hospital, Belagavi", "Karnataka", "590010", 125000, 900, 2000],
].map(([name, state, pin, base, beds, est]) => ({ name, state, pin, type: "Deemed", base, beds, est }) as Spec);
const dnb: Spec[] = [
  ["Example Multispeciality Hospital, Navi Mumbai", "Maharashtra", "410210", 15600, 750, 2009],
  ["Example District Hospital, Thane", "Maharashtra", "400601", 19000, 400, 1962],
  ["Example Heart and General Hospital, Hyderabad", "Telangana", "500082", 23500, 550, 2001],
  ["Example Charitable Hospital, Ahmedabad", "Gujarat", "380006", 27900, 600, 1985],
  ["Example Railway Hospital, Kolkata", "West Bengal", "700043", 33000, 350, 1952],
  ["Example Trust Hospital, Ludhiana", "Punjab", "141001", 38200, 450, 1934],
  ["Example Mission Hospital, Vellore", "Tamil Nadu", "632004", 44100, 300, 1960],
  ["Example Civil Hospital, Bhubaneswar", "Odisha", "751001", 52300, 500, 1950],
  ["Example General Hospital, Lucknow", "Uttar Pradesh", "226003", 61000, 650, 1972],
].map(([name, state, pin, base, beds, est]) => ({ name, state, pin, type: "DNB hospital", base, beds, est }) as Spec);

const colleges: College[] = [...gov, ...deemed, ...dnb].map((s) => ({
  key: `${s.name.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 40)}#${s.pin}`,
  slug: slugify(`${s.name}-${s.pin}`),
  name: s.name,
  state: s.state,
  pincode: s.pin,
  address: null,
  type: s.type,
  beds: s.beds,
  established: s.est,
  website: null,
}));
const keyOf = (s: Spec) => colleges.find((c) => c.name === s.name)!.key;

const years = [2024, 2025, 2026];
const roundsByYear: Record<number, Round[]> = { 2024: ["R1", "R2", "R3", "stray"], 2025: ["R1", "R2", "R3", "stray"], 2026: ["R1"] };
const sources: Source[] = years.flatMap((year) =>
  roundsByYear[year].map((round) => ({
    key: `demo/${year}/${round}`,
    url: null,
    year,
    round,
    provisional: year === 2026,
    name: `Demo: illustrative ${year} ${round === "stray" ? "Stray" : round} allotments${year === 2026 ? " (provisional)" : ""}`,
  })),
);

const roundMul: Record<Round, number> = { R1: 1, R2: 1.12, R3: 1.3, stray: 1.45, special_stray: 1.55 };
const yearMul: Record<number, number> = { 2024: 0.95, 2025: 1, 2026: 0.97 };
const catMul: Partial<Record<Category, number>> = { Open: 1, EWS: 1.06, OBC: 1.12, SC: 2.4, ST: 3.2 };

const cutoffs: Cutoff[] = [];
function addSeries(s: Spec, course: Course, quota: string, base: number, cats: Category[]) {
  const college = keyOf(s);
  for (const year of years)
    for (const round of roundsByYear[year]) {
      for (const category of cats) {
        const seed = `${college}|${course.slug}|${year}|${round}|${category}`;
        if (hash(seed) % 9 === 0) continue; // gaps, as in real results
        if (round === "stray" && course.degree === "MD" && quota === "All India" && hash(seed) % 2) continue;
        const closing = Math.round(base * yearMul[year] * roundMul[round] * (catMul[category] ?? 4) * jitter(seed, 0.06));
        const n = round === "R1" ? 1 + (hash(seed + "n") % (quota === "All India" ? 6 : 2)) : 1 + (hash(seed + "n") % 2);
        cutoffs.push({
          college, degree: course.degree, specialty: course.specialty, year, round, quota, category,
          opening: n === 1 ? closing : Math.round(closing * 0.78), closing, n, src: `demo/${year}/${round}`,
        });
      }
    }
}
const [mdAn, dnbAn, dipAn, dnbFm] = courses;
gov.forEach((s, i) => addSeries(s, mdAn, "All India", s.base, i === 0 ? ["Open", "OBC", "EWS", "SC", "ST", "Open PwD"] : ["Open", "OBC", "EWS", "SC", "ST"]));
deemed.forEach((s) => addSeries(s, mdAn, "Deemed/Paid Seats", s.base, ["Open"]));
dnb.forEach((s, i) => {
  addSeries(s, dnbAn, "DNB Quota", s.base, ["Open", "OBC", "EWS", "SC"]);
  if (i % 2 === 0) addSeries(s, dipAn, "DNB Quota", s.base * 1.15, ["Open", "OBC", "SC"]);
  if (i !== 4) addSeries(s, dnbFm, "DNB Quota", s.base * 0.9, ["Open", "OBC", "EWS", "SC"]);
});

const terms: Omit<Term, "source">[] = [
  ...gov.flatMap((s, i): Omit<Term, "source">[] => {
    const fee = [60000, 85000, 120000, 70000, 45000, 95000, 110000][i];
    const bond = [null, 1, 2, null, 3, 2, 1][i];
    return [
      { college: keyOf(s), program: "MD", kind: "FEE", text: `₹${fee.toLocaleString("en-IN")}/yr tuition`, amountInr: fee },
      ...(i === 3 ? [] : [{ college: keyOf(s), program: "MD" as const, kind: "STIPEND" as const, text: `₹${(95000 + i * 4000).toLocaleString("en-IN")}/month (Y1)`, amountInr: 95000 + i * 4000 }]),
      ...(bond
        ? [
            { college: keyOf(s), program: "MD" as const, kind: "BOND" as const, text: `${bond} ${bond === 1 ? "year" : "years"} state service`, amountInr: null },
            { college: keyOf(s), program: "MD" as const, kind: "PENALTY" as const, text: `₹${bond * 10},00,000 forfeited if you resign/don't join from Round 2`, amountInr: bond * 1000000 },
          ]
        : []),
    ];
  }),
  ...deemed.flatMap((s, i): Omit<Term, "source">[] => [
    { college: keyOf(s), program: "MD", kind: "FEE", text: `₹${[18, 22.5, 26, 28][i]} L/yr`, amountInr: [1800000, 2250000, 2600000, 2800000][i] },
    { college: keyOf(s), program: "MD", kind: "STIPEND", text: `₹${(45000 + i * 8000).toLocaleString("en-IN")}/month (Y1)`, amountInr: 45000 + i * 8000 },
  ]),
  ...dnb.flatMap((s, i): Omit<Term, "source">[] => [
    { college: keyOf(s), program: "DNB", kind: "FEE", text: "₹1.25 L/yr + GST to NBEMS", amountInr: 125000 },
    ...(i === 6 ? [] : [{ college: keyOf(s), program: "DNB" as const, kind: "STIPEND" as const, text: `₹${(72000 + i * 2500).toLocaleString("en-IN")}/month (Y1)`, amountInr: 72000 + i * 2500 }]),
    ...(i === 1 ? [{ college: keyOf(s), program: "DNB" as const, kind: "BOND" as const, text: "1 year service", amountInr: null }] : []),
  ]),
];

// Rank-level rows behind each cutoff (no names), for Rank scan.
const remarks: Allotment["remark"][] = ["Fresh", "Upgraded", "Fresh", "Not reported"];
const allotments: Allotment[] = cutoffs.flatMap((c) =>
  Array.from({ length: c.n }, (_, i) => ({
    rank: c.n === 1 ? c.closing : Math.round(c.opening + ((c.closing - c.opening) * i) / (c.n - 1)),
    category: c.category, college: c.college, degree: c.degree, specialty: c.specialty, year: c.year, round: c.round, quota: c.quota,
    remark: c.round === "R1" ? "Fresh" : remarks[hash(`${c.college}${c.round}${i}`) % remarks.length],
  })),
);

const demoSource = { name: "Test fixture, illustrative only", url: null, type: "UNVERIFIED_COMMUNITY" as const };
export const decideDemoData: DecideData = { colleges, courses, sources, cutoffs, terms: terms.map((t) => ({ ...t, source: demoSource })), allotments };
