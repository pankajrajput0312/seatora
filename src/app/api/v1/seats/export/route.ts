import { handle, notFound } from "@/features/decide/api";
import { HISTORY_CAPTION } from "@/features/decide/components/bits";
import { parseSeatsParams, seatsCsv, seatsView } from "@/features/decide/components/seats/find-seats";
import { profileFromParams } from "@/features/decide/profile";

/**
 * The Seats page's current view as CSV: the same params (her profile params plus the page's filters, read leniently as
 * the page reads them, so the file matches what she sees), every matching row, in the page's order. UTF-8 with a BOM
 * (Excel), "—" = not available; term documents in their own columns, the seat list and result PDFs listed after the rows.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const v = await seatsView(parseSeatsParams(p), profileFromParams(p));
    if (!v.r || !v.list) return notFound("No MCC seat list imported");
    const name = `seatora-seats-${v.list.year}-${v.list.round}-${v.f.view === "compare" ? "all-lists" : v.list.kind}.csv`;
    return new Response(`\uFEFF${await seatsCsv({ ...v, r: v.r }, [HISTORY_CAPTION])}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  });
}
