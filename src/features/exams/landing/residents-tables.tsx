// The residents pages' hospital table (/neet-pg/residents: the hospitals with the most residents; a state's page: all of
// them, each with its courses): counts only, server-rendered. The search is the branch tables' (BranchSearch, the only
// JS); the fold a checkbox read by CSS. Each hospital links to its residents in Decide, sign-up first.
import "server-only";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { cn } from "@/lib/cn";
import { BranchSearch } from "./branch-search";
import type { Residents } from "./residents";

const FOLD = 25;
/** A count; none in that year's list: "—". */
const n = (k: number) => (k ? formatRank(k) : "—");
const viaSignup = (next: string) => `/signup?${new URLSearchParams({ next })}`;
/** A hospital's Residents tab in Decide, sign-up first (/signup sends a signed-in member straight on). */
export const hospitalHref = (slug: string) => viaSignup(decideLinks("").institute(slug, "residents"));
export const textLink = "underline decoration-foreground/25 underline-offset-4 hover:text-sky";
export const th = "px-3 py-3 font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4";
/** Number cells, styled from the table (one class list, not one per cell). */
export const CELLS = "[&_td]:numeric [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-right [&_td]:whitespace-nowrap md:[&_td]:px-4";

/** `courses`: each hospital's courses with their counts under its name (a state's page); else its state and course count. */
export function HospitalTable({ r, hospitals, caption, none, courses = false }: { r: Residents; hospitals: Residents["hospitals"]; caption: string; none: string; courses?: boolean }) {
  return (
    <div data-lr className="group/lr [&_[data-more]]:hidden has-[.lr-more:checked]:[&_[data-more]]:table-row data-searching:[&_[data-more]]:table-row">
      <BranchSearch label="Search a hospital" placeholder="Search a hospital by name" />
      <div data-panel className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <table className={cn("w-full text-sm", CELLS)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(th, "text-left")}>Hospital</th>
              {r.years.map((y) => (
                <th key={y} scope="col" className={cn(th, "hidden text-right sm:table-cell")}>{y}</th>
              ))}
              <th scope="col" className={cn(th, "text-right")}>Residents</th>
            </tr>
          </thead>
          <tbody>
            {hospitals.map((h, i) => (
              <tr key={h.slug} data-name={`${h.hospital} ${h.state ?? ""}`.toLowerCase()} data-more={i >= FOLD || undefined} className="border-t border-border hover:bg-muted">
                <th scope="row" className="px-3 py-2.5 text-left font-normal break-words md:px-4">
                  <Link href={hospitalHref(h.slug)} className={textLink}>{h.hospital}</Link>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {courses
                      ? h.courses.map((c) => `${c.course} ${formatRank(c.n)}`).join(" · ")
                      : `${h.state ?? "—"} · ${h.courses.length} course${h.courses.length === 1 ? "" : "s"}`}
                  </span>
                </th>
                {h.byYear.map((k, j) => (
                  <td key={r.years[j]} className="hidden sm:table-cell">{n(k)}</td>
                ))}
                <td className="font-medium">{formatRank(h.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-none hidden className="border-t border-border px-4 py-6 text-sm text-muted-foreground">{none}</p>
      </div>
      {hospitals.length > FOLD && (
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-sm text-sm text-sky underline underline-offset-4 hover:no-underline has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring group-data-[searching]/lr:hidden">
          <input type="checkbox" className="lr-more sr-only" />
          <span className="group-has-[.lr-more:checked]/lr:hidden">Show all {hospitals.length} hospitals</span>
          <span className="hidden group-has-[.lr-more:checked]/lr:inline">Show the first {FOLD}</span>
        </label>
      )}
    </div>
  );
}
