"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ChevronDown, X } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { fmtDay, listDay } from "../../lib/format";
import { useLocal } from "../../lib/local-store";
import { LATEST_YEAR, PAST_YEARS, reachWindow } from "../../lib/reach";
import { useDecideLinks } from "../../lib/use-decide-store";
import { openQuotas, roundLabel, seatKindLabel, type Round, type SeatList, type Source } from "../../types";
import { Dash, HISTORY_CAPTION, Provisional, ReachBadge } from "../bits";
import { TermSources, TermsSummary } from "../fees";
import { reportedCount, SELF_REPORTED, TypeBadge, ValueSource } from "../institute/hospital-bits";
import { smallLink, tbl } from "../ui";
import type { PastClosing, SeatLine, SeatSort } from "./find-seats";

// The Seats page's matrix view (src/app/decide/seats): one row per institute, course, quota and seat category, its
// seats in each round's lists (never added together), its course's terms (TermsSummary: the course's own programme, and
// its own bond figure where the record prices bonds by subject), her label and every closing rank on the row's own quota
// and seat category. Display (columns shown) is saved on the device; a row opens its details with every source.

/** One round's seat columns: its clear and virtual vacancy lists, and its newly added list(s), shown as a badge. */
export type SeatGroup = { key: string; label: string; clear: SeatList | null; virtual: SeatList | null; added: SeatList[] };
/** Closing-rank columns: one group per year, newest first. */
export type ClosingYear = { year: number; rounds: Round[] };

const DISPLAY_KEY = "medpath.seatMatrix.hidden";
const NONE: unknown = [];
const rowKey = (r: SeatLine) => [r.college.key, r.degree, r.specialty, r.quota, r.category].join("|");
const courseOf = (r: SeatLine) => `${r.degree} ${r.course?.name ?? r.specialty}`;
const listName = (l: SeatList) => `${l.year} ${roundLabel[l.round]} ${seatKindLabel[l.kind].toLowerCase()}`;
const at = (r: SeatLine, year: number, round: Round) => r.closings.find((c) => c.year === year && c.round === round);

function ClosingValue({ c }: { c: PastClosing | undefined }) {
  if (!c) return <Dash />;
  return (
    <span className="grid justify-items-end gap-1">
      <span className="numeric whitespace-nowrap">
        {formatRank(c.closing)}
        <span className="text-xs font-normal text-muted-foreground"> ({formatRank(c.n)}<span className="sr-only"> allotted</span>)</span>
      </span>
      <Provisional when={c.provisional} />
    </span>
  );
}

/**
 * "+3 new" per newly added list that prints seats for the row (most are also in the clear vacancy list: never added).
 * A round with two newly added PDFs dates the badge (listDay), so the two can be told apart.
 */
function AddedBadges({ r, added }: { r: SeatLine; added: SeatList[] }) {
  return added.map((l) => {
    const day = added.length > 1 ? listDay(l) : undefined;
    return (r.byList[l.key] ?? 0) > 0 ? (
      <Badge key={l.key} tone="info" className="mt-1 whitespace-nowrap">
        {`+${formatRank(r.byList[l.key])} new${day ? ` (${fmtDay(day)})` : ""}`}
        <span className="sr-only"> in the {listName(l)} list, never added to the other lists</span>
      </Badge>
    ) : null;
  });
}

/** Column chooser: a checkbox per column (the institute always shows), saved in localStorage. Closes on Escape. */
/** A Beds cell: the count as the source prints it ("270+"), marked where the source prints conflicting figures. */
function Beds({ b }: { b: NonNullable<NonNullable<SeatLine["hospital"]>["beds"]> }) {
  const c = reportedCount(b);
  return (
    <span title={`As reported${b.kind ? `: ${b.kind}` : ""}. ${SELF_REPORTED}.`}>
      {c.text}
      {c.conflicting && <span className="block text-xs font-normal text-sun">conflicting</span>}
    </span>
  );
}

export function DisplayMenu({ cols, hidden, setHidden }: { cols: { key: string; label: string }[]; hidden: Set<string>; setHidden: (keys: string[]) => void }) {
  return (
    <details
      className="group relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-card px-3 text-sm whitespace-nowrap hover:border-foreground/70 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">Display</span>
        <span className="font-semibold">{cols.length - hidden.size} of {cols.length} columns</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* Phones: in flow under the button (absolute right-0 would open off-screen when the button sits on the left). */}
      <fieldset className="absolute right-0 z-20 mt-1 max-h-96 min-w-64 max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-border bg-card p-2 shadow-overlay max-sm:static">
        <legend className="sr-only">Columns shown</legend>
        {cols.map((c) => (
          <label key={c.key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
            <input
              type="checkbox"
              className="size-4 accent-sky"
              checked={!hidden.has(c.key)}
              onChange={(e) => setHidden(e.target.checked ? [...hidden].filter((k) => k !== c.key) : [...hidden, c.key])}
            />
            {c.label}
          </label>
        ))}
        <p className="px-2 pt-1 text-xs text-muted-foreground">Saved on this device. The institute column always shows.</p>
        <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setHidden([])}>Show every column</Button>
      </fieldset>
    </details>
  );
}

/**
 * The matrix. `groups`: seat columns per round (newest first); `years`: closing-rank columns; `results`: the MCC result
 * PDFs behind them; `ranked`: she has a rank (the "Your chances" column). Rows are one page, in the server's order.
 */
export function SeatMatrix({ rows, groups, years, results, ranked, sort, caption }: {
  rows: SeatLine[];
  groups: SeatGroup[];
  years: ClosingYear[];
  results: Source[];
  ranked: boolean;
  sort: SeatSort;
  caption: string;
}) {
  const L = useDecideLinks();
  const typed = rows.some((r) => r.hospital?.type);
  const cols = useMemo(
    () => [
      ...(typed ? [{ key: "type", label: "Type (inferred)" }] : []),
      { key: "course", label: "Course" },
      { key: "quota", label: "Quota" },
      { key: "category", label: "Category" },
      ...groups.map((g) => ({ key: g.key, label: `${g.label} seats` })),
      { key: "terms", label: "Fee, stipend, bond and leaving penalty" },
      { key: "beds", label: "Beds (as reported)" },
      ...(ranked ? [{ key: "chances", label: "Your chances" }] : []),
      ...years.map((y) => ({ key: `closing-${y.year}`, label: `Closing ranks ${y.year}` })),
    ],
    [typed, groups, ranked, years],
  );
  const [saved, save] = useLocal<unknown>(DISPLAY_KEY, NONE);
  const hidden = useMemo(() => {
    const r = z.array(z.string()).safeParse(saved);
    return new Set(r.success ? r.data.filter((k) => cols.some((c) => c.key === k)) : []);
  }, [saved, cols]);
  const [open, setOpen] = useState<string | null>(null);
  const row = rows.find((r) => rowKey(r) === open) ?? null;
  // The row last opened: closing the drawer puts focus on its Details button (there is no Dialog.Trigger).
  const opened = useRef<string | null>(null);
  const show = (k: string) => {
    opened.current = k;
    setOpen(k);
  };
  const refocus = () => [...document.querySelectorAll<HTMLElement>("#seat-matrix [data-row]")].find((b) => b.dataset.row === opened.current)?.focus();

  const th = cn(tbl.th, "px-3 align-bottom");
  const td = "px-3 py-2 align-top";
  const num = cn(td, "text-right tabular-nums whitespace-nowrap");
  const sticky = "sticky left-0 z-[1] w-40 min-w-40 border-r border-border bg-card md:w-64 md:min-w-64";
  const sorted = (s: SeatSort, dir: "ascending" | "descending") => (sort === s ? dir : undefined);
  const firstClear = groups[0]?.clear?.key;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Scroll sideways for every round. Select a row, or its Details button, for every number and its source.</p>
        <DisplayMenu cols={cols} hidden={hidden} setHidden={save} />
      </div>
      {/* Hiding is CSS on data-col, so a header group and its cells go together (keys are the known columns only). */}
      <style>{[...hidden].map((k) => `#seat-matrix [data-col="${k}"]{display:none}`).join("")}</style>
      <div id="seat-matrix" role="region" aria-label={caption} tabIndex={0} className={cn(tbl.wrap, "scroll-pl-44 md:scroll-pl-68")}>
        <table className={tbl.table}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className={tbl.headRow}>
              <th rowSpan={2} scope="col" className={cn(th, sticky)} aria-sort={sorted("college", "ascending")}>Institute</th>
              {typed && (
                <th rowSpan={2} scope="col" data-col="type" className={th} title="Inferred from name and quota (a few from Seatora's research on the hospital), not an official field">
                  Type<span className="block font-normal">inferred</span>
                </th>
              )}
              <th rowSpan={2} scope="col" data-col="course" className={cn(th, "min-w-40")}>Course</th>
              <th rowSpan={2} scope="col" data-col="quota" className={th}>Quota</th>
              <th rowSpan={2} scope="col" data-col="category" className={th}>Category</th>
              {groups.map((g) => (
                <th key={g.key} colSpan={2} scope="colgroup" data-col={g.key} className={cn(th, "border-l border-border text-center")}>{g.label} seats</th>
              ))}
              <th rowSpan={2} scope="col" data-col="terms" className={cn(th, "min-w-72")} aria-sort={sort === "fee" || sort === "bond" ? "ascending" : undefined}>Fee, stipend, bond and leaving penalty</th>
              <th rowSpan={2} scope="col" data-col="beds" className={cn(th, "text-right")} title={SELF_REPORTED}>
                Beds<span className="block font-normal">as reported</span>
              </th>
              {ranked && <th rowSpan={2} scope="col" data-col="chances" className={cn(th, "min-w-40")} aria-sort={sorted("reach", "ascending")}>Your chances</th>}
              {years.map((y) => (
                <th key={y.year} colSpan={y.rounds.length} scope="colgroup" data-col={`closing-${y.year}`} className={cn(th, "border-l border-border text-center")}>Closing rank {y.year}</th>
              ))}
            </tr>
            <tr className={tbl.headRow}>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <th scope="col" data-col={g.key} className={cn(th, "border-l border-border text-right")} aria-sort={g.clear?.key === firstClear ? sorted("seats", "descending") : undefined}><span className="sr-only">{g.label} </span>Clear</th>
                  <th scope="col" data-col={g.key} className={cn(th, "text-right")}><span className="sr-only">{g.label} </span>Virtual</th>
                </Fragment>
              ))}
              {years.map((y) =>
                y.rounds.map((rd, i) => (
                  <th key={`${y.year}-${rd}`} scope="col" data-col={`closing-${y.year}`} className={cn(th, "text-right whitespace-nowrap", i === 0 && "border-l border-border")}>
                    <span className="sr-only">{y.year} </span>{roundLabel[rd]}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = rowKey(r);
              // The row header names the institute already; the button adds what tells its rows apart.
              const name = `${courseOf(r)}, ${r.quota ?? "quota not printed"}, ${r.category} seats`;
              return (
                <tr
                  key={k}
                  className={cn(tbl.row, "cursor-pointer")}
                  onClick={(e) => {
                    if (!(e.target as Element).closest("a, button, summary, input")) show(k);
                  }}
                >
                  <th scope="row" className={cn(td, sticky, "text-left font-normal")}>
                    <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                    <span className="block text-xs text-muted-foreground">{r.college.state ?? "State not listed"}</span>
                    <Button type="button" variant="ghost" className="-ml-4 text-sky" data-row={k} onClick={() => show(k)} aria-haspopup="dialog">
                      Details<span className="sr-only">: {name}</span>
                    </Button>
                  </th>
                  {typed && <td data-col="type" className={td}>{r.hospital?.type ? <TypeBadge type={r.hospital.type} /> : <Dash />}</td>}
                  <td data-col="course" className={td}>{courseOf(r)}</td>
                  <td data-col="quota" className={td}>
                    {r.quota ?? "Not printed"}
                    {r.quota != null && !openQuotas.includes(r.quota) && <Badge tone="warning" className="mt-1">Restricted</Badge>}
                  </td>
                  <td data-col="category" className={cn(td, "whitespace-nowrap")}>{r.category}</td>
                  {groups.map((g) => (
                    <Fragment key={g.key}>
                      <td data-col={g.key} className={cn(num, "border-l border-border")}>
                        {g.clear && r.byList[g.clear.key] != null ? <span className="font-semibold">{formatRank(r.byList[g.clear.key])}</span> : <Dash />}
                        <AddedBadges r={r} added={g.added} />
                      </td>
                      <td data-col={g.key} className={num}>{g.virtual && r.byList[g.virtual.key] != null ? <span className="font-semibold">{formatRank(r.byList[g.virtual.key])}</span> : <Dash />}</td>
                    </Fragment>
                  ))}
                  <td data-col="terms" className={td}><TermsSummary t={r.fees} className="text-xs" /></td>
                  <td data-col="beds" className={num}>
                    {r.hospital?.beds ? <Beds b={r.hospital.beds} /> : <Dash />}
                  </td>
                  {ranked && (
                    <td data-col="chances" className={td}>
                      {r.reach ? <ReachBadge reach={r.reach} provisional={r.reachProvisional} on={r.category} /> : <span className="text-xs text-muted-foreground">{r.noLabel}</span>}
                    </td>
                  )}
                  {years.map((y) =>
                    y.rounds.map((rd, i) => (
                      <td key={`${y.year}-${rd}`} data-col={`closing-${y.year}`} className={cn(num, i === 0 && "border-l border-border")}>
                        <ClosingValue c={at(r, y.year, rd)} />
                      </td>
                    )),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RowDetails row={row} groups={groups} years={years} results={results} ranked={ranked} onClose={() => setOpen(null)} refocus={refocus} />
    </div>
  );
}

/** Every number of one row with its source: seats per list (PDF and date), closing ranks per round (result PDF), the course's terms and their documents. */
function RowDetails({ row: r, groups, years, results, ranked, onClose, refocus }: {
  row: SeatLine | null;
  groups: SeatGroup[];
  years: ClosingYear[];
  results: Source[];
  ranked: boolean;
  onClose: () => void;
  refocus: () => void;
}) {
  const L = useDecideLinks();
  const pdf = (year: number, round: Round) => results.find((s) => s.year === year && s.round === round);
  const lists = groups.flatMap((g) => [g.clear, g.virtual, ...g.added].filter((l): l is SeatList => !!l));
  const link = "underline hover:text-sky";
  return (
    <Dialog.Root open={!!r} onOpenChange={(o) => !o && onClose()}>
      {/* Portalled to .app: out of the page's isolated layer (so it covers the sticky header), still on the case-sheet tokens. Client-only (opens on a click). */}
      <Dialog.Portal container={typeof document === "undefined" ? undefined : document.querySelector<HTMLElement>(".app")}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            refocus();
          }}
          className="fixed inset-y-0 right-0 z-50 grid w-full max-w-xl content-start gap-6 overflow-y-auto border-l border-border bg-popover p-6 shadow-overlay"
        >
          {r && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-xl font-semibold">{r.college.name}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                    {courseOf(r)} · {r.quota ?? "quota not printed"}{r.quota != null && !openQuotas.includes(r.quota) && " (restricted quota)"} · {r.category} seats · {r.college.state ?? "state not listed"}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close"><X className="size-5" /></Button>
                </Dialog.Close>
              </div>

              <section aria-labelledby="row-seats" className="grid gap-2">
                <h3 id="row-seats" className="font-semibold">Seats in MCC&apos;s lists</h3>
                <p className="text-xs text-muted-foreground">Each list as its PDF printed it. The lists overlap (newly added seats are mostly also clear vacancies; a virtual vacancy opens only if its holder moves), so never add them.</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  {lists.map((l) => (
                    <div key={l.key} className="contents">
                      <dt>
                        {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer" className={link}>{listName(l)}<span className="sr-only"> PDF (opens in a new tab)</span></a> : listName(l)}
                        <span className="block text-xs text-muted-foreground">MCC notice dated {l.publishedAt ? fmtDay(l.publishedAt) : "—"}</span>
                      </dt>
                      <dd className="numeric text-right font-semibold">{r.byList[l.key] != null ? formatRank(r.byList[l.key]) : <Dash />}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="row-closing" className="grid gap-2">
                <h3 id="row-closing" className="font-semibold">Closing ranks on {r.quota ?? "this quota"}, {r.category} seats</h3>
                <p className="text-xs text-muted-foreground">The highest All India Rank MCC allotted in that round; allotments made in brackets (not seats). Each round links its MCC result PDF.</p>
                <div className="overflow-x-auto">
                  <table className="text-sm">
                    <caption className="sr-only">Closing rank and allotments by year and round: {r.college.name}, {courseOf(r)}</caption>
                    <tbody>
                      {years.map((y) => (
                        <tr key={y.year} className="border-t border-border">
                          <th scope="row" className="numeric py-1 pr-3 text-left align-top font-semibold">{y.year}</th>
                          <td className="py-1">
                            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                              {y.rounds.map((rd) => {
                                const c = at(r, y.year, rd);
                                const s = pdf(y.year, rd);
                                return (
                                  <li key={rd} className="numeric">
                                    <span className="text-muted-foreground">{s?.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.name} className={link}>{roundLabel[rd]}<span className="sr-only">: {s.name}, PDF (opens in a new tab)</span></a> : roundLabel[rd]}: </span>
                                    {c ? <>{formatRank(c.closing)} ({formatRank(c.n)}<span className="sr-only"> allotted</span>)</> : <Dash />}
                                    {c?.provisional && <> <Provisional when /></>}
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {ranked && (
                <section aria-labelledby="row-chances" className="grid gap-2">
                  <h3 id="row-chances" className="font-semibold">Your chances</h3>
                  {r.reach ? <ReachBadge reach={r.reach} provisional={r.reachProvisional} on={r.category} /> : <p className="text-sm">{r.noLabel}.</p>}
                  <p className="text-xs text-muted-foreground">Options&apos; label on this one seat category, counting {reachWindow(LATEST_YEAR, PAST_YEARS)} (every round). {HISTORY_CAPTION}</p>
                </section>
              )}

              <section aria-labelledby="row-terms" className="grid gap-2">
                <h3 id="row-terms" className="font-semibold">Fee, stipend, bond and leaving penalty</h3>
                <TermsSummary t={r.fees} programme />
                <p className="text-xs text-muted-foreground">Year by year, with each figure&apos;s source and the bond&apos;s exact words: the institute&apos;s Fees &amp; bond tab.</p>
                <TermSources t={r.fees} />
              </section>

              <section aria-labelledby="row-hospital" className="grid gap-2">
                <h3 id="row-hospital" className="font-semibold">The institute</h3>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">Hospital beds, as reported</dt>
                    <dd className="grid gap-1">
                      {r.hospital?.beds ? (
                        <>
                          <span><span className="numeric font-semibold">{reportedCount(r.hospital.beds).text}</span>{r.hospital.beds.kind && <span className="text-muted-foreground"> · {r.hospital.beds.kind}</span>}</span>
                          {r.hospital.beds.meta?.period && <span className="text-xs text-muted-foreground">Period: {r.hospital.beds.meta.period}</span>}
                          <ValueSource m={r.hospital.beds.meta} />
                          <span className="text-xs text-muted-foreground">{SELF_REPORTED}.</span>
                        </>
                      ) : (
                        <span><Dash /> <span className="text-xs text-muted-foreground">Seatora has not found a bed count this hospital published.</span></span>
                      )}
                    </dd>
                  </div>
                  {r.hospital?.type && (
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Type</dt>
                      <dd><TypeBadge type={r.hospital.type} note /></dd>
                    </div>
                  )}
                </dl>
              </section>

              <nav aria-label="More on this option" className="flex flex-wrap gap-x-4">
                <Link href={L.institute(r.college.slug)} className={cn(smallLink, "text-sky")}>Institute page</Link>
                {r.course && <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className={cn(smallLink, "text-sky")}>Last ranks</Link>}
                <Link href={L.institute(r.college.slug, "fees")} className={cn(smallLink, "text-sky")}>Fees & bond</Link>
                <Link href={L.institute(r.college.slug, "clinical")} className={cn(smallLink, "text-sky")}>Hospital facts</Link>
              </nav>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
