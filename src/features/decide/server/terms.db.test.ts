import { describe, expect, it } from "vitest";
import { getCatalog } from "./catalog";
import { collegeTerms, termQuality, type Quality } from "./terms";

// Every CollegeTerm in Postgres through the normalizer. Run with DATABASE_URL set, e.g.
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/server/terms.db.test.ts
describe.skipIf(!process.env.DATABASE_URL)("terms normalizer on the real MCC data", { timeout: 60_000 }, () => {
  it("reads every term fully or partly; none is left unread", async () => {
    const cat = await getCatalog();
    const by: Record<string, Record<Quality, number>> = {};
    for (const t of cat.terms) {
      const q = termQuality(t);
      (by[t.kind] ??= { full: 0, partial: 0, none: 0 })[q]++;
      if (q !== "full") console.log(`${q} ${t.kind} ${t.program}: ${t.text}`);
    }
    console.log("parse coverage", JSON.stringify(by));
    const sum = (q: Quality) => Object.values(by).reduce((a, x) => a + x[q], 0);
    expect(sum("none")).toBe(0);
    expect(sum("full") + sum("partial")).toBe(cat.terms.length);
  });

  it("the check colleges", async () => {
    const cat = await getCatalog();
    const of = (prefix: string) => collegeTerms(cat, cat.colleges.find((c) => c.key.startsWith(prefix))!.key);
    // Kokilaben Navi Mumbai: DNB, NBEMS fee, declared stipend, no bond term.
    const [kokila] = of("KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8");
    expect(kokila.programme).toBe("DNB");
    expect(kokila.years.map((y) => [y.fee?.inr, y.fee?.kind, y.stipend?.inr])).toEqual([[125000, "nbems", 63000], [125000, "nbems", 64000], [125000, "nbems", 65000]]);
    expect(kokila.bond.status).toBe("not_declared");
    // GMC Nagpur MD/MS: 1 year, ₹50 L; the super-speciality figures are not MD/MS's.
    const nagpur = of("GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT").find((p) => p.programme === "MD/MS")!;
    expect([nagpur.bond.years, nagpur.bond.amount.max, nagpur.resignForfeit?.inr]).toEqual([1, 5000000, 1500]);
    // Seth GS: the declared bond is for super-speciality only; Diploma is a 2-year course.
    const seth = of("SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM");
    expect(seth.map((p) => p.programme)).toEqual(["MD/MS", "Diploma"]);
    expect(seth.map((p) => p.bond.status)).toEqual(["other_course", "other_course"]);
    expect(seth[1].years).toHaveLength(2);
    expect(seth[1].wholeCourseFee).toBe(2 * 182128);
  });

  it("the review's colleges: other bucket, words, MCh, hostel fee, per-year bond, AIQ, shared profiles", async () => {
    const cat = await getCatalog();
    const of = (prefix: string, programme: string) => collegeTerms(cat, cat.colleges.find((c) => c.key.startsWith(prefix))!.key).find((p) => p.programme === programme)!;
    const byName = (name: string, programme: string) => collegeTerms(cat, cat.colleges.find((c) => c.name === name)!.key).find((p) => p.programme === programme)!;
    // Dr Radhakrishnan: the college's MCC profile terms were filed under DNB; MD/MS shows them, saying so.
    const hamirpur = byName("Dr. Radhakrishnan Govt. Medical College", "MD/MS");
    expect([hamirpur.bond.status, hamirpur.bond.years, hamirpur.years[0].stipend?.inr]).toEqual(["declared", 2, 40000]);
    expect(hamirpur.sources.every((s) => s.filedUnder === "DNB")).toBe(true);
    // Gondia DNB: the Maharashtra bond filed under MD/MS.
    expect(byName("Government Medical College, Gondia", "DNB").bond).toMatchObject({ status: "declared", years: 1, amount: { max: 5000000 } });
    // Baroda: "Bond amount payable if PG course not completed" = ₹40 L.
    expect(byName("Govt. Medical College, Baroda", "MD/MS").bond.leavingAmount.max).toBe(4000000);
    // MCh never gets the MD/MS fee or a PG-only bond.
    const bmhrc = byName("BHOPAL MEMORIAL HOSPITAL AND RESEARCH CENTRE", "MCh");
    expect([bmhrc.wholeCourseFee, bmhrc.years[3].fee, bmhrc.bond.status]).toEqual([null, null, "other_course"]);
    // DY Patil (profile 700440): the imported fee is its hostel fee.
    expect(byName("DR D Y PATIL MEDICAL COLLEGE", "MD/MS").years[0].fee).toBeNull();
    // Calcutta National: ₹10 L per defaulting year × 3 = up to ₹30 L, the same figure in every view.
    expect(byName("CALCUTTA NATIONAL MEDICAL COLLEGE", "MD/MS").bond.amount).toMatchObject({ max: 3000000, perYear: 1000000 });
    // SBLS: the All India figure (1 year, ₹10 L), not the state-quota one.
    expect(byName("SBLS Civil Hospital", "DNB").bond).toMatchObject({ years: 1, amount: { max: 1000000 } });
    // GMC Nagpur's profile 700303 is cited by 8 institutes: never "Declared by the college".
    expect(of("GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT", "MD/MS").sources[0]).toMatchObject({ mccId: "700303", sharedBy: 8 });
  });
});
