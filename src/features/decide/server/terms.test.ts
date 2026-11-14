import { expect, it } from "vitest";
import type { Term } from "../types";
import { normalizeProgramme, parseBond, parseFee, parseStipend, programmeOfDegree, programmesOf, rupeesOutside, termQuality } from "./terms";

// Texts exactly as they are in CollegeTerm (the MCC import), one per shape.
const MCC = (id: number) => ({ name: "MCC institute profile (college declaration)", url: `https://mcc.admissions.nic.in/Counseling/Handler/ViewInstituteProfileDetailsDynamic.ashx?boardId=140012521&InstituteId=${id}`, type: "OFFICIAL" as const });
const NBEMS = { name: "NBEMS notice", url: "https://natboard.edu.in/viewnbeNotice?NBE=Ty9SNFNHbExvQ0phdHlPaGl5cWN0dz09", type: "OFFICIAL" as const };
const term = (program: Term["program"], kind: Term["kind"], text: string, source = MCC(700359)): Term => ({ college: "X", program, kind, text, amountInr: null, source });

const AGARTALA_BOND =
  "Service bond ₹50,00,000 (clinical PG degree); ₹35,00,000 (pre/para-clinical); ₹15,00,000 (PG diploma) (1 year (extendable up to 2 more years) service); seat-leaving penalty ₹35,00,000 (clinical PG degree); ₹25,00,000 (pre/para-clinical); ₹10,00,000 (PG diploma); applies to State quota non-sponsored/domicile candidates; AIQ candidates only if they take stipend/salary from Govt of Tripura (summary of the bond document on the MCC institute profile)";

it("reads the two fee shapes", () => {
  expect(parseFee("₹150,000/yr — college declaration to MCC 2025")).toEqual({ inr: 150000, kind: "declared", note: null, year: 2025, quality: "full" });
  expect(parseFee("₹1.25 L/yr + GST to NBEMS (official DNB course fee)")).toEqual({ inr: 125000, kind: "nbems", note: "+ GST", year: null, quality: "full" });
  expect(parseFee("Not listed")).toBeNull();
});

it("reads stipends by year, the NBEMS floor as a year-1 minimum and the NMC figure as every year", () => {
  expect(parseStipend("₹63,000 / 64,000 / 65,000/month (yr 1/2/3) — college declaration to MCC 2025")).toMatchObject({ perYear: [63000, 64000, 65000], kind: "declared", year: 2025, quality: "full" });
  expect(parseStipend("₹25,000 / 35,000/month (yr 1/2/3) — college declaration to MCC 2025")).toMatchObject({ perYear: [25000, 35000], quality: "partial" });
  expect(parseStipend("At least ₹43,000/month yr 1 (NBEMS floor from Jun 2025; state rate if higher) — actual not verified")).toMatchObject({ perYear: [43000], kind: "minimum", year: 2025 });
  expect(parseStipend("₹55,200/month PG (NMC stipend filing)")).toMatchObject({ perYear: [55200], allYears: true, kind: "nmc" });
});

it("splits a bond into years, amounts by course type, leaving penalty and who it applies to", () => {
  const b = parseBond(AGARTALA_BOND)!;
  expect(b.yearsText).toBe("1 year (extendable up to 2 more years)");
  expect(b.amounts.map((a) => [a.inr, a.group])).toEqual([[5000000, "degree"], [3500000, "degree"], [1500000, "diploma"]]);
  expect(b.leaving.map((a) => a.inr)).toEqual([3500000, 2500000, 1000000]);
  expect(b.appliesTo).toMatch(/^State quota .* Govt of Tripura$/);
  expect(b.quality).toBe("full");
  expect(b.text).not.toContain("summary of the bond document");
});

it("sums figures outside brackets only, lakh and crore aware", () => {
  expect(rupeesOutside("₹20,00,000 + ₹10,00,000 seat lapse")).toBe(3000000);
  expect(rupeesOutside("₹40,00,000 (₹10 lakh bank/property guarantee + ₹30 lakh undertaking)")).toBe(4000000);
  expect(rupeesOutside("₹50 lakh for Anaesthesia (Rajasthan 2025-26 subject-wise bond: ₹25 L – ₹1.5 Cr by specialty)")).toBe(5000000);
  expect(rupeesOutside("₹2 crore")).toBe(20000000);
  expect(rupeesOutside("Debarred from next academic session's admission")).toBeNull();
});

it("per programme: diploma figures for the Diploma, the rest for MD/MS; 2-year diploma has no year 3", () => {
  const terms = [
    term("MD", "FEE", "₹150,000/yr — college declaration to MCC 2025"),
    term("MD", "STIPEND", "₹55,200 / 56,925 / 58,650/month (yr 1/2/3) — college declaration to MCC 2025"),
    term("MD", "BOND", AGARTALA_BOND),
    term("MD", "PENALTY", "₹1,500 forfeited if you resign/don't join from Round 2 (MCC profile)"),
  ];
  const md = normalizeProgramme("MD/MS", terms);
  expect(md.years.map((y) => [y.year, y.fee?.inr, y.stipend?.inr])).toEqual([[1, 150000, 55200], [2, 150000, 56925], [3, 150000, 58650]]);
  expect(md.wholeCourseFee).toBe(450000);
  expect([md.bond.years, md.bond.amount.min, md.bond.amount.max, md.bond.leavingAmount.max, md.bond.otherAmounts]).toEqual([1, 3500000, 5000000, 3500000, true]);
  expect(md.resignForfeit?.inr).toBe(1500);
  // Fee and stipend share the MCC profile's source; the bond summary is its own; the MCC id is kept.
  expect(md.sources.map((s) => [s.n, s.label, s.year, s.mccId])).toEqual([
    [1, "Declared by the college to MCC", 2025, "700359"],
    [2, "Bond document summary on the college's MCC profile", null, "700359"],
    [3, "The college's MCC profile", null, "700359"],
  ]);
  const dip = normalizeProgramme("Diploma", terms);
  expect(dip.years.map((y) => y.year)).toEqual([1, 2]);
  expect(dip.wholeCourseFee).toBe(300000);
  expect([dip.bond.amount.max, dip.bond.leavingAmount.max]).toEqual([1500000, 1000000]);
});

it("bond years: the longest for the programme; never in-service or super-speciality figures for MD/MS", () => {
  const p = (text: string, prog: "MD/MS" | "Diploma" | "MCh" = "MD/MS") => normalizeProgramme(prog, [term("MD", "BOND", `${text} (summary of the bond document on the MCC institute profile)`)]).bond;
  const max = (b: ReturnType<typeof p>) => ({ years: b.years, max: b.amount.max, status: b.status });
  expect(max(p("Service bond ₹50,00,000 (PG); ₹2,00,00,000 (super-speciality) (1 year (PG); 2 years (super-speciality) service)"))).toEqual({ years: 1, max: 5000000, status: "declared" });
  expect(max(p("Service bond ₹50,00,000 (PG); ₹2,00,00,000 (super-speciality) (1 year (PG); 2 years (super-speciality) service)", "MCh"))).toEqual({ years: 2, max: 20000000, status: "declared" });
  expect(max(p("Service bond ₹10,00,000 (non-in-service); ₹50,00,000 (in-service) (1 year (non-in-service); 5 years (in-service) service)"))).toMatchObject({ years: 1, max: 1000000 });
  expect(p("Service bond Double the stipend/salary received for 3 years of study (2 years service)")).toMatchObject({ years: 2, amount: { state: "words", max: null } });
  expect(p("Service bond Gujarat govt service bond")).toMatchObject({ years: null, amount: { state: "words" }, status: "declared" });
  // Seth GS: the declared bond is for super-speciality courses only.
  expect(p("Service bond ₹2,00,00,000 (2 years service); seat-leaving penalty ₹20,00,000; applies to Super-speciality course")).toMatchObject({ status: "other_course" });
  // "additional ₹10 L" adds to the part before it.
  expect(p("Service bond ₹50,00,000 (1 year service); seat-leaving penalty ₹10,00,000 for not completing Junior Residency; additional ₹10,00,000 for lapse of seat").leavingAmount.max).toBe(2000000);
});

it("a per defaulting year bond: one computed figure (amount × years) everywhere, the published amount kept", () => {
  const nb = "Service bond ₹10,00,000 per defaulting year (3 years (Post Doctoral/MD/MS); 2 years (PG Diploma) service)";
  const md = normalizeProgramme("MD/MS", [term("MD", "BOND", nb)]).bond;
  expect([md.years, md.amount.min, md.amount.max, md.amount.perYear]).toEqual([3, 3000000, 3000000, 1000000]);
  expect(normalizeProgramme("Diploma", [term("MD", "BOND", nb)]).bond.amount).toMatchObject({ max: 2000000, perYear: 1000000 });
});

it("All India figures over state-quota ones; a bracketed 'minimum N years' counts", () => {
  const sbls = "Service bond ₹10,00,000 (AIQ); ₹15,00,000 (State fresh candidates) (1 year (AIQ); 2 years (State fresh candidates) service); seat-leaving penalty balance fee for the whole course (bond/bank guarantee may be sought); applies to Post-MBBS DNB/Diploma in Punjab District Hospitals";
  const b = normalizeProgramme("DNB", [term("DNB", "BOND", sbls)]).bond;
  expect([b.years, b.amount.max, b.otherAmounts]).toEqual([1, 1000000, true]);
  // Leaving declared in words only: not "not declared".
  expect(b.leavingAmount).toMatchObject({ state: "words", max: null });
  expect(normalizeProgramme("MD/MS", [term("MD", "BOND", "Service bond ₹5,00,000 (1 year (clause 2 says minimum 3 years) service); applies to Government seats, AIQ/State quota, PG degree & diploma (Karnataka)")]).bond.years).toBe(3);
});

it("leaving penalties in words: 'Bond amount payable…' is the bond amount; partly in words is marked", () => {
  const baroda = "Service bond ₹40,00,000 (₹10 lakh bank/property guarantee + ₹30 lakh undertaking) (1 year service); seat-leaving penalty Bond amount payable if PG course not completed; applies to State-quota PG diploma/degree in Gujarat govt medical colleges";
  expect(normalizeProgramme("MD/MS", [term("MD", "BOND", baroda)]).bond.leavingAmount).toMatchObject({ state: "figure", max: 4000000, more: false });
  const kc = "Service bond ₹20,00,000 (1 year service); seat-leaving penalty ₹20,00,000 (discontinuing, strike, indiscipline, or failing NBE exam); affidavit also says fee of entire course payable on leaving; applies to DNB/Diploma in Karnataka State Government hospitals";
  expect(normalizeProgramme("DNB", [term("DNB", "BOND", kc)]).bond.leavingAmount).toMatchObject({ state: "figure", max: 2000000, more: true });
  // A specialty range: the cautious highest, marked as varying.
  const sms = "Service bond ₹50 lakh for Anaesthesia (Rajasthan 2025-26 subject-wise bond: ₹25 L – ₹1.5 Cr by specialty) (2 years service); seat-leaving penalty ₹10,00,000 (incl. ₹1,50,000 bank guarantee); applies to AIQ & State quota non-service MD/MS";
  expect(normalizeProgramme("MD/MS", [term("MD", "BOND", sms)]).bond.amount).toMatchObject({ min: 2500000, max: 15000000, varies: true });
});

it("figures for other courses in 'applies to': the diploma's and the super-speciality's own", () => {
  const up = "Service bond ₹40,00,000 (2 years service); applies to PG (MD/MS) at UP Govt medical colleges (PG diploma/MDS ₹20 lakh; super-speciality ₹1 crore, 2 years)";
  expect(normalizeProgramme("MD/MS", [term("MD", "BOND", up)]).bond).toMatchObject({ years: 2, amount: { max: 4000000 }, fromAppliesTo: false });
  expect(normalizeProgramme("Diploma", [term("MD", "BOND", up)]).bond).toMatchObject({ years: 2, amount: { max: 2000000 }, fromAppliesTo: true });
  expect(normalizeProgramme("MCh", [term("MD", "BOND", up)]).bond).toMatchObject({ years: 2, amount: { max: 10000000 } });
  const cnmc = "Service bond ₹10,00,000 per defaulting year (3 years service); seat-leaving penalty ₹5,00,000; applies to PG Degree (non-in-service); Diploma: 2 years service, ₹2,00,000 discontinuation";
  expect(normalizeProgramme("Diploma", [term("MD", "BOND", cnmc)]).bond).toMatchObject({ years: 2, amount: { max: 2000000, perYear: 1000000 }, leavingAmount: { max: 200000 } });
  expect(normalizeProgramme("MD/MS", [term("MD", "BOND", cnmc)]).bond).toMatchObject({ years: 3, amount: { max: 3000000 }, leavingAmount: { max: 500000 } });
});

it("MCh and MPH: never the MD/MS fee or stipend; a PG-only bond is not theirs", () => {
  const t = normalizeProgramme("MCh", [
    term("MD", "FEE", "₹127,420/yr — college declaration to MCC 2025"),
    term("MD", "STIPEND", "₹55,200 / 56,925 / 58,650/month (yr 1/2/3) — college declaration to MCC 2025"),
    term("MD", "BOND", "Service bond ₹10,00,000 (unreserved); ₹5,00,000 (reserved) (1 year service); seat-leaving penalty ₹25,00,000; applies to AIQ PG candidates, BMHRC Bhopal"),
  ]);
  expect(t.years).toHaveLength(6);
  expect(t.years.every((y) => !y.fee && !y.stipend)).toBe(true);
  expect(t.wholeCourseFee).toBeNull();
  expect(t.notes[0]).toMatch(/none is declared for MCh/);
  expect(t.bond.status).toBe("other_course");
});

it("a kind filed under the college's other bucket is used, and its source says so; one that names only the other's courses is not", () => {
  const p700750 = MCC(700750);
  const terms = [
    term("DNB", "FEE", "₹105,000/yr — college declaration to MCC 2025", p700750),
    term("DNB", "STIPEND", "₹40,000 / 45,000 / 50,000/month (yr 1/2/3) — college declaration to MCC 2025", p700750),
    term("DNB", "BOND", "Service bond ₹40,00,000 (2 years service); applies to Direct candidates (State/AIQ) in HP Govt Medical Colleges", p700750),
  ];
  const md = normalizeProgramme("MD/MS", terms);
  expect([md.years[0].fee?.inr, md.years[0].stipend?.inr, md.bond.status, md.bond.years]).toEqual([105000, 40000, "declared", 2]);
  expect(md.sources.every((s) => s.filedUnder === "DNB")).toBe(true);
  // The NBEMS fee is never an MD/MS fee.
  expect(normalizeProgramme("MD/MS", [term("DNB", "FEE", "₹1.25 L/yr + GST to NBEMS (official DNB course fee)", NBEMS)]).years[0].fee).toBeNull();
  const hbch = normalizeProgramme("DNB", [term("MD", "BOND", "Service bond ₹25,00,000 + GST (1 year service); applies to MD course at Homi Bhabha Cancer Hospital, Varanasi")]);
  expect(hbch.bond.status).toBe("other_course");
});

it("known misreads and shared profiles: the hostel fee is not the fee; a profile cited by several institutes says so", () => {
  const t = normalizeProgramme("MD/MS", [term("MD", "FEE", "₹305,000/yr — college declaration to MCC 2025", MCC(700440))], (id) => (id === "700440" ? 2 : 1));
  expect(t.years[0].fee).toBeNull();
  expect(t.wholeCourseFee).toBeNull();
  expect(t.unread[0]).toMatchObject({ kind: "FEE", why: expect.stringMatching(/hostel fee/) });
  expect(t.sources[0]).toMatchObject({ sharedBy: 2, label: expect.stringMatching(/^From an MCC profile that 2 institutes/) });
  const nmc = normalizeProgramme("MD/MS", [term("MD", "STIPEND", "₹55,200/month PG (NMC stipend filing)", { name: "Official document (nmc.org.in)", url: "https://nmc.org.in/storage/stipend-details/stipend-detail-list.pdf", type: "OFFICIAL" })]);
  expect(nmc.sources[0]).toMatchObject({ label: "NMC stipend list", year: 2024 });
});

it("DNB hospital with only the NBEMS fee and a declared stipend: no bond term means not declared, never 'no bond'", () => {
  const t = normalizeProgramme("DNB", [
    term("DNB", "FEE", "₹1.25 L/yr + GST to NBEMS (official DNB course fee)", NBEMS),
    term("DNB", "STIPEND", "₹63,000 / 64,000 / 65,000/month (yr 1/2/3) — college declaration to MCC 2025", MCC(700970)),
  ]);
  expect(t.years.map((y) => y.fee?.kind)).toEqual(["nbems", "nbems", "nbems"]);
  expect(t.feeNote).toBe("+ GST");
  expect(t.bond.status).toBe("not_declared");
  expect(t.resignForfeit).toBeNull();
  expect(t.sources.map((s) => s.label)).toEqual(["NBEMS fee notice", "Declared by the college to MCC"]);
  // The bucket's own term wins over the other bucket's; the other's is used only when the bucket has none.
  const both = [term("DNB", "FEE", "₹1.25 L/yr + GST to NBEMS (official DNB course fee)", NBEMS), term("MD", "FEE", "₹150,000/yr — college declaration to MCC 2025")];
  expect(normalizeProgramme("NBEMS Diploma", both).years.map((y) => y.fee?.kind)).toEqual(["nbems", "nbems"]);
  expect(normalizeProgramme("NBEMS Diploma", both.slice(1)).sources[0].filedUnder).toBe("MD/MS");
});

it("an unknown shape is kept as published, never dropped", () => {
  const t = normalizeProgramme("MD/MS", [term("MD", "FEE", "As per state government order")]);
  expect(t.years[0].fee).toBeNull();
  expect(t.unread).toEqual([{ kind: "FEE", text: "As per state government order", src: 1 }]);
  expect(termQuality({ kind: "FEE", text: "As per state government order" })).toBe("none");
});

it("programmes from degrees, in display order", () => {
  expect(programmesOf(["DNB", "MS", "Diploma", "NBEMS Diploma", "MD"])).toEqual(["MD/MS", "Diploma", "DNB", "NBEMS Diploma"]);
  expect(["MD", "MS", "DrNB", "MCh", "MPH"].map(programmeOfDegree)).toEqual(["MD/MS", "MD/MS", "DNB", "MCh", "MPH"]);
});
