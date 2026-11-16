import { CSV_MAX_ROWS, handle, notFound, tooManyRows } from "@/features/decide/api";
import { allotmentsCsv, allotmentsView } from "@/features/decide/components/allotments/allotments-view";
import { roundLabel } from "@/features/decide/types";
import { planCap, planRequired } from "@/features/plans/usage";

/**
 * The Allotments page's current view as CSV: the same params read the same lenient way (`page` ignored), every matching
 * row up to CSV_MAX_ROWS (more is a 400), in the page's order. UTF-8 with a BOM (Excel). Behind the login like every
 * /api/v1 route (handle), never cached. Ranks only, never names.
 */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await planCap("csv"))) return planRequired("CSV export");
    const p = new URL(req.url).searchParams;
    p.delete("page");
    // One row past the cap: every row when they fit, and only that many built when they don't.
    const v = await allotmentsView(p, CSV_MAX_ROWS + 1);
    if (!v) return notFound("No institute with this slug");
    if (v.r.total > CSV_MAX_ROWS) return tooManyRows(v.r.total);
    const notes = [
      "MCC allotment results: ranks only, never names. What happened then, not a prediction.",
      ...(v.rankError ? [v.rankError] : []),
      ...(v.latest ? [`No filter given, so this is the latest round, ${v.latest.year} ${roundLabel[v.latest.rounds.at(-1)!]}.`] : []),
      "Seat category = the seat's category; candidate category = the allotted candidate's own category as the PDF prints it (an OBC, SC, ST or EWS candidate often holds an Open seat). Choice no. = the candidate's choice number of this seat (R2 and R3 PDFs only). Status: allotted (R1 and stray rounds), fresh or upgraded (R2, R3). In R2 and later the results list only new or upgraded allotments.",
      "Previous seat = the seat the PDF prints in the previous round's columns (R1 for R2, R2 for R3) and the remark printed there; — where it prints none.",
      "Fee, stipend, bond and leaving penalty: the course's programme terms as published (DNB seats follow NBEMS; MD, MS and Diploma seats the college), each with its document. — = none published.",
    ];
    const name = ["seatora-allotments", v.inst?.slug, v.filters.year, v.filters.round].filter(Boolean).join("-");
    return new Response(`﻿${allotmentsCsv(v.r.rows, v.meta.sources, notes)}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" },
    });
  });
}
