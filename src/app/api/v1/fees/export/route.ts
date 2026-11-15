import { siteConfig } from "@/config/site";
import { handle } from "@/features/decide/api";
import { feeDefaults, feesCsv, feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { parseSearchParams } from "@/features/decide/lib/params";
import { termFilterLists } from "@/features/decide/lib/term-filters";
import { profileFromParams } from "@/features/decide/profile";
import { getDecideData, listFees } from "@/features/decide/service";

/**
 * The Fees & bond page's current view as CSV: the same params read the same lenient way (her profile's defaults
 * included), every matching row in the page's order. Behind the login like every /api/v1 route (handle), never cached.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const f = parseSearchParams(feesParamsSchema, p, termFilterLists);
    const { courses } = await getDecideData();
    const { rows } = await listFees(feesFilters(f, feeDefaults(profileFromParams(p), courses)));
    const notes = [
      "Amounts in ₹: fees per year, stipends per month. An empty number cell = not in Seatora's MCC data (not declared in the MCC profile fields we import), or no such year (see duration_years). Never 0 for unknown.",
      "fee_kind / stipend_kind: declared (the college's MCC profile), maximum (NBEMS maximum DNB fee: the most a DNB hospital may charge, no GST, paid to the hospital; shown where the hospital declared none, not its own figure), minimum (NBEMS floor; actual may be higher), nmc (NMC stipend list: one PG figure, not split by year). fee_y* empty for a year the profile does not state, and for a fee given only in the profile's own words (by subject, a range: see page_url). fee_y1_at_admission: year 1 is the amount paid at admission. whole_course_fee: only where every year's fee is stated. fee_min: a fee declared as a range (by subject): fee_y* is its highest, fee_min its lowest; no whole_course_fee.",
      "bond_status: declared, none (no bond: bond_basis document = the college's own document, nbems_rule = NBEMS's rule for private DNB hospitals; bond_inr_max 0, bond_years 0; bond_caveat also notes a hospital taken as private from its name), not_declared (no bond term, or Seatora's check found no clear answer: see bond_text; or the college's document says no bond but a state law's service may still apply: bond_caveat, with bond_basis, bond_years and bond_inr_max empty; DNB: NBEMS lets only government hospitals that declared a state bond to MCC take one), other_course (the declared bond is for other courses). bond_basis state_rule: the state's rule, not the college's own document. bond_years: years joined in the bond summary are added up (\"1 yr compulsory govt service + up to 3 yrs if called\" = 4); a state rule beside the college's document gives the rule's years (see bond_text).",
      "bond_inr_max / leaving_inr_max: the highest amount for that programme (a per defaulting year amount × the years, see bond_inr_note; leaving: an additional amount, e.g. for the seat lapsing, included). bond_inr_status / leaving_status: figure, declared_no_amount (declared in words only: see bond_text / leaving_text) or not_declared. leaving = penalty for leaving the course after joining; resign_round2_inr = MCC's forfeit if you resign or don't join from Round 2.",
      "mcc_profile_shared_by: how many institutes in Seatora's data cite that MCC profile; more than 1 and it may be another institute's profile.",
    ];
    return new Response(`﻿${feesCsv(rows, notes, siteConfig.url)}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="seatora-fees-stipend-bond.csv"', "Cache-Control": "private, no-store" },
    });
  });
}
