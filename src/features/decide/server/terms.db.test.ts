import { describe, expect, it } from "vitest";
import { seatGroups, type MccFeesStructured } from "@/features/cutoffs/lib/import-schema";
import { db } from "@/lib/db";
import { inrFull, statCells } from "../lib/stat-format";
import { getCatalog } from "./catalog";
import { collegeTerms, courseTerms, programmes, termQuality, type Quality } from "./terms";

// Every CollegeTerm in Postgres through the normalizer. Run with DATABASE_URL set, e.g.
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/server/terms.db.test.ts
describe.skipIf(!process.env.DATABASE_URL)("terms normalizer on the real MCC data", { timeout: 60_000 }, () => {
  it("reads every term: BOND / PENALTY from their record, the rest fully or partly (a fee range by subject: partly)", async () => {
    const cat = await getCatalog();
    const by: Record<string, Record<Quality, number>> = {};
    for (const t of cat.terms.filter((x) => !x.details)) {
      const q = termQuality(t);
      (by[t.kind] ??= { full: 0, partial: 0, none: 0 })[q]++;
      if (q !== "full") console.log(`${q} ${t.kind} ${t.program}: ${t.text}`);
      if (q === "none") expect(t.text).toMatch(/by subject/);
    }
    console.log("parse coverage (terms without a record)", JSON.stringify(by));
    expect(cat.terms.filter((t) => (t.kind === "BOND" || t.kind === "PENALTY") && !t.details)).toEqual([]);
  });

  it("every summary agrees with the fee table: figures only from a 'numbers' record, each year as stated, never a verbatim one's", async () => {
    const cat = await getCatalog();
    const rows = await db.$queryRaw<{ key: string; programme: string; g: string; data: MccFeesStructured }[]>`
      SELECT c.key, f.programme, f."quotaGroup" AS g, f.data FROM "FeesStructured" f JOIN "College" c ON c.id = f."collegeId"`;
    if (!rows.length) return; // an import before the fee table (bundle schema 1)
    const pos = (g: string) => seatGroups.indexOf(g.split("+")[0] as (typeof seatGroups)[number]);
    const first = new Map<string, MccFeesStructured>();
    for (const r of rows.sort((a, b) => pos(a.g) - pos(b.g))) if (!first.has(`${r.key}|${r.programme}`)) first.set(`${r.key}|${r.programme}`, r.data);
    const n = { numbers: 0, verbatim: 0, none: 0 };
    for (const c of cat.colleges)
      for (const p of collegeTerms(cat, c.key)) {
        const r = first.get(`${c.key}|${p.programme}`);
        const at = `${c.name} ${p.programme}`;
        const numbers = r?.fee_display === "numbers";
        const len = p.durationYears;
        expect(p.years.map((y) => (y.fee ? [y.fee.inr, y.fee.kind, !!y.fee.atAdmission] : null)), at).toEqual(
          Array.from({ length: len }, (_, i) => {
            const f = numbers ? r!.fee_per_year[i] : null;
            return f?.amount != null ? [f.amount, f.maximum ? "maximum" : "declared", f.kind === "amount_at_admission"] : null;
          }),
        );
        expect(p.years.map((y) => y.stipend && [y.stipend.inr, y.stipend.kind === "minimum"]), at).toEqual(Array.from({ length: len }, (_, i) => (r?.stipend_per_month[i] ? [r.stipend_per_month[i]!.inr, !!r.stipend_per_month[i]!.minimum] : null)));
        expect(p.wholeCourseFee, at).toBe(numbers ? (r!.fee_whole_course?.amount ?? null) : null);
        // The fee cell itself: a verbatim fee shows no ₹ figure; a numbers one its year-1 figure, "at admission" where it is that.
        const fee = statCells(p)[0];
        if (numbers && p.years[0].fee) {
          expect(fee.full, at).toContain(inrFull(p.years[0].fee.inr));
          if (p.years[0].fee.atAdmission) expect(fee.marker, at).toBe("at admission");
        } else expect(fee.full, at).not.toContain("₹");
        n[!r ? "none" : numbers ? "numbers" : "verbatim"]++;
      }
    console.log("programmes by fee-table record", JSON.stringify(n));
    expect(n.numbers).toBeGreaterThan(1000);
    expect(n.verbatim).toBeGreaterThan(50);
  });

  it("a programme reads only its own bucket's terms, and their documents", async () => {
    const cat = await getCatalog();
    for (const c of cat.colleges) {
      for (const p of collegeTerms(cat, c.key)) {
        const own = cat.terms.filter((t) => t.college === c.key && t.program === programmes[p.programme].bucket);
        const urls = new Set(
          own.flatMap((t) => [
            t.source.url,
            ...(!t.details ? [] : "items" in t.details ? t.details.items.map((i) => i.source_url) : "records" in t.details ? t.details.records.flatMap((r) => r.sources.map((s) => s.url)) : [...(t.details.by_course ?? []).map((x) => x.src_url), t.details.doc_url]),
          ]),
        );
        for (const s of p.sources) expect(urls.has(s.url), `${c.name} ${p.programme}: ${s.url}`).toBe(true);
      }
    }
  });

  it("the check colleges", async () => {
    const cat = await getCatalog();
    const of = (prefix: string, programme: string) => collegeTerms(cat, cat.colleges.find((c) => c.key.startsWith(prefix))!.key).find((p) => p.programme === programme)!;
    // Kokilaben Navi Mumbai DNB: the NBEMS fee ceiling and stipend floor each year, and no bond by the NBEMS rule's record.
    const kokila = of("KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8", "DNB");
    expect(kokila.years.map((y) => [y.fee?.inr, y.fee?.kind, y.stipend?.inr, y.stipend?.kind])).toEqual([[125000, "maximum", 43000, "minimum"], [125000, "maximum", 45000, "minimum"], [125000, "maximum", 47000, "minimum"]]);
    expect(kokila.wholeCourseFee).toBe(375000);
    expect(kokila.bond).toMatchObject({ status: "none", basis: "nbems_rule", years: 0 });
    // GMC Nagpur MD/MS: its own document, 1 year, ₹50 L; MCC's Round 2 forfeit ₹1,500; of MCC's profiles, its own only
    // (the Maharashtra leaving penalty cites the state CET cell's brochure, no MCC id).
    const nagpur = of("GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT", "MD/MS");
    expect([nagpur.bond.basis, nagpur.bond.years, nagpur.bond.amount.max, nagpur.resignForfeit?.inr]).toEqual(["document", 1, 5000000, 1500]);
    expect(nagpur.sources.every((s) => (s.mccId ?? "700303") === "700303" && s.sharedBy === 1)).toBe(true);
    expect(nagpur.sources.filter((s) => s.mccId === "700303").length).toBeGreaterThan(0);
    // Seth GS (Maharashtra): the state rule, 1 year, ₹50 L; leaving ₹10 L, and ₹10 L more for a lapsed seat (two items:
    // ₹10 L–₹20 L, the additional one included); Diploma is a 2-year course.
    const seth = of("SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM", "Diploma");
    expect(seth.bond).toMatchObject({ status: "declared", basis: "state_rule", years: 1, amount: { max: 5000000 }, leavingAmount: { min: 1000000, max: 2000000, extra: 1000000 } });
    expect(seth.bond.leaving.map((p) => p.text)).toEqual(["₹10,00,000: MD/MS, not completing the junior residency tenure", "₹10,00,000: MD/MS, lapse of a PG seat (additional)"]);
    expect(seth.years).toHaveLength(2);
    // BMHRC Bhopal MCh: its MD record's bond rows are for PG seats only, so not the MCh's; no fee or stipend copied.
    const bmhrc = of("BHOPALMEMORIALHOSPITALANDRESEARCHCENTREB", "MCh");
    expect([bmhrc.bond.status, bmhrc.bond.amount.state, bmhrc.years[0].fee]).toEqual(["other_course", "none", null]);
    // Its fee table: ₹1,82,128 in year 1, ₹1,58,100 in year 2, ₹3,40,228 for the course (never year 1 × 2).
    expect([seth.years.map((y) => y.fee?.inr), seth.wholeCourseFee]).toEqual([[182128, 158100], 340228]);
  });

  it("course labels, years added up, state rules beside documents, caveats, fee ranges, unsourced unknowns", async () => {
    const cat = await getCatalog();
    const of = (prefix: string, programme: string) => collegeTerms(cat, cat.colleges.find((c) => c.key.startsWith(prefix))!.key).find((p) => p.programme === programme)!;
    // SBLS DNB: the All India "DNB/Diploma" ₹10 L, not the state-quota ₹15 L; Tamil Nadu HQ hospital: NBEMS Diploma ₹10 L, DNB ₹15 L leaving.
    expect(of("SBLSCIVILHOSPITAL", "DNB").bond).toMatchObject({ years: 1, amount: { max: 1000000 } });
    expect([of("GOVERNMENTHEADQUARTERSHOSPITALDISTRICTGO", "NBEMS Diploma"), of("GOVERNMENTHEADQUARTERSHOSPITALDISTRICTGO", "DNB")].map((t) => t.bond.leavingAmount.max)).toEqual([1000000, 1500000]);
    // Karnataka: "DNB/Diploma" leaving items reach DNB; "1 yr compulsory + up to 3 yrs if called" is 4 years.
    expect(of("DISTRICTHOSPITALBALLARI", "DNB").bond.leavingAmount.max).toBe(2000000);
    expect(of("MYSOREMEDICALCOLLEGE", "MD/MS").bond).toMatchObject({ years: 4, yearsSum: "1 + 3" });
    // Rajasthan "All PG (MD/MS/DM/MCh)": MD/MS leaving ₹10 L.
    expect(of("JHALAWARMEDICALCOLLEGE", "MD/MS").bond.leavingAmount.max).toBe(1000000);
    // A state rule beside the document: its years (Tezpur 2, not the 2012 form's 10; Latur 1; IGMC Shimla 2).
    expect(["TEZPURMEDICALCOLLEGE", "GOVERNMENTMEDICALCOLLEGELATUR", "INDIRAGANDHIMEDICALCOLLEGESHIMLA"].map((k) => of(k, "MD/MS").bond.years)).toEqual([2, 1, 2]);
    // No bond with a caveat: Karnataka's compulsory service (years unknown), a hospital taken as private from its name.
    expect(of("KASTURBAMEDICALCOLLEGEMANIPAL", "MD/MS").bond).toMatchObject({ status: "none", years: null, caveat: expect.stringMatching(/Karnataka law/) });
    // CNMC Diploma: ₹10 L per unserved year × 2, the document's words kept.
    expect(of("CALCUTTANATIONALMEDICALCOLLEGE", "Diploma").bond).toMatchObject({ years: 2, amount: { max: 2000000, perYear: 1000000 }, quote: expect.any(String) });
    // DY Patil Pune: the fee by subject is in the profile's words only (no figure); ESIC Udyogmandal: the unknown bond with no document, its words kept.
    const dyp = of("DRDYPATILMEDICALCOLLEGEPUNE", "MD/MS");
    expect([dyp.years[0].fee, dyp.unread.map((u) => u.kind)]).toEqual([null, ["FEE"]]);
    const esic = of("SEPESICHOSPITALUDYOGMANDAL", "NBEMS Diploma");
    expect(esic.bond).toMatchObject({ status: "not_declared", text: expect.stringMatching(/other ESIC colleges/) });
    expect(esic.sources.find((s) => s.n === esic.bond.src)).toMatchObject({ url: null, type: "THIRD_PARTY_RESEARCH" });
  });

  it("amounts per programme and specialty, years per programme", async () => {
    const cat = await getCatalog();
    const byName = (name: string) => cat.colleges.find((c) => c.name === name)!.key;
    const of = (name: string, programme: string) => collegeTerms(cat, byName(name)).find((p) => p.programme === programme)!;
    // Agartala GMC: ₹35 L (pre/para-clinical) to ₹50 L (clinical) for MD/MS, leaving ₹35 L.
    expect(collegeTerms(cat, cat.colleges.find((c) => c.key.startsWith("AGARTALAGOVERNMENTMEDICALCOLLE"))!.key).find((p) => p.programme === "MD/MS")!.bond)
      .toMatchObject({ basis: "document", years: 1, amount: { min: 3500000, max: 5000000 }, leavingAmount: { max: 3500000 } });
    // Burdwan (West Bengal rule): MD/MS 3 years, ₹30 L, leaving ₹5 L; Diploma 2 years, ₹20 L, leaving ₹2 L.
    expect(of("Burdwan Medical College", "MD/MS").bond).toMatchObject({ basis: "state_rule", years: 3, amount: { max: 3000000 }, leavingAmount: { max: 500000 } });
    expect(of("Burdwan Medical College", "Diploma").bond).toMatchObject({ basis: "state_rule", years: 2, amount: { max: 2000000 }, leavingAmount: { max: 200000 } });
    // Rajasthan's bond by subject: ₹25 L–₹1.5 Cr for MD/MS; MD Anaesthesiology's own row is ₹50 L.
    const snmc = byName("Dr. Sampurnanand Medical College (SNMC)");
    expect(of("Dr. Sampurnanand Medical College (SNMC)", "MD/MS").bond.amount).toMatchObject({ min: 2500000, max: 15000000, varies: true });
    expect(courseTerms(cat, snmc, "MD", "ANAESTHESIOLOGY").bond.amount).toMatchObject({ min: 5000000, max: 5000000, varies: false });
  });
});
