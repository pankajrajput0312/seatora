import { siteConfig } from "@/config/site";
import { handle } from "@/features/decide/api";
import { feeDefaults, feesCsv, feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { parseSearchParams } from "@/features/decide/lib/params";
import { profileFromParams } from "@/features/decide/profile";
import { getDecideData, listFees } from "@/features/decide/service";

/**
 * The Fees & bond page's current view as CSV: the same params read the same lenient way (her profile's defaults
 * included), every matching row in the page's order. Behind the login like every /api/v1 route (handle), never cached.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const f = parseSearchParams(feesParamsSchema, p);
    const { courses } = await getDecideData();
    const { rows } = await listFees(feesFilters(f, feeDefaults(profileFromParams(p), courses)));
    const notes = [
      "Amounts in ₹: fees per year, stipends per month. An empty number cell = not in Seatora's MCC data (not declared in the MCC profile fields we import), or no such year (see duration_years). Never 0 for unknown.",
      "fee_kind / stipend_kind: declared (the college to MCC), nbems (NBEMS course fee, + GST), minimum (NBEMS floor; actual may be higher), nmc (NMC stipend list: one PG figure, not split by year). whole_course_fee: one yearly figure × the years (computed; year-wise fees may differ).",
      "bond_status: declared, not_declared (DNB: NBEMS lets only government hospitals that declared a state bond to MCC take one), other_course (the declared bond is for other courses).",
      "bond_inr_max / leaving_inr_max: the highest amount for that programme (a per defaulting year amount × the years, see bond_inr_note). bond_inr_status / leaving_status: figure, declared_no_amount (declared in words only: see bond_text / leaving_text) or not_declared. leaving = penalty for leaving the course after joining; resign_round2_inr = MCC's forfeit if you resign or don't join from Round 2.",
      "mcc_profile_shared_by: how many institutes in Seatora's data cite that MCC profile; more than 1 and it may be another institute's profile.",
    ];
    return new Response(`﻿${feesCsv(rows, notes, siteConfig.url)}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="seatora-fees-stipend-bond.csv"', "Cache-Control": "private, no-store" },
    });
  });
}
