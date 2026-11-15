import Link from "next/link";
import { Building2, IndianRupee, LayoutGrid, Lock, ScanSearch, TrendingUp, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Hero visual: the layout of a hospital's Residents tab. Names and ranks are redacted bars, not data.
const rows = [
  { batch: 2025, name: "w-3/5", air: "w-14" },
  { batch: 2025, name: "w-4/5", air: "w-12" },
  { batch: 2024, name: "w-1/2", air: "w-14" },
  { batch: 2024, name: "w-3/4", air: "w-12" },
  { batch: 2023, name: "w-2/5", air: "w-14" },
];

// What the planner holds, one feature per card, floated beside the sheet on wide screens.
const left = "right-[calc(100%-1.5rem)]";
const right = "left-[calc(100%-1.5rem)]";
const notes = [
  { icon: UsersRound, label: "Residents' names", href: "/decide/institutes", spot: `${left} top-6` },
  { icon: Building2, label: "Hospital details", href: "/decide/institutes", spot: `${left} top-38` },
  { icon: TrendingUp, label: "Closing ranks", href: "/decide/last-ranks", spot: `${left} top-70` },
  { icon: LayoutGrid, label: "Seat matrix", href: "/decide/seats", spot: `${right} top-18` },
  { icon: ScanSearch, label: "Rank scan", href: "/decide/rank-scan", spot: `${right} top-50` },
  { icon: IndianRupee, label: "Fees and bond", href: "/decide/fees", spot: `${right} top-82` },
];

export function Roster() {
  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <ul aria-label="In the planner" className="hidden xl:block">
        {notes.map(({ icon: Icon, label, href, spot }) => (
          <li key={label} className={`absolute z-10 ${spot}`}>
            <Link href={href} className="flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pr-4 pl-2.5 text-sm font-semibold whitespace-nowrap shadow-overlay hover:border-foreground">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"><Icon className="size-4.5" aria-hidden /></span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <figure className="w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-overlay">
        <figcaption className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
          <span>
            <span className="block font-bold">Residents at a DNB hospital</span>
            <span className="block text-sm text-muted-foreground">Family Medicine, three batches</span>
          </span>
          <Badge>Example</Badge>
        </figcaption>
        <table aria-hidden className="w-full table-fixed text-[15px]">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="w-[45%] px-5 py-2.5 text-left font-medium md:px-6">Name</th>
              <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Course</th>
              <th className="w-20 px-3 py-2.5 text-left font-medium">Batch</th>
              <th className="w-28 px-5 py-2.5 text-right font-medium whitespace-nowrap md:w-32 md:px-6">2025 AIR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-5 py-3 md:px-6">
                  <span className="flex items-center gap-3">
                    <span className="size-7 shrink-0 rounded-full bg-wash" />
                    <span className="min-w-0 flex-1"><span className={`block h-2.5 rounded-full bg-border ${r.name}`} /></span>
                  </span>
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">DNB Family Medicine</td>
                <td className="numeric px-3 py-3">{r.batch}</td>
                <td className="px-5 py-3 md:px-6"><span className={`ml-auto block h-2.5 rounded-full bg-border ${r.air}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-start gap-2.5 border-t border-border bg-background px-5 py-3.5 text-sm text-muted-foreground md:px-6">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Names, course, batch and 2025 AIR come from MCC&apos;s admitted-candidates lists. Sign in to see them.
        </p>
      </figure>
    </div>
  );
}
