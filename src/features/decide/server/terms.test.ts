import { expect, it } from "vitest";
import type { FeeTableRecord, Term } from "../types";
import type { BondDetails, PenaltyDetails } from "@/features/cutoffs/lib/import-schema";
import { bucketOfDegree, groupOf, normalizeProgramme, parseFee, parseStipend, programmeOfDegree, programmesOf, termQuality } from "./terms";

// Fee and stipend texts exactly as they are in CollegeTerm (the MCC import), one per shape; bonds and penalties as their records.
const MCC = (id: number) => ({ name: "MCC institute profile (college declaration)", url: `https://mcc.admissions.nic.in/Counseling/Handler/ViewInstituteProfileDetailsDynamic.ashx?boardId=140012521&InstituteId=${id}`, type: "OFFICIAL" as const });
const NBEMS = { name: "NBEMS notice", url: "https://natboard.edu.in/viewnbeNotice?NBE=Ty9SNFNHbExvQ0phdHlPaGl5cWN0dz09", type: "OFFICIAL" as const };
const term = (program: Term["program"], kind: Term["kind"], text: string, source: Term["source"] = MCC(700359)): Term => ({ college: "X", program, kind, text, amountInr: null, source });

// ---------- verified records (BOND / PENALTY `details`), shapes as the bundle has them ----------

const PROFILE = MCC(700359);
const bond = (program: Term["program"], text: string, amountInr: number | null, details: BondDetails, source: Term["source"] = PROFILE): Term => ({ ...term(program, "BOND", text, source), amountInr, details });
const penalty = (program: Term["program"], text: string, details: PenaltyDetails): Term => ({ ...term(program, "PENALTY", text), details });
const TRIPURA = bond("MD", "Service bond: 1 year · ₹50 L clinical · ₹35 L pre/para-clinical · ₹15 L diploma · AIQ: only if you take the state stipend", 5000000, {
  status: "documented",
  years: "1 (extendable up to 2 more years, 1 year at a time, by mutual agreement)",
  amounts: [
    { applies_to: "PG degree, clinical subjects", inr: 5000000 },
    { applies_to: "PG degree, pre/para-clinical subjects", inr: 3500000 },
    { applies_to: "PG diploma", inr: 1500000 },
  ],
  applies_to: "MD/MS/PG Diploma in Tripura govt institutions.",
  quote: "he/she has to pay an amount of Rs. 35.00 lakhs",
});
const TRIPURA_PENALTY = penalty("MD", "Seat-leaving penalty: ₹35,00,000 (PG degree, clinical subjects) · ₹10,00,000 (PG diploma)", {
  items: [
    { kind: "leaving_penalty", applies_to: "PG degree, clinical subjects", inr: 3500000, when: "discontinues PG course", quote: null, source_url: PROFILE.url },
    { kind: "leaving_penalty", applies_to: "PG diploma", inr: 1000000, when: "discontinues PG course", quote: null, source_url: PROFILE.url },
    { kind: "counselling_forfeit", applies_to: "MCC counselling", inr: 200000, when: "resigning the seat in Round 2", quote: null, source_url: PROFILE.url },
    { kind: "other", applies_to: "PG (MD/MS/Diploma)", inr: null, when: "leaving the seat after the final round", quote: "debarred from next session", source_url: "https://upneet.gov.in/pdffile/PGBrochure.pdf" },
  ],
});

it("reads the fee shapes; the NBEMS fee is a ceiling with no GST (withdrawn in 2023), never '+ GST'", () => {
  expect(parseFee("₹150,000/yr — college declaration to MCC 2025")).toEqual({ inr: 150000, kind: "declared", note: null, year: 2025, quality: "full" });
  expect(parseFee("₹1.25 L/yr + GST to NBEMS (official DNB course fee)")).toEqual({ inr: 125000, kind: "maximum", note: null, year: null, quality: "full" });
  expect(parseFee("Up to ₹1,25,000/yr, no GST (NBEMS course fee ceiling; the hospital declared none)")).toEqual({ inr: 125000, kind: "maximum", note: null, year: null, quality: "full" });
  expect(parseFee("Not listed")).toBeNull();
});

// ---------- bundle schema 2: FEE / STIPEND with their fee-table records ----------

const PROFILE_SRC = { n: 1, kind: "mcc_profile" as const, label: "MCC institute profile 700479 (college's own declaration, Annexure-C)", url: MCC(700479).url, year: 2026, mcc_id: "700479" };
const NBEMS_SRC = { n: 2, kind: "nbems_rule" as const, label: "NBEMS annual course fee (ceiling, no GST)", url: "https://natboard.edu.in/x.pdf", year: 2025 };
const rec = (programme: FeeTableRecord["programme"], group: FeeTableRecord["seat_groups"][number], r: Partial<FeeTableRecord>): FeeTableRecord => ({
  programme, seat_groups: [group], fee_display: "numbers", fee_per_year: [null, null, null], fee_whole_course: null, stipend_per_month: [null, null, null], counselling_forfeit: null, sources: [PROFILE_SRC, NBEMS_SRC], ...r,
});
const withRecords = (program: Term["program"], records: FeeTableRecord[], feeText = "₹70,324/yr (yr 1; yr 2/3 not stated) — college's MCC profile"): Term[] => [
  { ...term(program, "FEE", feeText), details: { records } },
  { ...term(program, "STIPEND", "₹60,000/month (every year) — college's MCC profile"), details: { records } },
];
const inr = (amount: number, kind: "annual_fee" | "amount_at_admission" | "declared_for_year" = "annual_fee") => ({ amount, currency: "INR" as const, kind, src: 1 });

it("schema 2: figures come from the programme's first fee-table record, each year as stated, never from the texts", () => {
  // Goa MC: ₹70,324 at admission, years 2 and 3 not stated: no year-1 figure copied, no whole course; MCC's Round 2 forfeit.
  const goa = rec("MD/MS", "All India", {
    fee_per_year: [inr(70324, "amount_at_admission"), null, null],
    stipend_per_month: [1, 2, 3].map(() => ({ inr: 60000, kind: "declared" as const, src: 1 })),
    counselling_forfeit: { forfeited_if_resign_or_not_join_from_round2: { inr: 8432 }, deducted_on_reallocation: { inr: 2000 }, src: 1 },
  });
  const t = normalizeProgramme("MD/MS", withRecords("MD", [rec("MD/MS", "NRI", { fee_display: "verbatim" }), goa]));
  expect(t.years.map((y) => [y.fee?.inr ?? null, y.fee?.atAdmission ?? null, y.stipend?.inr])).toEqual([[70324, true, 60000], [null, null, 60000], [null, null, 60000]]);
  expect([t.wholeCourseFee, t.resignForfeit?.inr, t.unread]).toEqual([null, 8432, []]);
  expect(t.sources).toEqual([{ n: 1, label: PROFILE_SRC.label, url: PROFILE_SRC.url, year: 2026, mccId: "700479", sharedBy: 1, type: "OFFICIAL" }]);
  // RG Kar: at admission, then annual; the whole course as the record gives it.
  const rg = normalizeProgramme("MD/MS", withRecords("MD", [rec("MD/MS", "All India", { fee_per_year: [inr(18000, "amount_at_admission"), inr(12000), inr(12000)], fee_whole_course: { amount: 42000, currency: "INR" } })]));
  expect([rg.years.map((y) => y.fee?.inr), rg.wholeCourseFee]).toEqual([[18000, 12000, 12000], 42000]);
});

it("schema 2: a fee in the profile's own words (verbatim, or no fee_display) has no figure, whatever the text says", () => {
  // Chettinad: "₹48 L/yr" in an older text, but the record is verbatim (₹3 L–₹48 L by specialty).
  for (const fee_display of ["verbatim", null] as const) {
    const r = rec("MD/MS", "Deemed/Paid", { fee_display, fee_text: "Fee Min: 300000 to Max: 4800000", stipend_per_month: [{ inr: 48000, kind: "declared", src: 1 }, null, null] });
    const t = normalizeProgramme("MD/MS", withRecords("MD", [r], "₹48 L/yr — college declaration to MCC 2025"));
    expect([t.years.map((y) => y.fee), t.wholeCourseFee, t.years[0].stipend?.inr]).toEqual([[null, null, null], null, 48000]);
    // Shown as "see terms" in the record's own words (never the summary's figure).
    expect(t.unread.map((u) => [u.kind, u.text])).toEqual([["FEE", "Fee Min: 300000 to Max: 4800000"]]);
    // No words for these seats: nothing to quote, said in a note.
    const none = normalizeProgramme("MD/MS", withRecords("MD", [{ ...r, fee_text: null }], "₹48 L/yr — college declaration to MCC 2025"));
    expect([none.unread, none.notes]).toEqual([[], ["The MCC profile gives no fee in words for these seats, so Seatora shows no fee."]]);
  }
});

it("schema 2: an NBEMS ceiling is a maximum and an NBEMS floor a minimum; a programme without its own record shows nothing", () => {
  const dnb = rec("DNB", "DNB Quota", {
    fee_per_year: [1, 2, 3].map(() => ({ amount: 125000, currency: "INR" as const, kind: "nbems_ceiling" as const, maximum: true as const, src: 2 })),
    fee_whole_course: { amount: 375000, currency: "INR", maximum: true },
    stipend_per_month: [43000, 45000, 47000].map((v) => ({ inr: v, kind: "nbems_minimum" as const, minimum: true as const, src: 2 })),
  });
  const t = normalizeProgramme("DNB", withRecords("DNB", [dnb]));
  expect(t.years.map((y) => [y.fee?.kind, y.stipend?.inr, y.stipend?.kind])).toEqual([["maximum", 43000, "minimum"], ["maximum", 45000, "minimum"], ["maximum", 47000, "minimum"]]);
  expect([t.wholeCourseFee, t.feeNote]).toEqual([375000, null]);
  const nd = normalizeProgramme("NBEMS Diploma", withRecords("DNB", [dnb]));
  expect([nd.years.map((y) => [y.fee, y.stipend]), nd.unread]).toEqual([[[null, null], [null, null]], []]);
});

it("reads stipends by year, the NBEMS floor as a year-1 minimum and the NMC figure as every year", () => {
  expect(parseStipend("₹63,000 / 64,000 / 65,000/month (yr 1/2/3) — college declaration to MCC 2025")).toMatchObject({ perYear: [63000, 64000, 65000], kind: "declared", year: 2025, quality: "full" });
  expect(parseStipend("₹25,000 / 35,000/month (yr 1/2/3) — college declaration to MCC 2025")).toMatchObject({ perYear: [25000, 35000], quality: "partial" });
  expect(parseStipend("At least ₹43,000/month yr 1 (NBEMS floor from Jun 2025; state rate if higher) — actual not verified")).toMatchObject({ perYear: [43000], kind: "minimum", year: 2025 });
  expect(parseStipend("₹55,200/month PG (NMC stipend filing)")).toMatchObject({ perYear: [55200], allYears: true, kind: "nmc" });
});

it("per programme: diploma figures for the Diploma, the rest for MD/MS; 2-year diploma has no year 3", () => {
  const terms = [
    term("MD", "FEE", "₹150,000/yr — college declaration to MCC 2025"),
    term("MD", "STIPEND", "₹55,200 / 56,925 / 58,650/month (yr 1/2/3) — college declaration to MCC 2025"),
    TRIPURA,
    TRIPURA_PENALTY,
  ];
  const md = normalizeProgramme("MD/MS", terms);
  expect(md.years.map((y) => [y.year, y.fee?.inr, y.stipend?.inr])).toEqual([[1, 150000, 55200], [2, 150000, 56925], [3, 150000, 58650]]);
  expect(md.wholeCourseFee).toBe(450000);
  expect([md.bond.years, md.bond.amount.min, md.bond.amount.max, md.bond.leavingAmount.max, md.bond.otherAmounts]).toEqual([1, 3500000, 5000000, 3500000, true]);
  expect(md.resignForfeit?.inr).toBe(200000);
  // Fee and stipend share the MCC profile's source; the bond summary is its own; the MCC id is kept.
  expect(md.sources.map((s) => [s.n, s.label, s.year, s.mccId])).toEqual([
    [1, "Declared by the college to MCC", 2025, "700359"],
    [2, "Bond document summary on the college's MCC profile", null, "700359"],
    [3, "The college's MCC profile", null, "700359"],
    [4, "Official document (upneet.gov.in)", null, null],
  ]);
  const dip = normalizeProgramme("Diploma", terms);
  expect(dip.years.map((y) => y.year)).toEqual([1, 2]);
  expect(dip.wholeCourseFee).toBe(300000);
  expect([dip.bond.amount.max, dip.bond.leavingAmount.max]).toEqual([1500000, 1000000]);
});

it("MCh and MPH: never the MD/MS fee or stipend; a PG-only bond is not theirs", () => {
  const t = normalizeProgramme("MCh", [
    term("MD", "FEE", "₹127,420/yr — college declaration to MCC 2025"),
    term("MD", "STIPEND", "₹55,200 / 56,925 / 58,650/month (yr 1/2/3) — college declaration to MCC 2025"),
    bond("MD", "Service bond: 1 year · ₹10 L · ₹5 L reserved · AIQ included", 1000000, { status: "yes", years: "1", amounts: [{ applies_to: "AIQ PG, unreserved category", inr: 1000000 }, { applies_to: "AIQ PG, reserved category", inr: 500000 }] }),
  ]);
  expect(t.years).toHaveLength(6);
  expect(t.years.every((y) => !y.fee && !y.stipend)).toBe(true);
  expect(t.wholeCourseFee).toBeNull();
  expect(t.notes[0]).toMatch(/none is declared for MCh/);
  expect(t.bond).toMatchObject({ status: "other_course", years: null, amount: { state: "none" }, text: expect.stringMatching(/^Service bond: 1 year/) });
});

it("a programme reads only its own bucket: MD/MS and Diploma the MD terms, DNB and NBEMS Diploma the DNB terms", () => {
  const terms = [
    term("DNB", "FEE", "₹105,000/yr — college declaration to MCC 2025", MCC(700750)),
    bond("DNB", "Service bond: 2 years · ₹40 L · AIQ included", 4000000, { status: "yes", years: "2", amounts: [{ applies_to: "Direct candidates (State/AIQ), DNB", inr: 4000000 }] }, MCC(700750)),
    term("MD", "STIPEND", "₹55,200 / 56,925 / 58,650/month (yr 1/2/3) — college declaration to MCC 2025"),
  ];
  for (const p of ["MD/MS", "Diploma"] as const) {
    const t = normalizeProgramme(p, terms);
    expect([t.years[0].fee, t.years[0].stipend?.inr, t.bond.status]).toEqual([null, 55200, "not_declared"]);
  }
  for (const p of ["DNB", "NBEMS Diploma"] as const) {
    const t = normalizeProgramme(p, terms);
    expect([t.years[0].fee?.inr, t.years[0].stipend, t.bond.status, t.bond.years]).toEqual([105000, null, "declared", 2]);
  }
  expect(["MD", "MS", "Diploma", "MCh", "MPH", "DNB", "DrNB", "NBEMS Diploma"].map(bucketOfDegree)).toEqual(["MD", "MD", "MD", "MD", "MD", "DNB", "DNB", "DNB"]);
});

it("a fee by subject is a range (caps take its highest), no whole-course figure; a profile cited by several institutes says so", () => {
  const text = "₹1,00,000 to ₹68,00,000/yr tuition by subject (management / paid seats) + ₹3,05,000 hostel — college declaration to MCC 2025";
  const t = normalizeProgramme("MD/MS", [term("MD", "FEE", text, MCC(700440))], (id) => (id === "700440" ? 2 : 1));
  expect(t.years[0].fee).toMatchObject({ inr: 6800000, min: 100000, kind: "declared" });
  expect(t.feeNote).toBe("tuition by subject (management / paid seats) + ₹3,05,000 hostel");
  expect(t.wholeCourseFee).toBeNull();
  expect(t.unread).toEqual([]);
  expect(t.sources[0]).toMatchObject({ sharedBy: 2, year: 2025, label: expect.stringMatching(/^From an MCC profile that 2 institutes/) });
  const nmc = normalizeProgramme("MD/MS", [term("MD", "STIPEND", "₹55,200/month PG (NMC stipend filing)", { name: "Official document (nmc.org.in)", url: "https://nmc.org.in/storage/stipend-details/stipend-detail-list.pdf", type: "OFFICIAL" })]);
  expect(nmc.sources[0]).toMatchObject({ label: "NMC stipend list", year: 2024 });
});

it("DNB hospital with only the NBEMS fee and a declared stipend: no bond term means not declared, never 'no bond'", () => {
  const t = normalizeProgramme("DNB", [
    term("DNB", "FEE", "₹1.25 L/yr + GST to NBEMS (official DNB course fee)", NBEMS),
    term("DNB", "STIPEND", "₹63,000 / 64,000 / 65,000/month (yr 1/2/3) — college declaration to MCC 2025", MCC(700970)),
  ]);
  expect(t.years.map((y) => y.fee?.kind)).toEqual(["maximum", "maximum", "maximum"]);
  expect(t.feeNote).toBeNull();
  expect(t.bond.status).toBe("not_declared");
  expect(t.resignForfeit).toBeNull();
  expect(t.sources.map((s) => s.label)).toEqual(["NBEMS fee notice", "Declared by the college to MCC"]);
  // Never the MD bucket's fee, even when the DNB bucket has none.
  const both = [term("DNB", "FEE", "₹1.25 L/yr + GST to NBEMS (official DNB course fee)", NBEMS), term("MD", "FEE", "₹150,000/yr — college declaration to MCC 2025")];
  expect(normalizeProgramme("NBEMS Diploma", both).years.map((y) => y.fee?.kind)).toEqual(["maximum", "maximum"]);
  expect(normalizeProgramme("NBEMS Diploma", both.slice(1)).years[0].fee).toBeNull();
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

it("a documented bond: years from the text's head, amounts per programme from the record, the record's penalty items", () => {
  const md = normalizeProgramme("MD/MS", [TRIPURA, TRIPURA_PENALTY]);
  expect(md.bond).toMatchObject({ status: "declared", basis: "document", years: 1, amount: { state: "figure", min: 3500000, max: 5000000 }, otherAmounts: true, quote: expect.stringMatching(/Rs\. 35/) });
  expect(md.bond.leaving.map((p) => p.inr)).toEqual([3500000]);
  expect(md.bond.otherPenalties[0]).toMatchObject({ inr: null, text: expect.stringMatching(/debarred from next session/) });
  expect(md.resignForfeit?.inr).toBe(200000);
  // The item with its own document numbers it as a source of its own.
  expect(md.sources.map((s) => s.label)).toEqual(["Bond document summary on the college's MCC profile", "The college's MCC profile", "Official document (upneet.gov.in)"]);
  const dip = normalizeProgramme("Diploma", [TRIPURA, TRIPURA_PENALTY]);
  expect([dip.bond.amount.max, dip.bond.leavingAmount.max]).toEqual([1500000, 1000000]);
});

it("bond years: never from \"N years of study\"; the diploma's own years where the text gives them", () => {
  const study = bond("MD", "Service bond: double the stipend received for 3 years of study", null, { status: "documented", years: "3 years of study; service not stated" });
  expect(normalizeProgramme("MD/MS", [study]).bond).toMatchObject({ status: "declared", years: null, amount: { state: "words" } });
  const wb = bond("MD", "State bond: 3 yrs (diploma 2 yrs) as SR, ₹10 L per year not served; leaving ₹5 L (diploma ₹2 L) (WB H&FW notice 14-10-2026)", 3000000, {
    status: "state_rule",
    years: "3 years after a PG degree (and post-doctoral), 2 years after a PG Diploma, served as a Senior Resident in WB hospitals.",
    amounts: [{ applies_to: "MD/MS", inr: 3000000 }, { applies_to: "Diploma", inr: 2000000 }],
  });
  expect(normalizeProgramme("MD/MS", [wb]).bond).toMatchObject({ basis: "state_rule", years: 3, amount: { max: 3000000 } });
  expect(normalizeProgramme("Diploma", [wb]).bond).toMatchObject({ basis: "state_rule", years: 2, amount: { max: 2000000 } });
  // Years joined on in the head clause are added up (Karnataka: compulsory service + the undertaking), never later clauses.
  const yrs = (text: string) => normalizeProgramme("MD/MS", [bond("MD", text, 5000000, { status: "yes", years: "1 (Karnataka Act 2012) + 3 (Rule 15(5) undertaking)" })]).bond;
  expect(yrs("Service bond: 1 + 3 years · ₹5 L")).toMatchObject({ years: 4, yearsSum: "1 + 3" });
  expect(yrs("Service bond: 1 yr compulsory govt service + up to 3 yrs if called · ₹50 L · AIQ included")).toMatchObject({ years: 4, yearsSum: "1 + 3" });
  expect(yrs("Service bond: 1 year + 1 yr compulsory govt service (Karnataka law) · ₹10 L")).toMatchObject({ years: 2, yearsSum: "1 + 1" });
  expect(yrs("State bond: 3 yrs if Govt needs, ₹50 L, plus 1 yr compulsory service; AIQ included (KEA PGET 2026)")).toMatchObject({ years: 4, yearsSum: "3 + 1" });
  expect(yrs("Service bond: 2 years · ₹40 L; leaving: + 1 yr ban")).toMatchObject({ years: 2, yearsSum: null });
  expect(normalizeProgramme("MD/MS", [bond("MD", "Service bond: ₹5 L", 500000, { status: "documented", years: 2 })]).bond.years).toBe(2);
});

it("no bond only where a record says so; unknown keeps its words; no ₹ figure for an All India candidate is words", () => {
  const nbems = bond("DNB", "No bond (NBEMS rule for private DNB hospitals)", 0, { status: "no_bond_rule", source: [{ title: "NBEMS bulletin 2025, para 5.10", url: "https://accr.natboard.edu.in/x.pdf", date: "2025-02-06" }] }, NBEMS);
  expect(normalizeProgramme("NBEMS Diploma", [nbems]).bond).toMatchObject({ status: "none", basis: "nbems_rule", years: 0, amount: { state: "none" } });
  const delhi = bond("MD", "No service bond (per the college's MCC bond document); state rule says 1 yr in Delhi Govt hospitals, ₹20 L — confirm with the college", 0, {
    status: "no_bond_verified",
    state_rule: { status: "state_rule", years: "1 year", amounts: [{ applies_to: "MD/MS", inr: 2000000 }], text: "1 yr in Delhi Govt hospitals, ₹20 L" },
  });
  expect(normalizeProgramme("MD/MS", [delhi]).bond).toMatchObject({ status: "none", basis: "document", stateRule: "1 yr in Delhi Govt hospitals, ₹20 L" });
  const unknown = bond("MD", "MCC bond document has no clear terms — check with the college", null, { status: "unknown", reason: "mcc_document_unclear" });
  expect(normalizeProgramme("MD/MS", [unknown]).bond).toMatchObject({ status: "not_declared", basis: null, years: null, text: expect.stringMatching(/^MCC bond document has no clear terms/), src: 1 });
  const gujarat = bond("MD", "Service bond: 1 year · ₹40 L · this 2020 GR copy exempts AIQ", null, { status: "documented", years: "1", amounts: [{ applies_to: "PG diploma/degree (State quota)", inr: 4000000 }] });
  expect(normalizeProgramme("MD/MS", [gujarat]).bond).toMatchObject({ status: "declared", years: 1, amount: { state: "words", max: null } });
});

it("by_course: DNB and NBEMS Diploma (or MD/MS and Diploma) each read their own entry; by_subject is a range", () => {
  const split = bond("DNB", "DNB: Not checked yet | NBEMS Diploma: State bond: 3 yrs, ₹25 L + salary drawn", null, {
    status: "unknown",
    by_course: [
      { course: "DNB", status: "unknown", text: "Not checked yet — see the college's MCC bond page", amount_inr: null, src_url: PROFILE.url },
      { course: "NBEMS Diploma", status: "state_rule", text: "State bond: 3 yrs, ₹25 L + salary drawn (Bihar H&FW letter 03-01-2022, on MCC)", amount_inr: 2500000, src_url: "https://state.gov.in/bond.pdf" },
    ],
  });
  expect(normalizeProgramme("DNB", [split]).bond).toMatchObject({ status: "not_declared", text: expect.stringMatching(/^Not checked yet/) });
  const nd = normalizeProgramme("NBEMS Diploma", [split]);
  expect(nd.bond).toMatchObject({ status: "declared", basis: "state_rule", years: 3, amount: { max: 2500000 } });
  expect(nd.sources[0]).toMatchObject({ url: "https://state.gov.in/bond.pdf", label: "Official document (state.gov.in)" });
  const rajasthan = bond("MD", "Service bond: 2 years · ₹25 L–₹1.5 Cr by subject", 15000000, { status: "documented", years: "2", by_subject: { ANAESTHESIOLOGY: 5000000, PATHOLOGY: 2500000, GENERALSURGERY: 15000000 } });
  expect(normalizeProgramme("MD/MS", [rajasthan]).bond.amount).toMatchObject({ min: 2500000, max: 15000000, varies: true });
});

it("a per defaulting year bond: one computed figure (amount × years), the published amount kept; All India rows over state-quota ones", () => {
  const wb = bond("MD", "Service bond: 3 years (diploma 2) · ₹10 L per unserved year · sponsored in-service doctors exempt", 3000000, {
    status: "yes",
    years: "3 (PG Degree); 2 (PG Diploma)",
    amounts: [{ applies_to: "Post Doctoral / MD / MS, per defaulting year", inr: 1000000 }, { applies_to: "PG Diploma, per defaulting year", inr: 1000000 }],
  });
  expect(normalizeProgramme("MD/MS", [wb]).bond.amount).toMatchObject({ min: 3000000, max: 3000000, perYear: 1000000 });
  expect(normalizeProgramme("Diploma", [wb]).bond).toMatchObject({ years: 2, amount: { max: 2000000, perYear: 1000000 } });
  const punjab = bond("DNB", "Service bond: 1 year AIQ / 2 years State fresh · ₹10 L AIQ", 1000000, { status: "yes", years: "1 (AIQ); 2 (State fresh)", amounts: [{ applies_to: "AIQ, DNB", inr: 1000000 }, { applies_to: "State fresh candidates, DNB", inr: 1500000 }] });
  expect(normalizeProgramme("DNB", [punjab]).bond).toMatchObject({ amount: { max: 1000000 }, otherAmounts: true });
});

it("a state rule's source is its order, named with its date; a bond or penalty without its record is shown as published", () => {
  const url = "https://ct.odisha.gov.in/sites/default/files/2024-01/2298_compressed.pdf";
  const odisha = bond("MD", "State bond: 2 yrs, repay double the stipend; AIQ included (Odisha resolution 29-01-2024)", null, {
    status: "state_rule",
    years: "2 years in any health institution of the state.",
    amounts: [{ applies_to: "MD/MS", inr: null }],
    source: { title: "Govt of Odisha H&FW Dept Resolution 'Execution of bond by candidates'", url, date: "29.01.2024" },
  }, { name: "Official document (ct.odisha.gov.in)", url, type: "OFFICIAL" });
  const t = normalizeProgramme("MD/MS", [odisha]);
  expect(t.bond).toMatchObject({ status: "declared", basis: "state_rule", years: 2, amount: { state: "words" }, src: 1 });
  expect(t.sources[0].label).toBe("Govt of Odisha H&FW Dept Resolution 'Execution of bond by candidates' (29.01.2024)");
  const old = normalizeProgramme("MD/MS", [term("MD", "BOND", "Service bond ₹10,00,000 (1 year service)"), term("MD", "PENALTY", "₹1,500 forfeited if you resign/don't join from Round 2 (MCC profile)")]);
  expect(old.bond.status).toBe("not_declared");
  expect(old.resignForfeit).toBeNull();
  expect(old.unread.map((u) => u.kind)).toEqual(["BOND", "PENALTY"]);
});

it("who a row is for: DNB is a degree, NBEMS Diploma the diploma; DNB/Diploma and PG labels naming DM/MCh cover both", () => {
  const cases: [string, string][] = [
    ["DNB", "degree"], ["DNB (broad specialty)", "degree"], ["NBEMS Diploma", "diploma"], ["DNB Diploma", "diploma"], ["PG diploma / MDS", "diploma"],
    ["DNB/Diploma", "all"], ["DNB, NBEMS Diploma", "all"], ["All India quota DNB/Diploma", "all"], ["DNB / Diploma / DrNB at Karnataka State Govt hospital", "all"],
    ["All PG (MD/MS/DM/MCh) on Government seats, RajMES", "all"], ["PG Diploma/DNB/DrNB/MD/MS/MDS/DM/MCh", "all"], ["DM/MCh", "super"],
    ["PG Degree (non-WB-in-service), per defaulting year of the 3-year bond", "degree"], ["MD/MS in-service candidates", "inservice"], ["MCC counselling", "all"],
  ];
  expect(cases.map(([s]) => [s, groupOf(s)])).toEqual(cases);
  // SBLS-like: the All India DNB/Diploma row, not the state one; the "DNB / Diploma" leaving item applies to DNB too.
  const sbls = [
    bond("DNB", "Service bond: 1 year AIQ / 2 years State fresh · ₹10 L AIQ", 1000000, { status: "yes", years: "1 (AIQ); 2 (State fresh)", amounts: [{ applies_to: "All India quota DNB/Diploma", inr: 1000000 }, { applies_to: "State fresh candidates / doctors not employed by Punjab boards & corporations", inr: 1500000 }] }),
    penalty("DNB", "Seat-leaving penalty: balance fee", { items: [{ kind: "leaving_penalty", applies_to: "DNB / Diploma", inr: null, when: "leaving the course", quote: "balance fee for the entire course", source_url: PROFILE.url }] }),
  ];
  expect(normalizeProgramme("DNB", sbls).bond).toMatchObject({ years: 1, amount: { min: 1000000, max: 1000000 }, leaving: [{ inr: null }] });
  // Tamil Nadu-like: the NBEMS Diploma reads its own row, never the DNB figure.
  const tn = penalty("DNB", "Seat-leaving penalty: ₹15 L DNB · ₹10 L NBEMS Diploma", { items: [{ kind: "leaving_penalty", applies_to: "DNB", inr: 1500000, when: "leaving", quote: null, source_url: PROFILE.url }, { kind: "leaving_penalty", applies_to: "NBEMS Diploma", inr: 1000000, when: "leaving", quote: null, source_url: PROFILE.url }] });
  expect([normalizeProgramme("NBEMS Diploma", [tn]).bond.leavingAmount.max, normalizeProgramme("DNB", [tn]).bond.leavingAmount.max]).toEqual([1000000, 1500000]);
});

it("a state rule beside the college's document: the rule's years (the newer), its own words for them", () => {
  const tezpur = bond("MD", "Service bond: 10 years · ₹20 L · ₹25 L Rule 4(4)(vi) seats; state rule (Assam PG rules 2024): 2 yrs, ₹20 L — college's MCC form (2012) still says 10 yrs", 2000000, {
    status: "yes",
    years: "10",
    amounts: [{ applies_to: "PG students in Assam State Medical Colleges", inr: 2000000 }],
    state_rule: { status: "state_rule", years: "2 years. The deed allows up to 10 years if the government wants the service.", text: "State bond: 2 yrs, ₹20 L; AIQ included in practice (Assam PG rules 2024)" },
  });
  expect(normalizeProgramme("MD/MS", [tezpur]).bond).toMatchObject({ basis: "document", years: 2, yearsText: expect.stringMatching(/^2 years\. The deed/), stateRule: expect.stringMatching(/^State bond: 2 yrs/) });
  const latur = bond("MD", "Service bond: no period or amount stated; state rule (Maharashtra GR 28-05-2010): 1 yr, ₹50 L", 5000000, {
    status: "yes",
    amounts: [],
    state_rule: { status: "state_rule", years: "1 year of 'social responsibility service'", text: "State bond: 1 yr, ₹50 L; leaving ₹10 L + ₹10 L; AIQ included (Maharashtra GR 28-05-2010)" },
  });
  expect(normalizeProgramme("MD/MS", [latur]).bond).toMatchObject({ years: 1, amount: { state: "figure", max: 5000000 } });
});

it("an additional leaving item adds to the others (Maharashtra: ₹10 L + ₹10 L if the seat lapses); 'in addition to fees' does not", () => {
  const mh = penalty("MD", "Seat-leaving penalty: ₹10 L + another ₹10 L if the seat lapses", {
    items: [
      { kind: "leaving_penalty", applies_to: "PG at Govt/Corporation seats, AIQ or State quota", inr: 1000000, when: "non-completion of Junior residency tenure", quote: null, source_url: PROFILE.url },
      { kind: "leaving_penalty", applies_to: "PG at Govt/Corporation seats, AIQ or State quota", inr: 1000000, when: "responsible for lapse of PG seat (additional; also ineligible for State quota for next 2 years)", quote: null, source_url: PROFILE.url },
    ],
  });
  expect(normalizeProgramme("MD/MS", [mh]).bond.leavingAmount).toMatchObject({ min: 1000000, max: 2000000, extra: 1000000 });
  const mgm = penalty("MD", "Seat-leaving penalty: ₹25 L", { items: [{ kind: "leaving_penalty", applies_to: "PG Degree (MD/MS)", inr: 2500000, when: "quits the course midway; in addition to fees for the entire course", quote: null, source_url: PROFILE.url }] });
  expect(normalizeProgramme("MD/MS", [mgm]).bond.leavingAmount).toMatchObject({ max: 2500000, extra: null });
});

it("no bond with what the record is unsure of: a private status from the name, a state law's service that may apply (years unknown)", () => {
  const nbems = bond("DNB", "No bond (NBEMS rule for private DNB hospitals)", 0, { status: "no_bond_rule", confidence: "medium: private status inferred from name" }, NBEMS);
  expect(normalizeProgramme("DNB", [nbems]).bond).toMatchObject({ status: "none", years: 0, caveat: "private status inferred from name" });
  const ka = bond("MD", "No service bond (per the college's MCC bond document); Karnataka law: 1 yr compulsory govt service may apply", 0, { status: "no" });
  expect(normalizeProgramme("MD/MS", [ka]).bond).toMatchObject({ status: "none", years: null, caveat: "Karnataka law: 1 yr compulsory govt service may apply" });
});

it("by_course: a per-year amount stays per year, the document's words and years as written are kept", () => {
  const cnmc = bond("MD", "Service bond: 3 years (diploma 2) · ₹10 L per unserved year", 3000000, {
    status: "yes",
    years: "3 (PG Degree); 2 (PG Diploma)",
    quote: "Rs.10,00,000/- ... for each defaulting year",
    by_course: [
      { course: "MD/MS", status: "documented", text: "Service bond: 3 years · ₹10 L per unserved year", amount_inr: 3000000, src_url: PROFILE.url },
      { course: "Diploma", status: "documented", text: "Service bond: 2 years · ₹10 L per unserved year", amount_inr: 2000000, src_url: PROFILE.url },
    ],
  });
  expect(normalizeProgramme("Diploma", [cnmc]).bond).toMatchObject({ years: 2, amount: { max: 2000000, perYear: 1000000 }, quote: expect.stringMatching(/defaulting year/), yearsText: "3 (PG Degree); 2 (PG Diploma)", otherAmounts: false });
});

it("by_subject: the range over the subjects, rows without a figure (priced by subject) not listed; a state rule's applies_to not shown", () => {
  const churu = bond("MD", "State bond: 2 yrs, ₹25 L–₹1.5 Cr by subject (Anaesthesia ₹50 L); AIQ included (Rajasthan DME order 04-09-2025)", null, {
    status: "state_rule",
    years: "2 years",
    applies_to: "I found no college circular for them",
    amounts: [{ applies_to: "MD/MS", inr: null }],
    by_subject: { ANAESTHESIOLOGY: 5000000, GENERALSURGERY: 15000000, PATHOLOGY: 2500000 },
  });
  expect(normalizeProgramme("MD/MS", [churu]).bond).toMatchObject({ years: 2, amounts: [], amount: { state: "figure", min: 2500000, max: 15000000, varies: true }, appliesTo: null });
});

it("an unknown record names the college's MCC profile and links its bond document; one with no document keeps its words", () => {
  const profileUrl = "https://mcc.admissions.nic.in/Counseling/Handler/ViewInstituteProfileDetailsDynamic.ashx?boardId=140012521&InstituteId=700983";
  const kalwa = bond("DNB", "MD/MS bond on MCC (1 yr, ₹50 L) does not mention DNB — ask the college", null, { status: "unknown", doc_url: PROFILE.url }, { ...PROFILE, url: profileUrl });
  const t = normalizeProgramme("DNB", [kalwa]);
  expect(t.sources.map((s) => [s.label, s.url])).toEqual([["The college's MCC profile", profileUrl], ["The college's bond document on MCC", PROFILE.url]]);
  expect(t.bond).toMatchObject({ status: "not_declared", src: 1, doc: 2 });
  const esic = bond("DNB", "Not checked yet — see the institute's MCC bond page (other ESIC colleges declare a 1–2 yr, ₹7.5–10 L bond)", null, { status: "unknown", reason: "central_institution_not_checked" }, { name: "Seatora bond check (no document yet)", url: null, type: "THIRD_PARTY_RESEARCH" });
  expect(normalizeProgramme("NBEMS Diploma", [esic]).bond).toMatchObject({ status: "not_declared", text: expect.stringMatching(/other ESIC colleges/) });
});
