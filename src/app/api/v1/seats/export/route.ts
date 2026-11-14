import { CSV_MAX_ROWS, handle, notFound, tooManyRows } from "@/features/decide/api";
import { HISTORY_CAPTION } from "@/features/decide/components/bits";
import { parseSeatsParams, seatsCsv, seatsView } from "@/features/decide/components/seats/find-seats";
import { readParams } from "@/features/decide/lib/params";
import { profileFromParams } from "@/features/decide/profile";

/**
 * The Seats page's current view as CSV: the same params (her profile params plus the page's filters, read leniently as
 * the page reads them, so the file matches what she sees; a dropped exact course or an unknown list is said in the
 * notes), every matching row (`page` ignored; more than CSV_MAX_ROWS is a 400), in the page's order. UTF-8 with a BOM
 * (Excel), "—" = not available; term documents in their own columns, the seat list and result PDFs listed after the rows.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const f = { ...parseSeatsParams(p), page: 1 };
    // One page one row past the cap: every row when they fit, and only that many with history when they don't.
    const v = await seatsView(f, profileFromParams(p), CSV_MAX_ROWS + 1);
    if (!v.r || !v.list) return notFound("No MCC seat list imported");
    if (v.r.total > CSV_MAX_ROWS) return tooManyRows(v.r.total);
    const asked = (readParams(p, ["c"]).c as string[] | undefined) ?? [];
    const notes = [
      HISTORY_CAPTION,
      ...asked.filter((c) => !f.c.includes(c)).map((c) => `Course "${c}" was not recognised (degree~SPECIALTY, e.g. DNB~FAMILYMEDICINE) and is left out of the course filter.`),
      ...(f.list && f.list !== v.list.key ? [`Seat list "${f.list}" was not found, so this is the ${v.list.year} ${v.list.round} ${v.list.kind} list.`] : []),
    ];
    const name = `seatora-seats-${v.list.year}-${v.list.round}-${v.f.view === "compare" ? "all-lists" : v.list.kind}.csv`;
    return new Response(`\uFEFF${await seatsCsv({ ...v, r: v.r }, notes)}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  });
}
