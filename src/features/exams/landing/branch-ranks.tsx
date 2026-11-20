// NEET PG's latest round with a result, last rank by branch (the home page, right after the hero, and /neet-pg): one
// table per open quota and one of the restricted quotas, all server-rendered. Tabs, the phone's second column and the
// PwD switch are form controls read by CSS (:has), the row fold a checkbox; only the search and the sort are client JS
// (branch-search.tsx: the sort reorders the rows from their data-*, sortData). Decide Home shows the same tables
// (BranchTables) in the app's look, and with her rank, her rank against each branch.
import "server-only";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { formatRank } from "@/features/cutoffs/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { roundName } from "@/features/decide/lib/round-status";
import type { BaseCategory, Category } from "@/features/decide/types";
import { cn } from "@/lib/cn";
import { BranchSearch, BranchSort } from "./branch-search";
import { branchRanks, vsRank, type BranchRow } from "./data";

/** Rows shown before "Show all N" (Decide Home: 10): the page stays short; a search shows every match. */
const FOLD = 25;
type Tab = "aiq" | "deemed" | "dnb" | "restricted";
// Whole class names, so Tailwind sees them: the panel and the controls the checked tab (#lr-t-…) shows or hides.
const panelOn: Record<Tab, string> = {
  aiq: "group-has-[#lr-t-aiq:checked]/lr:block",
  deemed: "group-has-[#lr-t-deemed:checked]/lr:block",
  dnb: "group-has-[#lr-t-dnb:checked]/lr:block",
  restricted: "group-has-[#lr-t-restricted:checked]/lr:block",
};
const hiddenOn: Record<Tab, string> = {
  aiq: "group-has-[#lr-t-aiq:checked]/lr:hidden",
  deemed: "group-has-[#lr-t-deemed:checked]/lr:hidden",
  dnb: "group-has-[#lr-t-dnb:checked]/lr:hidden",
  restricted: "group-has-[#lr-t-restricted:checked]/lr:hidden",
};
const phoneCats = ["OBC", "EWS", "SC", "ST"] as const;
// The other controls, as rules on the section (a few classes, not a few per cell: the page's HTML stays small). The PwD
// switch swaps each cell's value ([data-base] / [data-pwd]); a phone shows Open and the one category ([data-c]) picked
// beside it, md and up every category; a search shows the folded rows ([data-more]).
const SWITCHES = [
  "[&_[data-pwd]]:hidden has-[#lr-pwd:checked]:[&_[data-pwd]]:inline has-[#lr-pwd:checked]:[&_[data-base]]:hidden",
  "max-md:[&_[data-c]]:hidden",
  "max-md:has-[#lr-c-OBC:checked]:[&_[data-c=OBC]]:table-cell max-md:has-[#lr-c-EWS:checked]:[&_[data-c=EWS]]:table-cell",
  "max-md:has-[#lr-c-SC:checked]:[&_[data-c=SC]]:table-cell max-md:has-[#lr-c-ST:checked]:[&_[data-c=ST]]:table-cell",
  "data-searching:[&_[data-more]]:table-row",
].join(" ");
/** A panel's rows past FOLD, until its "Show all" box is ticked. */
const FOLDED = "[&_[data-more]]:hidden has-[.lr-more:checked]:[&_[data-more]]:table-row";
/** A tab's name on phones (the rest from sm up), so the four fit one line. */
export const shortTab: Partial<Record<Tab, string>> = { deemed: "Deemed", restricted: "Restricted" };

const th = "px-3 py-3 font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4";
const td = "numeric px-3 py-2.5 text-right whitespace-nowrap md:px-4";
/** A branch table's number cells and dashes, styled from the table (one class list, not one per cell: ~1,300 cells). */
const CELLS = "[&_td]:numeric [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-right [&_td]:whitespace-nowrap md:[&_td]:px-4 [&_[data-na]]:text-muted-foreground";
const chip = "inline-flex min-h-11 cursor-pointer items-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
const rank = (k: number | undefined) => (k == null ? <span data-na="">—</span> : formatRank(k));
const viaSignup = (next: string) => `/signup?${new URLSearchParams({ next })}`;
const lastRanks = (slug: string, quota: string) => viaSignup(decideLinks("").lastRanks(slug, { quota }));
const L = "underline decoration-foreground/25 underline-offset-4 hover:text-sky";
/** A row's values for the sort (branch-search.tsx ordered): `data-i`, its place in the server's order. */
const sortData = (r: BranchRow, i: number, keys: Partial<Record<string, number>>) =>
  Object.fromEntries(Object.entries({ i, n: r.n, ...keys }).map(([k, v]) => [`data-${k}`, v]));

export async function BranchRanks() {
  const d = await branchRanks();
  if (!d) return null;
  const later = d.round !== "R1";
  const round = roundName[d.round];

  return (
    <section aria-labelledby="lr-h" className="border-b border-border">
      <Container className="pt-8 pb-16 md:pt-12 md:pb-24">
        <p className="font-mono text-xs uppercase tracking-widest text-sky">Latest MCC result</p>
        <h2 id="lr-h" className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
          NEET PG {d.year} {round}: last rank by branch
          {d.provisional && <Badge tone="warning" className="ml-3 align-middle">Provisional</Badge>}
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          The highest All India Rank given a seat in {round}, per seat category
          {later ? `. ${round} counts only new allotments (Fresh Allotted and Upgraded): seats kept from an earlier round don't count` : ""}. History, not a
          prediction.
        </p>
        <p className="mt-2">
          <SourceLabel provenance={{ sourceName: d.source.name, sourceUrl: d.source.url, sourceType: "OFFICIAL", academicYear: d.year }} />
        </p>

        <BranchTables d={d} href={lastRanks} className="mt-8" />

        <ul className="mt-6 grid max-w-prose gap-1.5 text-sm leading-relaxed text-muted-foreground">
          <li>NRI, AFMS, university and minority quotas are shown separately, under Restricted quotas: they never mix into the All India, Deemed or DNB numbers.</li>
          {!d.restricted.some((r) => /sponsor/i.test(r.quota)) && (
            <li>MCC&apos;s NEET PG counselling has no sponsored seats; in-service and sponsored seats are filled in state counselling, which Seatora doesn&apos;t cover.</li>
          )}
        </ul>
      </Container>
    </section>
  );
}

/** Her rank, category and the quotas she ticked (Decide Home's profile), for BranchTables' rows against her rank. */
export type Me = { rank: number; category: BaseCategory; pwd: boolean; quotas: string[] };
type Data = NonNullable<Awaited<ReturnType<typeof branchRanks>>>;
const appTh = "px-3 py-3 text-xs font-semibold text-muted-foreground md:px-4";

/** The tabs shown, each with its rows: the open quotas', then the restricted quotas' (with `me`, only the ones she ticked). */
export const tabsOf = (d: Data, me?: Me) =>
  [
    ...d.tabs.map((t) => ({ key: t.key as Tab, label: t.label as string, rows: t.rows as BranchRow[] })),
    { key: "restricted" as Tab, label: "Restricted quotas", rows: me ? d.restricted.filter((r) => me.quotas.includes(r.quota)) : d.restricted },
  ].filter((t) => t.rows.length > 0);

/**
 * The search, the quota tabs and a table per tab, linking each branch to `href`. Without `me`: each seat category's
 * last rank (a phone shows Open and one picked category beside it; the PwD switch). With `me` (Decide Home with her
 * rank): her category's and Open's last rank, whether the branch reached her rank (vsRank: reached first) and its seats.
 * `app`: Decide's look (no monospace caps) and 10 rows before "Show all".
 */
export function BranchTables({ d, href, me, app = false, className }: { d: Data; href: (slug: string, quota: string) => string; me?: Me; app?: boolean; className?: string }) {
  const later = d.round !== "R1";
  const round = roundName[d.round];
  const tabs = tabsOf(d, me);
  const first = tabs[0]?.key;
  const fold = app ? 10 : FOLD;
  const hc = app ? appTh : th;
  // The phone's category picker and the PwD switch, hidden on a tab where they change nothing.
  const noCats = [...d.tabs.filter((t) => t.cats.length < 2).map((t) => t.key), "restricted"] as Tab[];
  const noPwd = [...d.tabs.filter((t) => !t.pwd).map((t) => t.key), "restricted"] as Tab[];
  const seats = (n: number) => `${formatRank(n)} ${later ? "new " : ""}seat${n === 1 ? "" : "s"}`;
  const mine = me && ((me.pwd ? `${me.category} PwD` : me.category) as Category);

  return (
    <div data-lr className={cn("group/lr", SWITCHES, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <BranchSearch />
          {/* The first option is the server's order (most competitive first; with her rank, closest to it first). */}
          <BranchSort fold={fold} store={app ? "seatora.lr-sort.app" : "seatora.lr-sort"}>
            {me && <option value="">Closest to my rank</option>}
            <option value={me ? "open" : ""}>Most competitive first</option>
            <option value="open-desc">Least competitive first</option>
            {!me ? (
              <optgroup label="By category">
                {phoneCats.map((c) => <option key={c} value={c.toLowerCase()}>{c} last rank</option>)}
              </optgroup>
            ) : (
              mine !== "Open" && <option value="mine">{mine} last rank</option>
            )}
            <option value="n-desc">Most seats</option>
            <option value="name">Branch A–Z</option>
          </BranchSort>
        </div>
        {!me && (
          <div className="flex flex-wrap items-center gap-x-5 text-sm">
            <fieldset className={cn("flex items-center gap-1 md:hidden", noCats.map((k) => hiddenOn[k]).join(" "))}>
              <legend className="sr-only">Category shown beside Open</legend>
              <span aria-hidden className="mr-1 text-muted-foreground">Beside Open</span>
              {phoneCats.map((c) => (
                <label key={c} className={cn(chip, "min-w-11 justify-center rounded-md px-2 text-muted-foreground has-[:checked]:bg-raised has-[:checked]:text-foreground")}>
                  <input type="radio" name="lr-cat" id={`lr-c-${c}`} defaultChecked={c === "OBC"} className="sr-only" />
                  {c}
                </label>
              ))}
            </fieldset>
            <label className={cn(chip, "gap-2 rounded-md", noPwd.map((k) => hiddenOn[k]).join(" "))}>
              <input type="checkbox" id="lr-pwd" className="size-4 accent-sky" />
              PwD seats
            </label>
          </div>
        )}
      </div>

      <fieldset className="mt-6 flex gap-6 overflow-x-auto border-b border-border">
        <legend className="sr-only">Quota</legend>
        {tabs.map((t) => (
          <label key={t.key} className={cn(chip, "shrink-0 gap-1.5 border-b-2 border-transparent text-sm whitespace-nowrap text-muted-foreground hover:text-foreground has-[:checked]:border-foreground has-[:checked]:text-foreground")}>
            <input type="radio" name="lr-tab" id={`lr-t-${t.key}`} defaultChecked={t.key === first} className="sr-only" />
            <span>{shortTab[t.key] ? <>{shortTab[t.key]}<span className="hidden sm:inline">{t.label.slice(shortTab[t.key]!.length)}</span></> : t.label}</span>
            <span className="numeric text-xs text-muted-foreground">{t.rows.length}</span>
          </label>
        ))}
      </fieldset>

      {me && mine && tabs.map((t) => {
        const rows = vsRank(t.rows, me.rank, me.category, me.pwd);
        // Her category's column, then Open's (once when hers is Open); a tab without one of them (Deemed: Open only) leaves it out.
        const cols = [...new Set<Category>([mine, "Open"])].filter((c) => t.rows.some((r) => r.last[c] != null));
        const restricted = t.key === "restricted";
        return (
          <Panel key={t.key} tab={t.key} n={rows.length} what={restricted ? "rows" : "branches"} fold={fold}>
            <table className={cn("w-full text-sm", CELLS)}>
              <caption className="sr-only">{`${t.label}: last rank by branch against your rank, NEET PG ${d.year} ${round}`}</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(hc, "text-left")}>Branch</th>
                  {cols.map((c) => (
                    <th key={c} scope="col" className={cn(hc, "text-right")}>{c}<span className="max-md:sr-only"> last rank</span></th>
                  ))}
                  <th scope="col" className={cn(hc, "hidden text-right md:table-cell")}>Vs your rank</th>
                  <th scope="col" className={cn(hc, "hidden text-right md:table-cell")}>{later ? "New seats" : "Seats"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  // The seat category that decided it, when no column shows it (a PwD's Open PwD seats).
                  const via = r.best && !cols.includes(r.best.cat) ? ` (${r.best.cat})` : "";
                  const mark = !r.best ? (
                    <span className="text-muted-foreground">No allotment on your seats</span>
                  ) : r.reached ? (
                    <span className="font-semibold text-sky">Reached your rank{via}</span>
                  ) : (
                    <span className="text-muted-foreground">Closed {formatRank(me.rank - r.best.last)} before you{via}</span>
                  );
                  return (
                    <tr key={`${r.quota}|${r.slug}`} data-name={(restricted ? `${r.course} ${r.quota}` : r.course).toLowerCase()} data-more={i >= fold || undefined} {...sortData(r, i, { open: r.last.Open, mine: mine === "Open" ? undefined : r.last[mine] })} className="border-t border-border hover:bg-muted">
                      <th scope="row" className="px-3 py-2.5 text-left font-normal break-words md:px-4">
                        <Link href={href(r.slug, r.quota)} className={L}>{r.course}</Link>
                        {restricted && <span className="block text-xs text-muted-foreground">{r.quota}</span>}
                        <span className="block text-xs md:hidden">{mark}<span className="numeric text-muted-foreground"> · {seats(r.n)}</span></span>
                      </th>
                      {cols.map((c) => <td key={c}>{rank(r.last[c])}</td>)}
                      <td className="hidden md:table-cell">{mark}</td>
                      <td className="hidden text-muted-foreground md:table-cell">{formatRank(r.n)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        );
      })}

      {!me && d.tabs.map((t) => (
        <Panel key={t.key} tab={t.key} n={t.rows.length} what="branches" fold={fold}>
          <table className={cn("w-full text-sm", CELLS)}>
            <caption className="sr-only">{`${t.label}: last rank by branch, NEET PG ${d.year} ${round}`}</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(hc, "text-left")}>Branch</th>
                {t.cats.map((c) => (
                  <th key={c} scope="col" data-c={c === "Open" ? undefined : c} className={cn(hc, "text-right")}>
                    <span data-base>{c}</span>
                    <span data-pwd>{c} PwD</span>
                  </th>
                ))}
                <th scope="col" className={cn(hc, "hidden text-right md:table-cell")}>{later ? "New seats" : "Seats"}</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={r.slug} data-name={r.course.toLowerCase()} data-more={i >= fold || undefined} {...sortData(r, i, { open: r.last.Open, ...Object.fromEntries(phoneCats.map((c) => [c.toLowerCase(), r.last[c]])) })} className="border-t border-border hover:bg-muted">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal break-words md:px-4">
                    <Link href={href(r.slug, r.quota)} className={L}>{r.course}</Link>
                    <span className="numeric block text-xs text-muted-foreground md:hidden">{seats(r.n)}</span>
                  </th>
                  {t.cats.map((c) => (
                    <td key={c} data-c={c === "Open" ? undefined : c}>
                      <span data-base>{rank(r.last[c])}</span>
                      <span data-pwd>{rank(r.last[`${c} PwD`])}</span>
                    </td>
                  ))}
                  <td className="hidden text-muted-foreground md:table-cell">{formatRank(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      {!me && d.restricted.length > 0 && (
        <Panel tab="restricted" n={d.restricted.length} what="rows" fold={fold}>
          <p className="border-b border-border px-3 py-3 text-sm leading-relaxed text-muted-foreground md:px-4">
            Only for candidates eligible for that quota. The last rank on any of its seats.
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">{`Restricted quotas: last rank by branch, NEET PG ${d.year} ${round}`}</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(hc, "hidden text-left md:table-cell")}>Quota</th>
                <th scope="col" className={cn(hc, "text-left")}>Branch</th>
                <th scope="col" className={cn(hc, "text-right")}>Last rank</th>
              </tr>
            </thead>
            <tbody>
              {d.restricted.map((r, i) => (
                <tr key={`${r.quota}|${r.slug}`} data-name={`${r.course} ${r.quota}`.toLowerCase()} data-more={i >= fold || undefined} {...sortData(r, i, { last: r.max })} className="border-t border-border hover:bg-muted">
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{r.quota}</td>
                  <th scope="row" className="px-3 py-2.5 text-left font-normal break-words md:px-4">
                    <Link href={href(r.slug, r.quota)} className={L}>{r.course}</Link>
                    <span className="block text-xs text-muted-foreground md:hidden">{r.quota}</span>
                  </th>
                  <td className={td}>{formatRank(r.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

/** One tab's table in its card, a line when the search matches none of it, and its fold. */
function Panel({ tab, n, what, fold, children }: { tab: Tab; n: number; what: string; fold: number; children: React.ReactNode }) {
  return (
    <div data-panel={tab} className={cn("group/p mt-4 hidden", FOLDED, panelOn[tab])}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {children}
        <p data-none hidden className="border-t border-border px-4 py-6 text-sm text-muted-foreground">No branch in this tab matches. Try another tab.</p>
      </div>
      {n > fold && (
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-sm text-sm text-sky underline underline-offset-4 hover:no-underline has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring group-data-[searching]/lr:hidden">
          <input type="checkbox" className="lr-more sr-only" />
          <span className="group-has-[.lr-more:checked]/p:hidden">Show all {n} {what}</span>
          <span className="hidden group-has-[.lr-more:checked]/p:inline">Show the first {fold}</span>
        </label>
      )}
    </div>
  );
}
