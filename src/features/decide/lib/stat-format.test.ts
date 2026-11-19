import { describe, expect, it } from "vitest";
import type { BondDetails, PenaltyDetails } from "@/features/cutoffs/lib/import-schema";
import { normalizeProgramme, type Programme } from "../server/terms";
import type { FeeTableRecord, Term } from "../types";
import { termsWords } from "./choices";
import { beCareful, bondPlain, costLine, feeRange, yearlyFee, inrApprox, inrCard, inrFull, inrL, inrRange, inrShort, statCells, yearValue, type StatCell, type StatKey } from "./stat-format";
import { summaryText } from "../components/stat-cells";

// Terms shaped as the bundle has them (server/terms.test.ts), through the real normalizer, then the cells.
const MCC = { name: "MCC institute profile (college declaration)", url: "https://mcc.admissions.nic.in/Counseling/Handler/ViewInstituteProfileDetailsDynamic.ashx?boardId=140012521&InstituteId=700359", type: "OFFICIAL" as const };
const NBEMS = { name: "NBEMS notice", url: "https://natboard.edu.in/viewnbeNotice?NBE=x", type: "OFFICIAL" as const };
const term = (program: Term["program"], kind: Term["kind"], text: string, source: Term["source"] = MCC): Term => ({ college: "X", program, kind, text, amountInr: null, source });
const bond = (program: Term["program"], text: string, amountInr: number | null, details: BondDetails, source: Term["source"] = MCC): Term => ({ ...term(program, "BOND", text, source), amountInr, details });
const penalty = (program: Term["program"], details: PenaltyDetails): Term => ({ ...term(program, "PENALTY", "Seat-leaving penalty"), details });
const SRC = [
  { n: 1, kind: "mcc_profile" as const, label: "MCC institute profile 700479 (college's own declaration)", url: MCC.url, year: 2026, mcc_id: "700479" },
  { n: 2, kind: "nbems_rule" as const, label: "NBEMS annual course fee (ceiling, no GST)", url: "https://natboard.edu.in/x.pdf", year: 2025 },
];
const rec = (programme: FeeTableRecord["programme"], r: Partial<FeeTableRecord>): FeeTableRecord => ({
  programme, seat_groups: ["All India"], fee_display: "numbers", fee_per_year: [null, null, null], fee_whole_course: null, stipend_per_month: [null, null, null], counselling_forfeit: null, sources: SRC, ...r,
});
const fees = (program: Term["program"], records: FeeTableRecord[], feeText = "₹41,000/yr — college's MCC profile"): Term[] => [
  { ...term(program, "FEE", feeText), details: { records } },
  { ...term(program, "STIPEND", "₹1,36,008/month — college's MCC profile"), details: { records } },
];
const fee = (amount: number, src = 1) => ({ amount, currency: "INR" as const, kind: "annual_fee" as const, src });

const cells = (p: Programme, terms: Term[]) => Object.fromEntries(statCells(normalizeProgramme(p, terms)).map((c) => [c.key, c])) as Record<StatKey, StatCell>;
/** value, marker and tone of a cell: what the strip shows. */
const shown = (c: StatCell) => [c.short, c.full, c.marker, c.tone];
const tip = (c: StatCell) => c.tip.map((l) => l.text).join(" | ");

describe("₹ formatting", () => {
  it("full figures in Indian grouping", () => {
    expect([41000, 136008, 2000000, 15000000].map(inrFull)).toEqual(["₹41,000", "₹1,36,008", "₹20,00,000", "₹1,50,00,000"]);
  });
  it("short forms only where they lose nothing: lakh and crore to 2 decimals, else the full figure", () => {
    expect([5000000, 125000, 150000, 2450000, 100000, 20000000, 15000000, 12300000].map(inrShort)).toEqual(["₹50 L", "₹1.25 L", "₹1.5 L", "₹24.5 L", "₹1 L", "₹2 Cr", "₹1.5 Cr", "₹1.23 Cr"]);
    // Under ₹1 L: in full.
    expect([41000, 99999, 0].map(inrShort)).toEqual(["₹41,000", "₹99,999", "₹0"]);
    // Never rounded into another figure: ₹1,24,999 is not the NBEMS ceiling, ₹99,99,999 not ₹1 Cr, a stipend keeps its rupees.
    expect([124999, 9999999, 136008, 12345678].map(inrShort)).toEqual(["₹1,24,999", "₹99,99,999", "₹1,36,008", "₹1,23,45,678"]);
    // Crore only to 2 decimals of a crore; below that, lakh.
    expect(inrShort(12345000)).toBe("₹123.45 L");
  });
  it("ranges: one figure when min is absent or the same", () => {
    expect([inrRange(3500000, 5000000), inrRange(null, 5000000), inrRange(5000000, 5000000), inrRange(100000, 6800000, false)]).toEqual(["₹35 L–₹50 L", "₹50 L", "₹50 L", "₹1,00,000–₹68,00,000"]);
  });
});

describe("fee and stipend cells", () => {
  it("year 1's declared fee and stipend; later years and the whole course behind the (i), each with its source", () => {
    const c = cells("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [fee(41000), fee(41000), null], stipend_per_month: [1, 2, 3].map(() => ({ inr: 136008, kind: "declared" as const, src: 1 })) })]));
    expect(shown(c.fee)).toEqual(["₹41,000/yr", "₹41,000/yr", null, null]);
    expect(c.fee.tip.slice(0, 3)).toEqual([{ text: "Year 1: ₹41,000 a year", src: 1 }, { text: "Year 2: ₹41,000 a year", src: 1 }, { text: "Year 3: not published" }]);
    // Its band (green) in words, last.
    expect([c.fee.level, c.fee.tip[3].text]).toEqual(["good", expect.stringMatching(/^Low fee for MD\/MS \(MD\/MS and Diploma: low under ₹1 L/)]);
    // A stipend always says its period; one money style on cards (lakh from ₹1 L, cut), in full in tables.
    expect(shown(c.stipend)).toEqual(["₹1.36 L/mo", "₹1,36,008/mo", null, null]);
    expect(c.stipend.tip[0]).toEqual({ text: "Year 1: ₹1,36,008 a month", src: 1 });
  });

  it("the NBEMS ceiling reads ≤ … NBEMS max, never as the college's own fee; the NBEMS floor is marked min", () => {
    const c = cells("DNB", fees("DNB", [rec("DNB", {
      seat_groups: ["DNB Quota"],
      fee_per_year: [1, 2, 3].map(() => ({ amount: 125000, currency: "INR" as const, kind: "nbems_ceiling" as const, maximum: true as const, src: 2 })),
      fee_whole_course: { amount: 375000, currency: "INR", maximum: true },
      stipend_per_month: [43000, 45000, 47000].map((v) => ({ inr: v, kind: "nbems_minimum" as const, minimum: true as const, src: 2 })),
    })]));
    expect(shown(c.fee)).toEqual(["≤ ₹1.25 L/yr", "Up to ₹1.25 L/yr", null, null]);
    expect(c.fee.tip[0]).toEqual({ text: "NBEMS limit; hospital declared none." });
    expect(c.fee.tip[1]).toMatchObject({ text: expect.stringMatching(/^Up to ₹1,25,000 a year: the most NBEMS lets a DNB hospital charge .*not the college's own fee\.$/), src: 1 });
    // Every line says it is a ceiling, the whole course too.
    expect(tip(c.fee)).toContain("Year 2: up to ₹1,25,000 a year");
    expect(tip(c.fee)).toContain("For the whole course: up to ₹3,75,000 (3 years) (NBEMS maximum)");
    expect(shown(c.stipend)).toEqual(["≥ ₹43,000/mo", "From ₹43,000/mo", null, null]);
    expect(tip(c.stipend)).toMatch(/Year 2: at least ₹45,000 a month .*NBEMS minimum: the hospital must pay at least this/);
  });

  it("a declared fee above the NBEMS maximum, a stipend below the NBEMS minimum: warning markers; + DA; the record's GST note, citing its source", () => {
    const c = cells("DNB", fees("DNB", [rec("DNB", {
      seat_groups: ["DNB Quota"],
      fee_per_year: [{ ...fee(145000), above_nbems_ceiling: true }, { ...fee(125000), declared_amount: 147500, gst_src: 2, note: "declared ₹1,47,500 = ₹1,25,000 + 18% GST; NBEMS withdrew the GST on 17-11-2023, so ₹1,25,000 is shown" }, null],
      stipend_per_month: [{ inr: 35000, kind: "declared", src: 1, below_nbems_minimum: true }, null, null],
    })]));
    expect([...shown(c.fee), c.fee.markerWarn]).toEqual(["₹1.45 L/yr", "₹1.45 L/yr", null, null, undefined]);
    expect(c.fee.tip).toContainEqual({ text: "Above the NBEMS maximum: the hospital declared more than NBEMS lets a DNB hospital charge.", warn: true });
    expect(c.fee.tip).toContainEqual({ text: "Declared ₹1,47,500 = ₹1,25,000 + 18% GST; NBEMS withdrew the GST on 17-11-2023, so ₹1,25,000 is shown", src: 2 });
    expect([...shown(c.stipend), c.stipend.markerWarn]).toEqual(["₹35,000/mo", "₹35,000/mo", "below NBEMS min", null, true]);
    expect(c.stipend.tip).toContainEqual({ text: "Below the NBEMS minimum: the college declared less than NBEMS's minimum stipend.", warn: true, src: undefined });
    // With the record's NBEMS minimum: its figure and source.
    const nb = cells("DNB", fees("DNB", [rec("DNB", { stipend_per_month: [{ inr: 35000, kind: "declared", src: 1, below_nbems_minimum: true }, null, null], stipend_nbems_minimum: [{ inr: 43000, kind: "nbems_minimum", minimum: true, src: 2 }] })]));
    expect(nb.stipend.tip).toContainEqual({ text: "Below the NBEMS minimum: the college declared less than NBEMS's minimum stipend of ₹43,000 a month.", warn: true, src: 2 });
    // A figure Seatora took the GST off: marked, the declared figure on its year line.
    const gst = cells("DNB", fees("DNB", [rec("DNB", { fee_per_year: [{ ...fee(125000), declared_amount: 147500, gst_src: 2, note: "declared ₹1,47,500 = ₹1,25,000 + 18% GST" }, null, null] })]));
    expect([...shown(gst.fee), gst.fee.markerWarn]).toEqual(["₹1.25 L/yr", "₹1.25 L/yr", null, null, undefined]);
    expect(gst.fee.tip).toContainEqual({ text: "GST removed: the college declared ₹1,47,500.", warn: true });
    expect(gst.fee.tip).toContainEqual({ text: "Year 1: ₹1,25,000 a year (declared ₹1,47,500; see below)", src: 1 });
    const da = cells("MD/MS", fees("MD", [rec("MD/MS", { stipend_per_month: [{ inr: 55200, kind: "declared", src: 1, plus_da: true }, null, null] })]));
    expect(shown(da.stipend)).toEqual(["₹55,200/mo", "₹55,200/mo", null, null]);
    expect(tip(da.stipend)).toContain("Plus DA (dearness allowance), as the college declared.");
  });

  it("a fee in the profile's words only (verbatim) is 'In words' with the quota's record's words, never a figure", () => {
    const words = "Annual fees: Fee Min: 100000 to Max: 7000000";
    const verbatim = rec("MD/MS", { seat_groups: ["Deemed/Paid"], fee_display: "verbatim", fee_per_year: [null, null, null], fee_text: words, fee_text_src: { url: MCC.url, date: "2026-10-01" } });
    const c = cells("MD/MS", fees("MD", [verbatim], "Seatora's summary, not the profile's words"));
    expect(shown(c.fee)).toEqual(["Not published", "Not published", null, "muted"]);
    expect(c.fee.tip[1]).toMatchObject({ text: words, quote: true });
    // Words saying it varies by subject; words pointing to the college's website (their own address, else its MCC one).
    const said = (fee_text: string) => cells("MD/MS", fees("MD", [{ ...verbatim, fee_text }])).fee;
    const varies = said("FEES VARIES WITH SPECAILITIES. Visit www.sbmch.ac.in for further Information");
    expect(varies.short).toBe("Varies (see source)");
    expect(varies.tip).toContainEqual({ text: "www.sbmch.ac.in", href: "http://www.sbmch.ac.in/" }); // the link in the (i), never the cell
    expect(said("For details of Course fee visit website.").short).toBe("Not published");
    expect(said("Tuition fee ranges from Rs.3,00,000/- to Rs.48,00,000/- per annum as per the opted speciality by student").short).toBe("₹3–48 L/yr"); // the range the words give
    // The range with its reason when the words give it.
    expect(shown(said("At admission / Year 1 / Year 2 / Year 3 / Annual fees: 100000 to 4000000 Depending upon the Specialty")).slice(0, 3)).toEqual(["₹1–40 L/yr", "₹1–40 L/yr", "Varies (see source)"]);
    const site = { ...normalizeProgramme("MD/MS", fees("MD", [{ ...verbatim, fee_text: "For details of Course fee visit website." }])), website: "www.x.ac.in" };
    expect(statCells(site)[0].short).toBe("Not published");
    expect(statCells(site)[0].tip).toContainEqual({ text: "www.x.ac.in", href: "http://www.x.ac.in/" }); // the college's site, in the (i)
    expect(termsWords(site)).toMatch(/^Fee: Not published(;|$)/);
    // No words for these seats: "Not published", saying so.
    const none = cells("MD/MS", fees("MD", [{ ...verbatim, fee_text: null }]));
    expect(shown(none.fee)).toEqual(["Not published", "Not published", null, "muted"]);
    // Citing the profile page that was read.
    expect(none.fee.tip).toEqual([{ text: "The MCC profile gives no fee in words for these seats, so Seatora shows no fee.", src: 1 }]);
    // The export writes no FEE term for such a record (Bankura, Kasturba): the STIPEND term's records say the same.
    expect(cells("MD/MS", fees("MD", [{ ...verbatim, fee_text: null }]).slice(1)).fee.tip).toEqual(none.fee.tip);
    expect(cells("MD/MS", fees("MD", [verbatim]).slice(1)).fee.tip[1]).toMatchObject({ text: words, quote: true });
  });

  it("figures read out of the profile's words: shown with 'see text', their exact words and the whole text in the (i); US$ never as ₹", () => {
    const text = "At admission: 50000 | Year 1 / Year 2 / Year 3: 125000 | Annual fees: 105000 | Other info: Hostel fees is Rs. 20000 per year.";
    const fig = (amount: number, field: string, quote: string) => ({ amount, currency: "INR" as const, field, quote });
    const y = fig(125000, "Year 1", "At admission / Year 1 / Year 2 / Year 3: 125000");
    const parsed = {
      basis: "parsed from MCC profile text" as const, src: 1, per_year: [y, { ...y, field: "Year 2" }, { ...y, field: "Year 3" }],
      at_admission: { amount: 50000, currency: "INR" as const, quote: "At admission: 50000" }, annual_fee: { amount: 105000, currency: "INR" as const, quote: "Annual fees: 105000" },
      hostel: { amount: 20000, currency: "INR" as const, period: "per_year" as const, quote: "Hostel fees is Rs. 20000 per year" },
    };
    const v = rec("DNB", { seat_groups: ["DNB Quota"], fee_display: "verbatim", fee_text: text, fee_text_src: { url: MCC.url, date: "2026-11-14" }, fee_parsed: parsed });
    const c = cells("DNB", fees("DNB", [v]));
    expect(shown(c.fee)).toEqual(["₹1.25 L/yr", "₹1.25 L/yr", null, null]);
    expect(c.fee.tip).toContainEqual({ text: "At admission / Year 1 / Year 2 / Year 3: 125000", src: 1, quote: true });
    expect(tip(c.fee)).toContain("At admission: ₹50,000 (as the profile states it).");
    expect(tip(c.fee)).toContain("Annual fee: ₹1,05,000 a year (as the profile states it).");
    expect(tip(c.fee)).toContain("Hostel: ₹20,000 a year.");
    expect(c.fee.tip.at(-1)).toMatchObject({ text, quote: true });
    // Only a sum at admission: year 1, marked; a DNB figure above the NBEMS ₹1,25,000 warned.
    const adm = cells("MD/MS", fees("MD", [rec("MD/MS", { fee_display: "verbatim", fee_text: "At admission: 40476", fee_parsed: { basis: parsed.basis, src: 1, per_year: [null, null, null], at_admission: { amount: 40476, currency: "INR", quote: "At admission: 40476" } } })]));
    expect(shown(adm.fee)).toEqual(["₹40,476 at admission (Year 1)", "₹40,476 at admission (Year 1)", null, null]);
    const above = cells("DNB", fees("DNB", [{ ...v, fee_parsed: { ...parsed, per_year: [1, 2, 3].map(() => fig(150000, "Year 1", y.quote)) } }]));
    expect([above.fee.marker, above.fee.markerWarn]).toEqual([null, undefined]);
    const usd = cells("MD/MS", fees("MD", [rec("MD/MS", { seat_groups: ["NRI"], fee_display: "verbatim", fee_text: "NRI year 1 (US$ field): 42000", fee_parsed: { basis: parsed.basis, src: 1, per_year: [{ amount: 42000, currency: "USD", quote: "NRI year 1 (US$ field): 42000" }, null, null] } })]));
    expect(usd.fee.short).toBe("Not published");
  });

  it("year columns: each year's full figure and marker, Not published when not published, none past the course", () => {
    const ceil = { amount: 125000, currency: "INR" as const, kind: "nbems_ceiling" as const, maximum: true as const, src: 2 };
    const t = normalizeProgramme("NBEMS Diploma", fees("DNB", [rec("NBEMS Diploma", { seat_groups: ["DNB Quota"], fee_per_year: [ceil, ceil], stipend_per_month: [{ inr: 43000, kind: "nbems_minimum", minimum: true, src: 2 }, null] })]));
    expect([yearValue(t, "fee", 2), yearValue(t, "stipend", 2), yearValue(t, "fee", 3)]).toEqual([{ text: "≤ ₹1.25 L", marker: null }, { text: "Not published", marker: null }, null]);
  });

  it("inrL cuts to two decimals of a lakh or crore; inrCard is the same one style (never ₹43k); feeRange shares the unit", () => {
    expect([171462, 124999, 1980000, 41000, 12345678].map(inrL)).toEqual(["₹1.71 L", "₹1.24 L", "₹19.8 L", "₹41,000", "₹1.23 Cr"]);
    expect([43000, 10000, 43500, 150000, 100800].map(inrCard)).toEqual(["₹43,000", "₹10,000", "₹43,500", "₹1.5 L", "₹1 L"]);
    expect([feeRange(1500000, 2500000), feeRange(50000, 150000), feeRange(null, 171462)]).toEqual(["₹15–25 L", "₹50,000–₹1.5 L", "₹1.71 L"]);
  });

  it("cards round a fee to one decimal of a lakh; exact short forms stay", () => {
    expect([171462, 125000, 41000, 2900000, 12345678].map(inrApprox)).toEqual(["₹1.7 L", "₹1.25 L", "₹41,000", "₹29 L", "₹1.2 Cr"]);
  });

  it("fee wording: one basis, stated once; the amount at admission is year 1, never 'not a yearly fee'", () => {
    // Only an amount at admission (later years not stated): "at admission (Year 1)", and the (i) says the rest is not stated.
    const goa = cells("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [{ ...fee(70324), kind: "amount_at_admission" }, null, null] })]));
    expect(shown(goa.fee)).toEqual(["₹70,324 at admission (Year 1)", "₹70,324 at admission (Year 1)", null, null]);
    expect(goa.fee.tip[0].text).toBe("Year 1: ₹70,324, paid at admission");
    expect(tip(goa.fee)).toContain("MCC's form gives the amount paid at admission (Year 1); it does not state the later years' fees.");
    // CIHSR DNB: ₹1,25,000 at admission, then ₹1,25,000 a year, ₹3,75,000 for the course. A yearly fee, year 1's paid at
    // admission: "₹1.25 L/yr", and no line contradicting it.
    const cihsr = cells("DNB", fees("DNB", [rec("DNB", {
      seat_groups: ["DNB Quota"], fee_per_year: [{ ...fee(125000), kind: "amount_at_admission" }, fee(125000), fee(125000)], fee_whole_course: { amount: 375000, currency: "INR" },
    })]));
    expect(shown(cihsr.fee)).toEqual(["₹1.25 L/yr", "₹1.25 L/yr", null, null]);
    expect(cihsr.fee.tip.map((l) => l.text)).toEqual(["Year 1: ₹1,25,000, paid at admission", "Year 2: ₹1,25,000 a year", "Year 3: ₹1,25,000 a year", "For the whole course: ₹3,75,000 (3 years)"]);
    expect(tip(cihsr.fee)).not.toMatch(/not a yearly fee/);
    // A different figure at admission than a year: the yearly fee is the fee, the amount at admission under it (never sorted as the yearly fee).
    const diff = cells("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [{ ...fee(200000), kind: "amount_at_admission" }, fee(150000), fee(150000)] })]));
    expect(shown(diff.fee).slice(0, 3)).toEqual(["₹1.5 L/yr", "₹1.5 L/yr", "₹2 L at admission (Year 1)"]);
    expect(yearlyFee(normalizeProgramme("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [{ ...fee(200000), kind: "amount_at_admission" }, fee(150000), fee(150000)] })])))?.inr).toBe(150000);
    expect(yearlyFee(normalizeProgramme("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [{ ...fee(70324), kind: "amount_at_admission" }, null, null] })])))).toBeNull(); // an amount at admission alone: no yearly fee
    // A range by subject shows both ends, and why it is a range.
    const range = cells("MD/MS", fees("MD", [rec("MD/MS", { fee_per_year: [{ ...fee(100000), amount_max: 6800000 }, null, null] })]));
    expect(shown(range.fee).slice(0, 3)).toEqual(["₹1–68 L/yr", "₹1–68 L/yr", "Varies (see source)"]);
  });

  it("missing is 'Not published', never 0 or '—'", () => {
    const c = cells("MD/MS", []);
    for (const k of ["fee", "stipend", "leaving"] as const) expect([c[k].short, c[k].missing, c[k].tip.at(-1)?.text]).toEqual(["Not published", true, "Not published."]);
  });
});

describe("bond cells, by record status", () => {
  it("documented: years in orange, the amount for this course as ₹50 L on cards, in full in the table and the (i)", () => {
    const tripura = bond("MD", "Service bond: 1 year · ₹50 L clinical · ₹15 L diploma", 5000000, {
      status: "documented",
      years: "1 (extendable up to 2 more years)",
      amounts: [{ applies_to: "PG degree, clinical subjects", inr: 5000000 }, { applies_to: "PG diploma", inr: 1500000 }],
    });
    const c = cells("MD/MS", [tripura]);
    expect(shown(c.bond)).toEqual(["1Y", "1 year", null, "bond"]);
    expect(c.bond.tip[0]).toEqual({ text: "Service bond: 1 year · ₹50 L clinical · ₹15 L diploma", src: 1 });
    expect(tip(c.bond)).toContain("Years as written: 1 (extendable up to 2 more years)");
    expect(shown(c.bondInr)).toEqual(["₹50 L", "₹50 L", null, "bond"]);
    expect(c.bondInr.tip[1]).toEqual({ text: "₹50,00,000 for this course.", src: 1 });
    expect(shown(cells("Diploma", [tripura]).bondInr).slice(0, 2)).toEqual(["₹15 L", "₹15 L"]);
  });

  it("documented, priced by subject: the range, marked by specialty; added-up years in full", () => {
    const raj = bond("MD", "Service bond: 1 + 3 years · ₹25 L–₹1.5 Cr by subject", 15000000, { status: "documented", years: "1 + 3", by_subject: { ANAESTHESIOLOGY: 5000000, PATHOLOGY: 2500000, GENERALSURGERY: 15000000 } });
    const c = cells("MD/MS", [raj]);
    expect(shown(c.bond)).toEqual(["4Y", "1 + 3 = 4 years", null, "bond"]);
    expect(shown(c.bondInr)).toEqual(["₹25 L–₹1.5 Cr", "₹25 L–₹1.5 Cr", "Varies (see source)", "bond"]);
    expect(c.bondInr.tip).toContainEqual({ text: "The amount varies by specialty: this is the range over the subjects (see the source for yours).", warn: true });
  });

  it("a per defaulting year amount: 'up to', computed, with the published amount behind the (i)", () => {
    const wb = bond("MD", "Service bond: 3 years (diploma 2) · ₹10 L per unserved year", 3000000, { status: "yes", years: "3 (PG Degree); 2 (PG Diploma)", amounts: [{ applies_to: "MD / MS, per defaulting year", inr: 1000000 }] });
    const c = cells("MD/MS", [wb]);
    expect(shown(c.bondInr)).toEqual(["≤ ₹30 L", "≤ ₹30 L", null, "bond"]);
    expect(tip(c.bondInr)).toContain("₹10,00,000 per year × 3 years, computed by Seatora.");
  });

  it("state_rule: the tiny 'state rule' marker, and the (i) says it is the state's order, not the college's document", () => {
    const wb = bond("MD", "State bond: 3 yrs (diploma 2 yrs) as SR, ₹10 L per year not served (WB H&FW notice 14-10-2026)", 3000000, {
      status: "state_rule",
      years: "3 years after a PG degree",
      amounts: [{ applies_to: "MD/MS", inr: 3000000 }, { applies_to: "Diploma", inr: 2000000 }],
    });
    const c = cells("MD/MS", [wb]);
    expect(shown(c.bond)).toEqual(["3Y", "3 years", null, "bond"]);
    expect(c.bond.tip).toContainEqual({ text: "From the state's rule (its order is the source), not the college's own bond document.", warn: true });
    expect(shown(c.bondInr).slice(0, 2)).toEqual(["₹30 L", "₹30 L"]);
  });

  it("a document's bond whose years its summary marks '(state rule)' is marked state rule (Rajasthan)", () => {
    const sms = bond("MD", "Service bond: 2 years (state rule) · ₹25 L–₹1.5 Cr by subject (Anaesthesia ₹50 L) · AIQ included", null, { status: "yes", years: "not stated in the document", by_subject: { ANAESTHESIOLOGY: 5000000, OBG: 15000000 } });
    expect(shown(cells("MD/MS", [sms]).bond)).toEqual(["2Y", "2 years", null, "bond"]);
    // No rule record behind the years: the (i) says the document does not state them.
    expect(cells("MD/MS", [sms]).bond.tip).toContainEqual({ text: "The years are the state's rule as Seatora's summary gives them; the college's own document does not state them.", warn: true });
  });

  it("a state rule that gives the years gives Bond ₹ too: marked, cited to the rule (Kidwai)", () => {
    const ruleUrl = "https://cetonline.karnataka.gov.in/x/PGET_2026_e_brochure.pdf";
    const kidwai = bond("MD", "Service bond: 1 year · ₹5 L; state rule (KEA PGET-2026 bulletin): 3 yrs if Govt needs, ₹50 L (diploma ₹25 L), plus 1 yr compulsory service", 500000, {
      status: "yes",
      amounts: [{ applies_to: "PG degree and diploma, Govt seats (AIQ/State)", inr: 500000 }],
      state_rule: { status: "state_rule", amounts: [{ applies_to: "MD/MS", inr: 5000000 }, { applies_to: "Diploma", inr: 2500000 }], source: { title: "KEA, PGET-2026 bulletin", url: ruleUrl }, text: "State bond: 3 yrs if Govt needs, ₹50 L (diploma ₹25 L), plus 1 yr compulsory service" },
    });
    const c = cells("MD/MS", [kidwai]);
    // The 4 years are the rule's, not the document's 1: marked "state rule" (not "+ state rule"), with a warning line.
    expect(shown(c.bond)).toEqual(["4Y", "3 + 1 = 4 years", null, "bond"]);
    expect(c.bond.tip).toContainEqual({ text: "Years from the state's rule (its order is the source), not the college's own document.", warn: true, src: 2 });
    expect(shown(c.bondInr)).toEqual(["₹50 L", "₹50 L", null, "bond"]);
    expect(c.bondInr.tip.slice(1, 3)).toEqual([{ text: "₹50,00,000 for this course.", src: 2 }, { text: "From the state's rule, as the bond years are, not the college's own bond document.", src: 2, warn: true }]);
    expect(shown(cells("Diploma", [kidwai]).bondInr).slice(0, 2)).toEqual(["₹25 L", "₹25 L"]);
  });

  it("documented with a state rule beside it: '+ state rule'", () => {
    const b = bond("MD", "Service bond: 2 years · ₹20 L", 2000000, { status: "documented", years: 2, state_rule: { status: "state_rule", years: "1 year", amounts: [], text: "1 yr in Delhi Govt hospitals, ₹20 L" } });
    const c = cells("MD/MS", [b]);
    expect(c.bond.marker).toBeNull();
    expect(tip(c.bond)).toContain("State rule as well: 1 yr in Delhi Govt hospitals, ₹20 L");
  });

  it("no_bond_verified: 'No bond' (never orange), bond ₹ 'None'; a state rule that may apply is a caveat", () => {
    const delhi = bond("MD", "No service bond (per the college's MCC bond document)", 0, {
      status: "no_bond_verified",
      state_rule: { status: "state_rule", years: "1 year", amounts: [{ applies_to: "MD/MS", inr: 2000000 }], text: "1 yr in Delhi Govt hospitals, ₹20 L" },
    });
    const c = cells("MD/MS", [delhi]);
    expect([...shown(c.bond), c.bond.markerWarn]).toEqual(["No bond", "No bond", null, null, undefined]);
    expect(c.bond.tip[0]).toEqual({ text: "No bond (the college's own document).", src: 1 });
    expect(c.bond.tip).toContainEqual({ text: "A state rule may apply: 1 yr in Delhi Govt hospitals, ₹20 L", warn: true });
    // In ink like the "No bond" beside it (no colour with a caveat): one colour per row.
    expect(shown(c.bondInr)).toEqual(["None", "None", null, null]);
    const plain = cells("MD/MS", [bond("MD", "No service bond (per the college's MCC bond document)", 0, { status: "no_bond_verified" })]);
    expect(plain.bond.marker).toBeNull();
  });

  it("no bond, but a state law's service may apply: 'Not known' (never 'No bond'), why in the (i)'s first line, as the filters read it", () => {
    const ka = cells("MD/MS", [bond("MD", "No bond per the college's MCC bond document; Karnataka law: 1 yr compulsory govt service may apply", null, { status: "no_bond_verified" })]);
    expect([...shown(ka.bond), ka.bond.markerWarn]).toEqual(["Not known", "Not known", null, "muted", undefined]);
    expect(ka.bond.lead).toBe("Leave after joining: not published. Bond not known. Its document says no bond, but a state law's service may still apply.");
    expect(ka.bond.tip[0]).toEqual({ text: "No bond per the college's MCC bond document; Karnataka law: 1 yr compulsory govt service may apply", src: 1 });
    expect(shown(ka.bondInr)).toEqual(["Not known", "Not known", null, "muted"]);
  });

  it("no_bond_rule: 'No bond', marked NBEMS rule and citing the NBEMS rules; an inferred private status is a caveat", () => {
    const rule = bond("DNB", "No bond (NBEMS rule for private DNB hospitals)", 0, { status: "no_bond_rule" }, NBEMS);
    const c = cells("DNB", [rule]);
    expect(shown(c.bond)).toEqual(["No bond", "No bond", null, null]);
    expect(c.bond.tip[0]).toMatchObject({ text: "No bond (NBEMS rule).", rules: true });
    const unsure = cells("DNB", [bond("DNB", "No bond (NBEMS rule for private DNB hospitals)", 0, { status: "no_bond_rule", confidence: "medium: private status inferred from name" }, NBEMS)]);
    expect([unsure.bond.marker, unsure.bond.markerWarn]).toEqual([null, undefined]);
    expect(unsure.bond.tip).toContainEqual({ text: "Seatora's check: private status inferred from name.", warn: true });
  });

  it("unknown, unclear, not read, blank, none declared: one word, 'Not known' (never 'No bond', never '—'), each with its own why and the record's words", () => {
    const unknown = bond("MD", "MCC bond document has no clear terms — check with the college", null, { status: "unknown", reason: "mcc_document_unclear" });
    const c = cells("MD/MS", [unknown]);
    for (const k of ["bond", "bondInr"] as const) {
      expect(shown(c[k])).toEqual(["Not known", "Not known", null, "muted"]);
      expect(c[k].tip[0]).toEqual({ text: "MCC bond document has no clear terms — check with the college", src: 1 });
    }
    expect(c.bond.lead).toMatch(/Bond not known\. Its bond document doesn't clearly state a bond\.$/);
    const blank = cells("MD/MS", [bond("MD", "No clear service bond: its MCC bond document is a blank form; leaving penalty: see penalty", null, { status: "unclear" })]);
    expect([blank.bond.short, blank.bond.lead]).toEqual(["Not known", expect.stringMatching(/Bond not known\. The college's bond form is blank\.$/)]);
    const unread = cells("MD/MS", [bond("MD", "Bond document on MCC not read: a scan; see the document", null, { status: "unknown", reason: "bond document not read", doc_url: "https://mcc.admissions.nic.in/x?Type=BM" })]);
    expect(shown(unread.bond)).toEqual(["Not known", "Not known", null, "muted"]);
    expect(unread.bond.lead).toMatch(/Bond not known\. Its bond document on MCC is a scan or a filled-in form Seatora couldn't read/);
    expect(unread.bond.tip).toEqual([{ text: "Why it isn't read: a scan.", src: 1 }, { text: "The college's own bond document on MCC", src: 2 }]);
    const none = cells("MD/MS", [bond("MD", "Not declared: the college's MCC profile states no bond and MCC lists no bond document", null, { status: "not_declared", reason: "no bond document on MCC" })]);
    expect([none.bond.short, none.bond.lead]).toEqual(["Not known", expect.stringMatching(/Bond not known\. No bond is declared to MCC, and no document of the college's says “no bond”\.$/)]);
  });

  it("every bond tooltip leads with one plain line from the cells' own fields; a conflict in the record said plainly", () => {
    // Azamgarh-like: a 2-year ₹40 L bond whose years the record writes two ways, and a ₹5 L leaving penalty.
    const up = bond("MD", "Service bond: 2 years · ₹40 L · ₹20 L diploma", 4000000, {
      status: "documented", years: "2 (2018 GO); attached bond form says 1", amounts: [{ applies_to: "PG degree", inr: 4000000 }, { applies_to: "PG diploma", inr: 2000000 }],
    });
    const leave = penalty("MD", { items: [{ kind: "leaving_penalty", applies_to: "PG", inr: 500000, when: "resigning from the course", quote: null, source_url: MCC.url }] });
    const c = cells("MD/MS", [up, leave]);
    const lead = "Leave after joining: ₹5 L. Skip the 2 years' service: ₹40 L. The years are written more than one way (2 (2018 GO); attached bond form says 1): confirm with the college.";
    expect([c.bond.lead, c.bondInr.lead, c.leaving.lead]).toEqual([lead, lead, lead]);
    expect(c.fee.lead).toBeUndefined();
    // The record's own words stay, under the lead.
    expect(c.bond.tip[0]).toEqual({ text: "Service bond: 2 years · ₹40 L · ₹20 L diploma", src: 1 });
    expect(cells("MD/MS", []).bond.lead).toBe("Leave after joining: not published. Bond not known. Seatora has no bond record for this programme yet.");
  });

  it("a DNB / DrNB hospital that declared no bond, where NBEMS lets none be imposed: 'No bond declared', the rule in the (i)", () => {
    const words = "Not declared by the hospital (checked MCC profile and bond page, Uttar Pradesh rules, NBEMS rules on 15 Nov 2026); NBEMS: an undeclared bond can't be imposed this session";
    const c = cells("DNB", [bond("DNB", words, null, { status: "not_declared", reason: "not_declared_no_document" })]);
    expect([...shown(c.bond), c.bond.level]).toEqual(["No bond declared", "No bond declared", null, null, "good"]);
    expect([...shown(c.bondInr), c.bondInr.level]).toEqual(["None", "None", null, "muted", "good"]);
    expect(c.bond.lead).toMatch(/No bond declared, so none can be imposed this session \(NBEMS rule\)\./);
    expect(c.bond.tip[0]).toMatchObject({ rules: true, text: expect.stringMatching(/^The hospital declared no bond to MCC, and NBEMS lets a DNB \/ DrNB hospital impose only a bond it declared before counselling \(NBEMS accreditation bulletin, para 5\.10\)/) });
    expect(c.bond.tip[1]).toEqual({ text: words, src: 1 });
    // NEET SS DrNB: its record ("not declared") needs no words of the rule: NBEMS's rule binds every DrNB hospital.
    const ssWords = "Not declared: the college's MCC profile states no bond and MCC lists no bond document";
    expect(cells("DrNB SS", [bond("DNB", ssWords, null, { status: "not_declared", reason: "no bond document on MCC; none in the profile" })]).bond.short).toBe("No bond declared");
    // A D.M. / M.Ch. or MD seat with none declared (MCC's bulletins state no such rule): "Not known".
    expect(cells("DM/MCh", [bond("MD", ssWords, null, { status: "not_declared", reason: "no bond document on MCC; none in the profile" })]).bond.short).toBe("Not known");
    expect(cells("MD/MS", [bond("MD", "Not declared by the college", null, { status: "not_declared", reason: "not_declared_no_document" })]).bond.short).toBe("Not known");
  });

  it("no bond record at all: 'Not known' with 'not checked yet' (never 'No bond'), still nothing published; DNB cites the NBEMS rule", () => {
    const md = cells("MD/MS", []);
    expect([md.bond.short, md.bond.missing, md.bond.tip[0].text]).toEqual(["Not known", true, "Not checked yet: Seatora has no bond record for this programme."]);
    expect(tip(md.bond)).toContain("Government colleges may still have a state service bond");
    expect(cells("DNB", []).bond.tip[1]).toMatchObject({ rules: true, text: expect.stringMatching(/^NBEMS rule: private DNB hospitals/) });
  });

  it("a declared bond with no ₹ figure for this course is a short phrase (no stipend figures to compute it); years not stated is 'Bond, years not stated'", () => {
    const words = cells("MD/MS", [bond("MD", "Service bond: double the stipend received for 3 years of study", null, { status: "documented", years: "3 years of study; service not stated" })]);
    expect(shown(words.bond)).toEqual(["Bond", "Bond, years not stated", null, "bond"]);
    expect(shown(words.bondInr)).toEqual(["2× stipend", "2× stipend", null, "muted"]);
    expect(tip(words.bondInr)).toContain("No number: Seatora has no stipend figure for every year needed.");
  });
});

describe("leaving cell", () => {
  it("the leaving penalty for this course; MCC's Round 2 forfeit only as a separate line behind the (i)", () => {
    const p = penalty("MD", {
      items: [
        { kind: "leaving_penalty", applies_to: "PG degree, clinical subjects", inr: 3500000, when: "discontinues PG course", quote: null, source_url: MCC.url },
        { kind: "leaving_penalty", applies_to: "PG diploma", inr: 1000000, when: "discontinues PG course", quote: null, source_url: MCC.url },
        { kind: "counselling_forfeit", applies_to: "MCC counselling", inr: 200000, when: "resigning the seat in Round 2", quote: null, source_url: MCC.url },
      ],
    });
    const c = cells("MD/MS", [p]);
    expect(shown(c.leaving)).toEqual(["₹35 L", "₹35 L", null, null]);
    expect(c.leaving.tip[1]).toEqual({ text: "₹35,00,000: PG degree, clinical subjects, discontinues PG course", src: 1 });
    expect(c.leaving.tip.at(-1)).toEqual({ text: "Separate from it: MCC lets the college keep ₹2,00,000 if you resign or don't join from Round 2.", src: 1 });
  });

  it("no leaving penalty, but a rule for leaving among the other penalties (Saifai's debarment): the rule, never Not published", () => {
    const debar = penalty("MD", { items: [{ kind: "other", applies_to: "PG (MD/MS/Diploma) in UP Govt colleges", inr: null, when: "leaving the seat before completing the course", quote: "उसे अगले शैक्षणिक सत्र की प्रवेश प्रक्रिया से Debar किये जाने का निर्णय लिया गया है।", source_url: MCC.url }] });
    const c = cells("MD/MS", [debar]);
    expect(shown(c.leaving)).toEqual(["Barred next year", "Barred next year", null, null]);
    expect(bondPlain(normalizeProgramme("MD/MS", [debar]))).toContain("Leave after joining: barred next year.");
    // A non-money penalty about something else (not leaving) stays out of it.
    const refund = penalty("MD", { items: [{ kind: "other", applies_to: "MD/MS", inr: null, when: "not serving the institution for one year after the course", quote: "refund stipend", source_url: MCC.url }] });
    expect(cells("MD/MS", [refund]).leaving.short).toBe("Not published");
  });

  it("MCC's forfeit in words only is never the leaving penalty: Not published, with the forfeit as a separate line", () => {
    const p = penalty("MD", { items: [{ kind: "counselling_forfeit", applies_to: "MCC counselling", inr: null, when: "reporting in the mop-up / stray round, then leaving", quote: null, source_url: MCC.url }] });
    const c = cells("MD/MS", [p]);
    expect(shown(c.leaving)).toEqual(["Not published", "Not published", null, "muted"]);
    expect(c.leaving.tip.at(-1)).toEqual({ text: "Separate from it: MCC Round 2 / mop-up forfeit: MCC counselling, reporting in the mop-up / stray round, then leaving", src: 1 });
    // The item has no figure and no quote: the fee record's own words say what is forfeited; with no PENALTY, those words alone.
    const words = "Nil if not reported if reported in Mopup/stray round all 3 year fee to be paid";
    const recs = fees("MD", [rec("MD/MS", { counselling_forfeit: { forfeited_if_resign_or_not_join_from_round2: { inr: null, text: words }, src: 1 } })]);
    expect(cells("MD/MS", [p, ...recs]).leaving.tip.at(-1)?.text).toBe(`Separate from it: MCC Round 2 / mop-up forfeit: MCC counselling, reporting in the mop-up / stray round, then leaving: "${words}"`);
    expect(cells("MD/MS", recs).leaving.tip.at(-1)).toEqual({ text: `Separate from it: MCC Round 2 / mop-up forfeit: ${words}`, src: 1 });
  });

  it("bond and leaving priced by clinical vs pre/para-clinical subject: a range marked by specialty (Agartala)", () => {
    const ag = bond("MD", "Service bond: 1 year · ₹50 L clinical · ₹35 L pre/para-clinical", 5000000, {
      status: "yes", years: 1, amounts: [{ applies_to: "PG degree, clinical subjects", inr: 5000000 }, { applies_to: "PG degree, pre/para-clinical subjects", inr: 3500000 }],
    });
    expect(shown(cells("MD/MS", [ag]).bondInr)).toEqual(["₹35 L–₹50 L", "₹35 L–₹50 L", "Varies (see source)", "bond"]);
  });

  it("an additional item owed on top is included and marked; words only is a short phrase", () => {
    const mh = penalty("MD", {
      items: [
        { kind: "leaving_penalty", applies_to: "PG at Govt seats", inr: 1000000, when: "non-completion of Junior residency tenure", quote: null, source_url: MCC.url },
        { kind: "leaving_penalty", applies_to: "PG at Govt seats", inr: 1000000, when: "lapse of PG seat (additional)", quote: null, source_url: MCC.url },
      ],
    });
    expect(shown(cells("MD/MS", [mh]).leaving)).toEqual(["₹10 L–₹20 L", "₹10 L–₹20 L", null, null]);
    const words = penalty("DNB", { items: [{ kind: "leaving_penalty", applies_to: "DNB / Diploma", inr: null, when: "leaving the course", quote: "balance fee for the entire course", source_url: MCC.url }] });
    expect(shown(cells("DNB", [words]).leaving)).toEqual(["Rest of course fee", "Rest of course fee", null, "muted"]);
    expect(tip(cells("DNB", [words]).leaving)).toContain("In words only (no ₹ figure).");
    expect(tip(cells("DNB", [words]).leaving)).not.toContain("Part of it");
  });
});


// Real texts from the bundle (data/medpath-r3/terms.ndjson), each through the real normalizer with this row's own figures.
describe("formula amounts: computed from the record's words over the row's own fee and stipend", () => {
  const stip = (...xs: number[]) => [0, 1, 2].map((i) => (xs[i] != null ? { inr: xs[i], kind: "declared" as const, src: 1 } : null));
  const verbatim = (stipend: number[]) => fees("MD", [rec("MD/MS", { seat_groups: ["Deemed/Paid"], fee_display: "verbatim", fee_text: "Annual fees: in words", stipend_per_month: stip(...stipend) })]);
  const penaltyText = (program: Term["program"], text: string, details: PenaltyDetails): Term => ({ ...term(program, "PENALTY", text), details });
  const leave = (applies_to: string, when: string, quote: string | null = null, inr: number | null = null) => ({ kind: "leaving_penalty" as const, applies_to, inr, when, quote, source_url: MCC.url });

  // Sri Devaraj Urs (SDUAHER): "refund 3 years' stipend", its stipend ₹50,000 / ₹55,000 / ₹60,000 a month; the fee in words.
  const sdu = [
    bond("MD", "Service bond: 1 year + 1 yr compulsory govt service (Karnataka law) · refund 3 years' stipend, if not served", null, {
      status: "yes", years: "1 (serve the institution)", amounts: [],
      quote: "I shall serve this institution for a period of one year after successful completion of the course ... Failing to comply with SDUAHER terms and conditions, I shall refund three years stipend paid to me during the course.",
    }),
    penaltyText("MD", "Seat-leaving penalty: balance tuition and other fees for the entire course (discontinuing the course); Other penalty: refund of three years' stipend (not serving the institution for one year after the course)", {
      items: [leave("MD/MS", "discontinuing the course"), { kind: "other", applies_to: "MD/MS", inr: null, when: "not serving the institution for one year after the course", quote: "I shall refund three years stipend paid to me during the course", source_url: MCC.url }],
    }),
  ];

  it("N years' stipend: years 1..N, ₹/month × 12, marked computed with the formula in the (i) (Sri Devaraj Urs)", () => {
    const c = cells("MD/MS", [...sdu, ...verbatim([50000, 55000, 60000])]);
    expect(shown(c.bondInr)).toEqual(["₹19.8 L", "₹19.8 L", null, "bond"]);
    expect(tip(c.bondInr)).toContain("refund 3 years' stipend, if not served");
    expect(tip(c.bondInr)).toContain("3 years' stipend: (₹50,000 + ₹55,000 + ₹60,000) a month × 12 = ₹19,80,000.");
    // The leaving words: the balance of the course fee, which is in words for this seat: a phrase, never "See text".
    expect(shown(c.leaving)).toEqual(["Rest of course fee", "Rest of course fee", null, "muted"]);
    expect(tip(c.leaving)).toContain("balance tuition and other fees for the entire course (discontinuing the course)");
    // With fee figures: at most the whole course's (a balance).
    const fig = cells("MD/MS", [...sdu, ...fees("MD", [rec("MD/MS", { fee_per_year: [fee(500000), fee(500000), fee(500000)], stipend_per_month: stip(50000, 50000, 50000) })])]);
    expect(shown(fig.bondInr).slice(0, 3)).toEqual(["₹18 L", "₹18 L", null]);
    expect(shown(fig.leaving).slice(0, 3)).toEqual(["≤ ₹15 L", "≤ ₹15 L", null]);
    expect(tip(fig.leaving)).toMatch(/Whole course fee: ₹5,00,000 a year × 3 years = ₹15,00,000\. At most this: a balance is what is still unpaid when you leave\./);
  });

  it("double the stipend received: every year's, doubled; an NBEMS minimum stipend is 'at least' (Odisha)", () => {
    const od = bond("MD", "Service bond: 2 years · double the stipend received, if not served · AIQ included", null, {
      status: "yes", years: 2, amounts: [],
      quote: "Monetary Penalty for defaulters (for not serving in state for two years after completion of course) shall be double the amount of stipend/salary received during study period. Candidates leaving the course before completion of the course leading to lapse of a seat shall be liable for monetary penalty of Rs. 10 lakh and the amount of stipend / salary received by the date of such leaving the course.",
    });
    const c = cells("MD/MS", [od, ...fees("MD", [rec("MD/MS", { stipend_per_month: stip(74456, 78001, 81547) })])]);
    expect(shown(c.bondInr).slice(0, 3)).toEqual(["₹56.16 L", "₹56.16 L", null]);
    expect(c.bondInr.level).toBe("heavy");
    const rule = bond("DNB", "State bond: 2 yrs, repay double the stipend; leaving ₹10 L + stipend; applied to DNB in practice (Odisha resolution 29-01-2024)", null, { status: "state_rule", amounts: [{ applies_to: "NBEMS Diploma", inr: null }] });
    const nb = cells("NBEMS Diploma", [rule, ...fees("DNB", [rec("NBEMS Diploma", { stipend_per_month: [43000, 45000, null].map((v) => (v ? { inr: v, kind: "nbems_minimum" as const, minimum: true as const, src: 2 } : null)) })])]);
    expect(shown(nb.bondInr).slice(0, 3)).toEqual(["≥ ₹21.12 L", "≥ ₹21.12 L", null]);
    expect(tip(nb.bondInr)).toContain("At least this: the stipend is the NBEMS minimum.");
  });

  it("the entire course's fee: every year's (KIMS); an NBEMS maximum is 'at most' (DNB balance fee)", () => {
    const kims = penaltyText("MD", "Seat-leaving penalty: institutional fees for the entire course (discontinuing the course for any reason)", {
      items: [leave("PG medical course", "discontinuing the course for any reason", "undertake to pay Institutional fees to Kalinga Institute of Medical Sciences payable for the entire course")],
    });
    const c = cells("MD/MS", [kims, ...fees("MD", [rec("MD/MS", { fee_per_year: [fee(2900000), fee(2900000), fee(2900000)] })])]);
    expect(shown(c.leaving)).toEqual(["₹87 L", "₹87 L", null, null]);
    expect(c.leaving.level).toBe("heavy");
    const dnb = penaltyText("DNB", "Seat-leaving penalty: balance fee for the whole course (the institute may ask for a bond / bank guarantee) (leaving the institute / course midway)", {
      items: [leave("DNB / Diploma", "leaving the institute / course midway", "liable to pay the balance fee for the whole course even if they leave the institute/course midway")],
    });
    const max = fees("DNB", [rec("DNB", { seat_groups: ["DNB Quota"], fee_per_year: [1, 2, 3].map(() => ({ amount: 125000, currency: "INR" as const, kind: "nbems_ceiling" as const, maximum: true as const, src: 2 })) })]);
    expect(shown(cells("DNB", [dnb, ...max]).leaving).slice(0, 3)).toEqual(["≤ ₹3.75 L", "≤ ₹3.75 L", null]);
    // The fee in words only: what it is, no number.
    expect(cells("MD/MS", [kims, ...verbatim([])]).leaving.short).toBe("Whole course fee");
    // A fee that is a range across courses (no fee of this course's own): the dearest course's figure only in the (i).
    const ranged = cells("MD/MS", [kims, ...fees("MD", [rec("MD/MS", { fee_per_year: [1, 2, 3].map(() => ({ ...fee(500000), amount_max: 5200000 })) })])]);
    // The range over the courses, named for what it is (never "Varies by course").
    expect(shown(ranged.leaving)).toEqual(["≈ ₹15 L–₹1.56 Cr", "Full course fee ≈ ₹15 L–₹1.56 Cr", null, null]);
    expect(ranged.leaving.level).toBe("heavy");
    expect(tip(ranged.leaving)).toContain("gives ₹5–52 L/yr across courses), so it depends on your course: from about ₹15,00,000 (the cheapest course's) to ₹1,56,00,000 (the dearest course's).");
  });

  it("a ₹ figure plus the stipend received: added, the figure to the total ('₹10 L–₹38 L'); 'the lesser of' adds nothing", () => {
    const od = penaltyText("MD", "Seat-leaving penalty: ₹10,00,000 (leaving the course before completion so the seat lapses; plus all stipend/salary received up to leaving)", {
      items: [leave("PG Diploma/DNB/DrNB/MD/MS/MDS/DM/MCh", "leaving the course before completion so the seat lapses; plus all stipend/salary received up to leaving", null, 1000000)],
    });
    const st = fees("MD", [rec("MD/MS", { stipend_per_month: stip(74456, 78001, 81547) })]);
    const c = cells("MD/MS", [od, ...st]);
    expect(shown(c.leaving).slice(0, 3)).toEqual(["₹10 L–₹38.08 L", "₹10 L–₹38.08 L", null]);
    expect(tip(c.leaving)).toContain("₹10,00,000 as stated; total ₹38,08,048. At most this: the stipend received by the date you leave.");
    const bhav = penaltyText("MD", "Seat-leaving penalty: ₹5,00,000", {
      items: [leave("MD/MS/Diploma in pre/para-clinical subjects", "leaving the course midway for any reason: the lesser of total stipend paid to that day or ₹5 lakh, paid to MK Bhavnagar University", null, 500000)],
    });
    expect(shown(cells("MD/MS", [bhav, ...st]).leaving).slice(0, 3)).toEqual(["₹5 L", "₹5 L", null]);
  });

  it("fees + stipend received, combined; a part with no figure (a blank fee, interest) is a phrase, never a number", () => {
    const both = penaltyText("MD", "Seat-leaving penalty: x", {
      items: [leave("MCC-allotted PG (All India [Management] & NRI)", "surrender/resignation after MCC schedule or abandoning mid-course: no refund, pay entire course fee (3 years) + stipend received")],
    });
    const c = cells("MD/MS", [both, ...fees("MD", [rec("MD/MS", { fee_per_year: [fee(1000000), fee(1000000), fee(1000000)], stipend_per_month: stip(45000, 50000, 55000) })])]);
    expect(shown(c.leaving).slice(0, 3)).toEqual(["≤ ₹48 L", "≤ ₹48 L", null]);
    expect(cells("MD/MS", [both, ...verbatim([45000, 50000, 55000])]).leaving.short).toBe("Fees + stipend");
    const em = penaltyText("MD", "Seat-leaving penalty: x", {
      items: [leave("MD Emergency Medicine (PG degree, MD/MS), all candidates", "discontinues the course before completion: repay entire stipend received plus a discontinuation fee (amount left blank in form) with interest at Govt loan rate")],
    });
    const e = cells("MD/MS", [em, ...fees("MD", [rec("MD/MS", { stipend_per_month: stip(54025, 55150, 56275) })])]);
    expect(shown(e.leaving)).toEqual(["Refund stipend", "Refund stipend", null, "muted"]);
    expect(tip(e.leaving)).toContain("No number: part of it has no figure Seatora holds.");
  });

  it("N months' stipend: year 1's ₹/month × N (no bundle record words it so yet)", () => {
    const m = bond("MD", "Service bond: 1 year · refund 6 months' stipend, if not served", null, { status: "yes", years: 1, amounts: [] });
    expect(shown(cells("MD/MS", [m, ...fees("MD", [rec("MD/MS", { stipend_per_month: stip(50000, 55000, 60000) })])]).bondInr).slice(0, 3)).toEqual(["₹3 L", "₹3 L", null]);
  });

  it("no formula: a phrase saying what it is (a state rule, no money penalty, no ₹ figure), never 'See text'", () => {
    const rule = (state: string, penalty: string) => bond("MD", `State bond: 1 yr (${state})`, null, { status: "state_rule", amounts: [], state, penalty });
    expect(cells("MD/MS", [rule("Uttar Pradesh", "No money penalty. Under government order I/676928/2024 dated 26-06-2024, a candidate who leaves a government-college seat after the final counselling round and before finishing the course is barred from the next academic session's admission.")]).leaving.short).toBe("No money penalty");
    expect(cells("MD/MS", [rule("Punjab", "A candidate who drops out and seeks fresh admission must deposit the full course fee (3 years for degree).")]).leaving.short).toBe("Per state rule");
    const plain = penaltyText("MD", "Seat-leaving penalty: x", { items: [leave("MD/MS", "leaving the course")] });
    expect(cells("MD/MS", [plain]).leaving.short).toBe("Not published");
    const policy = bond("MD", "Service bond: no period or amount stated", null, { status: "yes", amounts: [], quote: "I shall be liable to pay the Bond money (as applicable) as per the Policy" });
    expect(cells("MD/MS", [policy]).bondInr.short).toBe("Not published"); // "as per policy" gives no figure
    // Older imports without a record: "Not published".
    expect(cells("MD/MS", [term("MD", "PENALTY", "Leaving: as per the college's rules")]).leaving.short).toBe("Not published");
    for (const c of Object.values(cells("MD/MS", [...sdu, plain]))) expect(c.short).not.toMatch(/See text|In words|As published|No ₹ figure/);
  });
});

describe("colour levels (display only; the colour key)", () => {
  const lv = (c: StatCell) => [c.level ?? null, c.levelWord ?? null];
  it("a bond: amber up to 2 years, orange from 3; its amount red from ₹25 L, amber below", () => {
    const one = cells("MD/MS", [bond("MD", "Service bond: 1 year · ₹50 L", 5000000, { status: "documented", years: "1" })]);
    expect(lv(one.bond)).toEqual(["caution", "a bond of 1 to 2 years"]);
    expect(lv(one.bondInr)).toEqual(["heavy", "₹25 L or more"]);
    const four = cells("MD/MS", [bond("MD", "Service bond: 1 + 3 years · ₹25 L–₹1.5 Cr by subject", 15000000, { status: "documented", years: "1 + 3" })]);
    expect(lv(four.bond)[0]).toBe("strong");
    const small = cells("MD/MS", [bond("MD", "Service bond: 1 year · ₹10 L", 1000000, { status: "documented", years: "1" })]);
    expect(lv(small.bondInr)[0]).toBe("caution");
  });
  it("missing stays uncoloured (grey via tone), never green", () => {
    const c = cells("MD/MS", []);
    for (const k of statKeysAll) expect(c[k].level).toBeUndefined();
  });
});
const statKeysAll = ["fee", "stipend", "bond", "bondInr", "leaving"] as const;

describe("Be careful (beCareful): ₹25 L or more to pay, 3 years or more of bond, or a bond not known", () => {
  const list = (p: Programme, terms: Term[]) => statCells(normalizeProgramme(p, terms));
  it("each reason in words, from the cells", () => {
    expect(beCareful(list("MD/MS", [bond("MD", "Service bond: 1 + 3 years · ₹25 L–₹1.5 Cr by subject", 15000000, { status: "documented", years: "1 + 3", by_subject: { ANAESTHESIOLOGY: 5000000, PATHOLOGY: 2500000, GENERALSURGERY: 15000000 } })]))).toEqual(["bond 1 + 3 = 4 years", "bond penalty ₹25 L–₹1.5 Cr"]);
    expect(beCareful(list("MD/MS", []))).toEqual(["bond not known: ask the college"]);
    const leave = penalty("MD", { items: [{ kind: "leaving_penalty", applies_to: "PG degree", inr: 3500000, when: "discontinues PG course", quote: null, source_url: MCC.url }] });
    expect(beCareful(list("MD/MS", [bond("MD", "No bond", null, { status: "no" }), leave]))).toEqual(["leaving penalty ₹35 L"]);
  });
  it("nothing to say: a short bond under ₹25 L", () => {
    expect(beCareful(list("MD/MS", [bond("MD", "Service bond: 1 year · ₹10 L", 1000000, { status: "documented", years: "1" })]))).toEqual([]);
  });
});

describe("a card's plain cost line (costLine, summaryText)", () => {
  const line = (p: Programme, terms: Term[]) => costLine(normalizeProgramme(p, terms));
  const texts = (p: Programme, terms: Term[]) => Object.values(line(p, terms)).map((x) => x.text).join(" · ");
  it("a bond: its years or what skipping it costs, coloured as its strongest cell", () => {
    expect(line("MD/MS", [bond("MD", "Service bond: 1 year · ₹50 L", 5000000, { status: "documented", years: "1" })]).bond).toEqual({ text: "bond 1 yr or ₹50 L", level: "heavy" });
    const raj = bond("MD", "Service bond: 1 + 3 years · ₹25 L–₹1.5 Cr by subject", 15000000, { status: "documented", years: "1 + 3", by_subject: { ANAESTHESIOLOGY: 5000000, PATHOLOGY: 2500000, GENERALSURGERY: 15000000 } });
    expect(line("MD/MS", [raj]).bond).toEqual({ text: "bond 4 yr or ₹25 L–₹1.5 Cr", level: "heavy" });
    expect(line("MD/MS", [bond("MD", "Service bond (years not stated) · ₹40 L", 4000000, { status: "documented", years: "service not stated" })]).bond?.text).toBe("bond, years not stated or ₹40 L");
  });
  it("no answer is \"bond not known\" (never no bond); a leaving penalty after it; nothing published is left out", () => {
    expect(texts("MD/MS", [])).toBe("bond not known");
    const leave = penalty("MD", { items: [{ kind: "leaving_penalty", applies_to: "PG degree", inr: 3500000, when: "discontinues PG course", quote: null, source_url: MCC.url }] });
    expect(line("MD/MS", [leave]).leaving).toEqual({ text: "leaving: ₹35 L", level: "heavy" });
    const none = bond("DNB", "No bond (NBEMS rule for private DNB hospitals)", 0, { status: "no_bond_rule" }, NBEMS);
    expect(line("DNB", [none]).bond).toEqual({ text: "no bond", level: "good" });
  });
  it("the whole course's fee where every year is published, the stipend, in one line", () => {
    const t = fees("MD", [rec("MD/MS", { fee_per_year: [fee(42000), fee(42000), fee(42000)], fee_whole_course: { amount: 126000, currency: "INR" }, stipend_per_month: [{ inr: 106380, kind: "declared", src: 1 }, null, null] })]);
    expect(texts("MD/MS", t)).toBe("3-year fee ₹1.26 L · stipend ₹1.06 L/mo · bond not known");
    expect(summaryText(normalizeProgramme("MD/MS", t))).toEqual({ fee: "3-year fee ₹1.26 L", stipend: "stipend ₹1.06 L/mo", bond: "bond not known" });
  });
});
