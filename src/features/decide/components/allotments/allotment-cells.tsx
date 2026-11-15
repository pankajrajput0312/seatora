import Link from "next/link";
import type { DecideLinks } from "../../lib/links";
import type { PrevSeat } from "../../types";
import { Dash } from "../bits";
import type { ReportedBeds } from "../institute/institute-data";
import { Beds as OneBeds } from "../pages/beds";
import { prevRemarkLabel } from "./allotments-view";

type NamedPrev = PrevSeat & { collegeName: string; collegeSlug: string; courseName: string };

/** The seat the result PDF prints one round back (R2, R3): institute (linked), course, quota and the remark there; "—" when none. */
export function PrevSeatCell({ prev, L }: { prev: NamedPrev | null; L: DecideLinks }) {
  if (!prev) return <Dash />;
  return (
    <span className="grid">
      {prev.collegeSlug ? (
        <Link href={L.institute(prev.collegeSlug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{prev.collegeName}</Link>
      ) : (
        <span className="font-medium">{prev.collegeName}</span>
      )}
      <span className="text-xs text-muted-foreground">{prev.courseName} · {prev.quota} · {prevRemarkLabel[prev.remark]}</span>
    </span>
  );
}

/**
 * "1,538 beds" as the hospital reports it: the one Beds (pages/beds.tsx). `of`: the institute. Its (i)'s hit area
 * reaches down and sideways, not up: where the type badge and beds wrap onto two lines (the table's institute cell),
 * the type's (i) above stays its own (a later button paints over an earlier one).
 */
export const Beds = ({ beds, of }: { beds: ReportedBeds; of: string }) => <span className="[&_button]:before:top-0"><OneBeds b={beds} inst={of} unit /></span>;
