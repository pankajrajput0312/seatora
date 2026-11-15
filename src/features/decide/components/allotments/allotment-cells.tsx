import Link from "next/link";
import type { DecideLinks } from "../../lib/links";
import type { PrevSeat } from "../../types";
import { Dash } from "../bits";
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
