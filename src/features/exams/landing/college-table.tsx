"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { formatRank } from "@/features/cutoffs/lib/format";

/** One institute (/neet-pg/stipend-bond): name, its college page's slug, state, course type, year 1's stipend, its bond. */
export type CollegeRow = [name: string, slug: string, state: string, programme: string, stipend: string, bond: string];

const th = "px-3 py-3 font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4";

/**
 * Every institute's stipend and bond, searchable by college or state. ~2,000 rows travel as compact tuples and only the
 * first `fold` (or the matches) render: the page stays small (the server-rendered table was ~3 MB).
 */
export function CollegeTable({ rows, fold }: { rows: CollegeRow[]; fold: number }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const words = useDeferredValue(q).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? rows.filter(([name, , state]) => words.every((w) => `${name} ${state}`.toLowerCase().includes(w))) : rows;
  const shown = all || words.length ? hits : hits.slice(0, fold);
  return (
    <div className="mt-6">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        aria-label="Search a college or state"
        placeholder="Search a college or state"
        className="h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus:border-sky focus-visible:ring-2 focus-visible:ring-ring sm:w-xs sm:text-sm"
      />
      <p role="status" className="sr-only">{words.length ? `${formatRank(hits.length)} matching` : ""}</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-right [&_td]:align-top md:[&_td]:px-4">
          <caption className="sr-only">NEET PG stipend and bond by college</caption>
          <thead>
            <tr>
              <th scope="col" className={`${th} text-left`}>College</th>
              <th scope="col" className={`${th} text-right`}>Stipend, year 1</th>
              <th scope="col" className={`${th} text-right`}>Bond</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(([name, slug, state, programme, stipend, bond]) => (
              <tr key={slug} className="border-t border-border">
                <th scope="row" className="px-3 py-2.5 text-left font-normal break-words md:px-4">
                  <Link href={`/neet-pg/colleges/${slug}`} className="underline decoration-foreground/25 underline-offset-4 hover:text-sky">{name}</Link>
                  <span className="block text-xs text-muted-foreground">{state} · {programme}</span>
                </th>
                <td className="numeric">{stipend}</td>
                <td>{bond}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hits.length && <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground">No college matches.</p>}
      </div>
      {!words.length && rows.length > fold && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm text-sky underline underline-offset-4 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">
          {all ? `Show the first ${fold}` : `Show all ${formatRank(rows.length)} institutes`}
        </button>
      )}
    </div>
  );
}
