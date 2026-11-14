import { formatRank } from "@/features/cutoffs/lib/format";
import { bondFigures, formatLakh, stipendYear1 } from "../../lib/format";
import type { OptionTerms } from "../../service";
import { TermText } from "../bits";
import { FeeText } from "../options-view";

// The Seats matrix's fee, stipend, bond and seat-leaving penalty cells, from the published terms on this branch
// (FeeText, TermText, lib/format.ts). Kept in ONE component on purpose: at merge time part B's TermsSummary replaces
// it (swap `seatTermCols` and `SeatTermsCells`; the matrix and its drawer use nothing else of the terms). Server-safe
// (no "use client"): the matrix renders it in the browser.

/** The columns SeatTermsCells renders, in order (`key` = the cells' data-col, for the Display chooser). */
export const seatTermCols = [
  { key: "fee", label: "Course fee/yr" },
  { key: "stipend", label: "Stipend Y1" },
  { key: "bond", label: "Bond" },
  { key: "bondInr", label: "Bond ₹" },
  { key: "penalty", label: "MCC leaving penalty" },
] as const;

const years = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;
/** One figure as `show` formats it; "Varies: see text" when the text gives several (which applies is in the text); `none` when it gives none. */
const oneFigure = (xs: number[], show: (n: number) => string, none: string) => (xs.length > 1 ? "Varies: see text" : xs.length ? show(xs[0]) : none);

/**
 * One row's term cells, each a figure taken from the published text with its source link; "—" when Seatora has no
 * such term for the institute's program (not the same as none). Bond and Bond ₹: the bond's years and ₹ amount when its
 * text gives one of each (bondFigures), else "Varies: see text"; MCC leaving penalty: MCC's seat-leaving forfeit (a
 * state's seat-leaving penalty is in the bond text). The full texts are in the row's details.
 */
export function SeatTermsCells({ t, td }: { t: OptionTerms; td: string }) {
  const b = bondFigures(t.bond?.text);
  const stipend = stipendYear1(t.stipend?.text);
  return (
    <>
      <td data-col="fee" className={td}><FeeText t={t.fee} /></td>
      <td data-col="stipend" className={td}><TermText term={t.stipend && { ...t.stipend, text: stipend ?? t.stipend.text }} /></td>
      <td data-col="bond" className={td}><TermText term={t.bond && { ...t.bond, text: oneFigure(b.years, years, "Years not stated") }} /></td>
      <td data-col="bondInr" className={td}><TermText term={t.bond && { ...t.bond, text: oneFigure(b.inr, formatLakh, "Amount not stated") }} /></td>
      <td data-col="penalty" className={td}>
        <TermText term={t.penalty && { ...t.penalty, text: t.penalty.amountInr != null ? `₹${formatRank(t.penalty.amountInr)}` : t.penalty.text }} />
      </td>
    </>
  );
}
