"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Download, GripVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { duplicateList, markTypedUpTo, move, shareText, termsWords, toCsv, toMccText, typedPrefix, updateActive, type ChoiceItem } from "../lib/choices";
import { PAST_YEARS, reachWindow, seatsBelowNotes, type Latest, type Reach, type SeatsBelow } from "../lib/reach";
import { statKeys, statLabel } from "../lib/stat-format";
import { useChoices, useDecideLinks } from "../lib/use-decide-store";
import { keepProfileParams } from "../profile";
import type { ProgrammeTerms } from "../server/terms";
import type { RowHospital, SeatsBy } from "../service";
import { roundLabel, type SeatList } from "../types";
import { Dash, InstName, ReachBadge } from "./bits";
import { InfoTip } from "./info-tip";
import { CompareToggle } from "./option-actions";
import { SeatsLink } from "./options-view";
import { Beds } from "./pages/beds";
import { ResultCard } from "./result-card";
import { TermStatCells } from "./stat-cells";
import { TypeBadge } from "./type-badge";
import { Skeleton } from "./skeleton";
import { control, EmptyState, smallLink, tbl } from "./ui";
import { ViewToggle, type View } from "./view-toggle";
import { ScrollTable } from "./scroll-table";

/** `reach` null: no rank in the address (terms and hospital only; the stored label stays). */
type Live = Record<string, { reach: Reach | null; provisional: boolean; seats: SeatsBy; below: SeatsBelow[]; fees: ProgrammeTerms; hospital: RowHospital }>;

// Memoised: a reorder re-renders every row, but each one's terms, type and beds (their (i) tips and source refs, the
// bulk of a long list) only change when the live data does.
const StatCellsM = memo(TermStatCells);
const TypeBadgeM = memo(TypeBadge);
const BedsM = memo(Beds);

/**
 * Reach labels and seats per list (`lists`: the newest round's clear, virtual, new) from the current data for these ids
 * and profile params (a server action); with no rank only the terms and hospital. null when unavailable.
 */
type ReachFor = (ids: string[], profile: string) => Promise<{ lists: SeatList[]; options: Live } | null>;

/** `view`: Cards or table on show (chosenView "choices"). Only that one is rendered: its controls carry the ids focus moves to. */
/** `maxLists`: the plan's saved lists (features/plans); at it, "Duplicate" gives way to a Season Pass link. Unset: no cap (signed out). */
/** `hasLists`: the server has the newest round's seat lists, so a card keeps room for its seats line while it loads. */
/** `nextRound`: the choice filling she fills next (MCC's schedule): its list name ("Round 3 · 2026") and dates. */
/** `latest`: the round the reach labels name (lib/reach.ts latestRound). */
export function ChoicesView({ reachFor, view, maxLists = Infinity, hasLists, nextRound, latest }: { reachFor?: ReachFor; view: View; maxLists?: number; hasLists?: boolean; nextRound?: { name: string; when: string } | null; latest: Latest }) {
  // Its first list takes the round's name on every Decide page (RenamedSaved, lib/choices.ts nameFirstList).
  const [state, setState, hydrated] = useChoices();
  const L = useDecideLinks();
  const sp = useSearchParams();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const [announce, setAnnounce] = useState("");
  const [picked, setPicked] = useState<{ index: number; origin: number } | null>(null);
  // Undo belongs to the list the item was removed from, whichever list is open when she presses it.
  const [removed, setRemoved] = useState<{ listId: string; listName: string; item: ChoiceItem; index: number } | null>(null);
  const [copyMsg, setCopyMsg] = useState<{ text: string; lines?: string[] } | null>(null);
  const dragFrom = useRef<number | null>(null);

  const items = list.items;
  const n = items.length;
  const prefix = typedPrefix(list);
  const missingTyped = list.typedIds.filter((id) => !items.some((i) => i.id === id)).length;
  const name = (i: ChoiceItem) => `${i.institute}, ${i.course}`;
  const setItems = (next: ChoiceItem[]) => setState((s) => updateActive(s, (l) => ({ ...l, items: next })));

  // Relabel from the current data and her rank and category in the URL; the stored labels are the fallback. With no
  // rank the terms and hospital still come (they don't depend on it).
  const url = new URLSearchParams(sp.toString());
  const who = new URLSearchParams([...keepProfileParams(url)].filter(([k]) => k === "rank" || k === "cat" || k === "pwd")).toString();
  const ranked = new URLSearchParams(who).has("rank");
  const liveKey = n ? JSON.stringify([who, items.map((i) => i.id).sort()]) : "";
  // Labels gathered for this rank and category (kept across edits, so nothing flickers); `fresh` = the last answer
  // covered exactly these ids, so a missing id really is missing from the data.
  const [live, setLive] = useState<{ who: string; key: string; data: Live; lists: SeatList[] } | null>(null);
  // The last key the server had no answer for (no data, no access): its rows say "—", not "Loading".
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!hydrated || !reachFor || !liveKey) return;
    let stale = false;
    const [qs, ids] = JSON.parse(liveKey) as [string, string[]];
    const fail = () => !stale && setFailed(liveKey); // no data: keep the stored labels
    reachFor(ids, qs).then((r) => {
      if (stale) return;
      if (!r) return fail();
      setLive((prev) => ({ who: qs, key: liveKey, lists: r.lists, data: { ...(prev?.who === qs ? prev.data : {}), ...r.options } }));
    }, fail);
    return () => {
      stale = true;
    };
  }, [hydrated, reachFor, liveKey]);
  const current = live?.who === who ? live.data : null;
  const lists = (current && live?.lists) || [];
  const round = lists[0] && `${lists[0].year} ${roundLabel[lists[0].round]}`;
  const fresh = live?.key === liveKey;

  /** Focus a control of the item with this id after React re-renders, and keep it in view (it may have moved). */
  const focusItem = (id: string | undefined, which: "handle" | "up" | "down" | "pos" = "handle") =>
    requestAnimationFrame(() => {
      const el = id ? document.getElementById(`${which}-${id}`) : null;
      const handle = id ? document.getElementById(`handle-${id}`) : null;
      const target = el && !(el as HTMLButtonElement).disabled ? el : handle ?? document.getElementById("choices-list") ?? document.getElementById("choices-undo") ?? document.getElementById("choices-h");
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
    });
  const reorder = (from: number, to: number) => {
    const target = Math.max(0, Math.min(n - 1, to));
    setItems(move(items, from, target));
    return target;
  };

  const onHandleKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (picked) {
        setAnnounce(`Dropped ${name(items[index])} at position ${index + 1} of ${n}.`);
        setPicked(null);
      } else {
        setPicked({ index, origin: index });
        setAnnounce(`Picked up ${name(items[index])}, position ${index + 1} of ${n}. Use up and down arrows to move, Space to drop, Escape to cancel.`);
      }
    } else if (picked && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = reorder(index, index + (e.key === "ArrowUp" ? -1 : 1));
      setPicked({ ...picked, index: to });
      focusItem(items[index].id);
      setAnnounce(`${name(items[index])}, position ${to + 1} of ${n}.`);
    } else if (picked && e.key === "Escape") {
      e.preventDefault();
      reorder(index, picked.origin);
      focusItem(items[index].id);
      setAnnounce(`Move cancelled. ${name(items[index])} back at position ${picked.origin + 1}.`);
      setPicked(null);
    }
  };

  /** "Move to #": straight to a position (the cards' field, the table's position select). */
  const moveTo = (i: number, pos: number, which: "handle" | "pos" = "handle") => {
    const t = reorder(i, pos - 1);
    focusItem(items[i].id, which);
    setAnnounce(`${name(items[i])} moved to position ${t + 1} of ${n}.`);
  };
  const moveBy = (i: number, delta: -1 | 1) => {
    const to = reorder(i, i + delta);
    focusItem(items[i].id, delta < 0 ? "up" : "down");
    setAnnounce(`${name(items[i])} moved to position ${to + 1} of ${n}.`);
  };

  const remove = (index: number) => {
    const item = items[index];
    setRemoved({ listId: list.id, listName: list.name, item, index });
    setItems(items.filter((_, i) => i !== index));
    // Focus the item that took its place, else the one before, else Undo (the list is gone).
    focusItem((items[index + 1] ?? items[index - 1])?.id);
    setAnnounce(`Removed ${name(item)} from ${list.name}. Undo is available.`);
  };
  const undo = () => {
    if (!removed) return;
    const { listId, listName, item, index } = removed;
    setState((s) => ({
      activeId: s.lists.some((l) => l.id === listId) ? listId : s.activeId,
      lists: s.lists.map((l) =>
        l.id === listId && !l.items.some((i) => i.id === item.id) ? { ...l, items: [...l.items.slice(0, index), item, ...l.items.slice(index)] } : l,
      ),
    }));
    focusItem(item.id);
    setAnnounce(`Restored ${name(item)} to ${listName} at position ${index + 1}.`);
    setRemoved(null);
  };

  const copy = async () => {
    const text = toMccText(list);
    try {
      await navigator.clipboard.writeText(text);
      // What went to the clipboard, at a glance: the first three lines and how many more.
      const lines = text.split("\n");
      setCopyMsg({ text: `Copied ${n} ${n === 1 ? "choice" : "choices"} in MCC order:`, lines: [...lines.slice(0, 3), ...(lines.length > 3 ? [`and ${lines.length - 3} more`] : [])] });
    } catch {
      setCopyMsg({ text: "Couldn't copy. Use CSV or Print instead." });
    }
    setTimeout(() => setCopyMsg(null), 8000);
  };

  // A phone: its share sheet (WhatsApp among them); else WhatsApp's own link. Fee, bond and penalties once loaded.
  const share = async () => {
    const text = shareText(list, (id) => (current?.[id] ? termsWords(current[id].fees) || null : null), location.origin);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        return await navigator.share({ text });
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // she closed the sheet
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const dupKey = (i: ChoiceItem) => `${i.slug}|${i.course}`;
  const counts = items.reduce((m, i) => m.set(dupKey(i), (m.get(dupKey(i)) ?? 0) + 1), new Map<string, number>());

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(list)], { type: "text/csv" }));
    a.download = `${list.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
  };

  // A screen tall, so what follows the list stays off-screen until the list is in (no jump when it renders).
  if (!hydrated) return <Skeleton className="mt-6 h-[100dvh] rounded-xl" />;
  // Terms and seats still on their way: their room is kept (a placeholder each), so the cards don't grow when they come.
  const loading = !!reachFor && !fresh && failed !== liveKey;

  /** One choice's state: typed, its live label, seats and terms (`lr`), and the warnings shown in view. */
  const rowOf = (item: ChoiceItem, i: number) => {
    const typed = list.typedIds.includes(item.id);
    const lr = current?.[item.id];
    const closed = lr?.reach ? lr.reach === "closed-before" : item.closedEveryRound;
    const flags = [
      (counts.get(dupKey(item)) ?? 0) > 1 && "Same institute and course listed more than once",
      closed && `Closed before your rank in every round of ${reachWindow(latest, PAST_YEARS)}${lr?.reach ? "" : " (when added)"}`,
      // Seats are matched to the option by institute and course; say what was found, not what MCC printed.
      lr && lists.length > 0 && lists.every((l) => lr.seats[l.kind] == null) && `No seats found for this option in the ${round} seat lists (this quota, your seat categories). Search Seats for the institute before you drop it.`,
      ...seatsBelowNotes(lr?.below ?? [], latest, PAST_YEARS),
      fresh && !lr && "Not found in the current MCC data; it may have been renamed. Check it on Options.",
      typed && i >= prefix && "Marked typed, but its position changed since. Check the order in the MCC portal.",
    ].filter(Boolean) as string[];
    return { typed, lr, flags, picking: picked?.index === i };
  };
  const drop = (i: number) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragFrom.current != null) {
        const to = reorder(dragFrom.current, i);
        setAnnounce(`${name(items[dragFrom.current])} moved to position ${to + 1}.`);
      }
      dragFrom.current = null;
    },
  });
  const handle = (item: ChoiceItem, i: number, picking: boolean) => (
    <Button
      id={`handle-${item.id}`}
      size="icon"
      variant="ghost"
      draggable
      onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); }}
      onKeyDown={(e) => onHandleKey(e, i)}
      onBlur={() => picked && setPicked(null)}
      aria-label={`Reorder ${name(item)}, position ${i + 1} of ${n}. ${picking ? "Picked up: arrows move it, Space drops it, Escape cancels." : "Press Space to pick up."}`}
      aria-pressed={picking}
      className="shrink-0 cursor-grab active:cursor-grabbing"
      data-print-hide
    >
      <GripVertical className="size-5" aria-hidden />
    </Button>
  );
  const upDown = (item: ChoiceItem, i: number) => (
    <>
      <Button id={`up-${item.id}`} size="icon" variant="ghost" disabled={i === 0} aria-label={`Move ${name(item)} up`} onClick={() => moveBy(i, -1)} data-print-hide><ArrowUp className="size-4" aria-hidden /></Button>
      <Button id={`down-${item.id}`} size="icon" variant="ghost" disabled={i === n - 1} aria-label={`Move ${name(item)} down`} onClick={() => moveBy(i, 1)} data-print-hide><ArrowDown className="size-4" aria-hidden /></Button>
    </>
  );
  const removeButton = (item: ChoiceItem, i: number) => (
    <Button size="icon" variant="danger" aria-label={`Remove ${name(item)}`} onClick={() => remove(i)}><Trash2 className="size-4" aria-hidden /></Button>
  );
  /** Cards: move to a position, compare, remove (the table has drag, the handle and up / down). */
  const tools = (item: ChoiceItem, i: number) => (
    <span className="flex flex-wrap items-center gap-1" data-print-hide>
      <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("to")); if (v) moveTo(i, v); }}>
        <label className="sr-only" htmlFor={`to-${item.id}`}>Move {name(item)} to position</label>
        <span className="w-16"><input id={`to-${item.id}`} name="to" type="number" min={1} max={n} placeholder="#" className={cn(control, "numeric")} /></span>
        <Button type="submit" variant="ghost">Move</Button>
      </form>
      <CompareToggle id={item.id} label={name(item)} />
      {removeButton(item, i)}
    </span>
  );
  const reachOf = (item: ChoiceItem, lr: Live[string] | undefined) =>
    lr?.reach ? <ReachBadge reach={lr.reach} provisional={lr.provisional} latest={latest} /> : <span className="text-muted-foreground">{item.reachLabel || "No label"} (when added)</span>;
  const typedBadge = <Badge tone="success"><Check className="mr-1 size-3" aria-hidden />Typed into MCC</Badge>;
  const seatsOf = (item: ChoiceItem, lr: Live[string], l: SeatList) => (
    <SeatsLink n={lr.seats[l.kind]} list={l} L={L} at={{ inst: item.slug, course: item.courseSlug, quota: item.quota }} name={`${name(item)}, ${item.quota}`} />
  );
  const related = (item: ChoiceItem, lr: Live[string] | undefined) =>
    item.courseSlug && lr?.reach !== "new" && (
      <span className="flex flex-wrap gap-x-4 text-xs" data-print-hide>
        <Link href={L.lastRanks(item.courseSlug, { inst: item.slug })} className={cn(smallLink, "text-sky")}>Last ranks</Link>
        <Link href={L.allotments({ course: item.courseSlug, inst: item.slug })} className={cn(smallLink, "text-sky")}>Allotments</Link>
      </span>
    );
  const flagLines = (flags: string[]) => flags.map((f) => <span key={f} className="block text-xs text-sun">{f}</span>);
  const listName = `${list.name} choice list, ${n} items`;

  const cards = (
    <ol id="choices-list" tabIndex={-1} aria-label={listName} className="grid max-w-4xl gap-3">
      {items.map((item, i) => {
        const { typed, lr, flags, picking } = rowOf(item, i);
        return (
          <li key={item.id} {...drop(i)} className={cn("grid min-w-0 rounded-xl", picking && "ring-2 ring-sky")}>
            <ResultCard
              chips={[item.quota, reachOf(item, lr), typed && typedBadge]}
              actions={<>{handle(item, i, picking)}{upDown(item, i)}</>}
              stat={{ label: "Choice", value: formatRank(i + 1) }}
              title={item.institute}
              href={L.institute(item.slug)}
              external={lr?.hospital?.mccProfileUrl ? { href: lr.hospital.mccProfileUrl, label: `MCC profile: ${item.institute}` } : undefined}
              subtitle={item.course}
              meta={[item.state ?? "State not listed", lr?.hospital?.type && <TypeBadgeM type={lr.hospital.type} of={item.institute} />, lr?.hospital?.beds && <BedsM b={lr.hospital.beds} inst={item.institute} of={name(item)} unit />]}
              footer={
                <>
                  {lr ? <StatCellsM t={lr.fees} of={name(item)} /> : loading && <Skeleton className="h-[7.75rem] rounded-none sm:h-[4.5rem]" />}
                  <div className={cn("grid gap-1 px-4 py-2", (lr || loading) && "border-t border-border")}>
                    {!lr && loading && hasLists && <Skeleton className="h-11 w-48" />}
                    {lr && lists.length > 0 && (
                      <p className="flex flex-wrap items-center gap-x-3 text-xs">
                        <span className="text-muted-foreground">{round} seats:</span>
                        {lists.map((l) => <span key={l.key} className="inline-flex items-center gap-1">{l.kind}{seatsOf(item, lr, l)}</span>)}
                      </p>
                    )}
                    {flags.length > 0 && <p>{flagLines(flags)}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      {related(item, lr)}
                      {tools(item, i)}
                    </div>
                  </div>
                </>
              }
            />
          </li>
        );
      })}
    </ol>
  );

  const th = cn(tbl.th, "whitespace-nowrap");
  const kindShort = { clear: "Clear", virtual: "Virtual", new: "New" } as const;
  // Every row control sits in the sticky Choice cell, so a move never scrolls the table sideways; the round's seat
  // lists share one column.
  const table = (
    <ScrollTable id="choices-list" label={listName}>
      <table className={tbl.table}>
        <caption className="sr-only">{listName}</caption>
        <thead className={tbl.head}>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(th, "bg-card md:sticky md:left-0 md:z-[3]")}>Choice</th>
            <th scope="col" className={cn(th, "px-3!")}>Your reach</th>
            {lists.length > 0 && <th scope="col" className={cn(th, "px-3! text-right")}>{round} seats</th>}
            {statKeys.map((k) => <th key={k} scope="col" className={cn(th, "px-3! text-right")}>{statLabel[k]}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const { typed, lr, flags, picking } = rowOf(item, i);
            return (
              <tr key={item.id} {...drop(i)} className={cn(tbl.row, picking && "outline-2 -outline-offset-2 outline-sky")}>
                {/* Sticky from md up; on a phone a sticky 18rem column would leave no room for the others. */}
                <th scope="row" className={cn(tbl.td, "min-w-64 bg-card py-2 text-left font-normal md:sticky md:left-0 md:z-[1] md:w-64")}>
                  <span className="flex items-start gap-1">
                    {handle(item, i, picking)}
                    {/* The choice number is its "Move to #": pick a position, the row goes straight there. */}
                    <label className="sr-only" htmlFor={`pos-${item.id}`}>Move {name(item)} to position</label>
                    <select id={`pos-${item.id}`} value={i + 1} onChange={(e) => moveTo(i, Number(e.target.value), "pos")} className="numeric mr-1.5 h-11 min-w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card px-1 text-base font-bold">
                      {items.map((x, k) => <option key={x.id} value={k + 1}>{k + 1}</option>)}
                    </select>
                    <span className="min-w-0 py-1">
                      <Link href={L.institute(item.slug)} className="font-medium hover:text-sky hover:underline"><InstName name={item.institute} state={item.state} /></Link>
                      <span className="block text-xs text-muted-foreground">{item.course}, {item.quota}</span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        {item.state ?? "State not listed"}
                        {lr?.hospital?.type && <TypeBadgeM type={lr.hospital.type} of={item.institute} />}
                        {lr?.hospital?.beds && <BedsM b={lr.hospital.beds} inst={item.institute} of={name(item)} unit />}
                        {typed && typedBadge}
                      </span>
                      {flagLines(flags)}
                      <span className="-ml-2.5 flex items-center" data-print-hide>
                        {upDown(item, i)}
                        <CompareToggle id={item.id} label={name(item)} />
                        {removeButton(item, i)}
                      </span>
                    </span>
                  </span>
                </th>
                <td className={cn(tbl.td, "px-3! text-xs")}>{reachOf(item, lr)}</td>
                {lists.length > 0 && (
                  <td className={cn(tbl.td, "px-3! py-1! text-right text-xs")}>
                    {lists.map((l) => (
                      <span key={l.key} className="flex min-h-11 items-center justify-end gap-1 whitespace-nowrap">
                        <span className="text-muted-foreground">{kindShort[l.kind]}</span>
                        {lr ? seatsOf(item, lr, l) : <Dash />}
                      </span>
                    ))}
                  </td>
                )}
                {lr ? (
                  <StatCellsM t={lr.fees} variant="table" of={name(item)} tdClassName="px-3" />
                ) : (
                  <td colSpan={statKeys.length} className={cn(tbl.td, "text-xs text-muted-foreground")}>{fresh || failed === liveKey || !reachFor ? <Dash /> : "Loading terms…"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        {state.lists.map((l) => (
          <Button key={l.id} variant={l.id === list.id ? "primary" : "secondary"} aria-pressed={l.id === list.id} onClick={() => setState((s) => ({ ...s, activeId: l.id }))}>
            {l.name} <span className="opacity-70">({l.items.length})</span>
          </Button>
        ))}
        {state.lists.length < maxLists ? (
          <Button
            variant="ghost"
            onClick={() => {
              setState((s) => duplicateList(s, list.id));
              setAnnounce(`Duplicated ${list.name} as ${duplicateList(state, list.id).lists.at(-1)!.name}; now showing it.`);
            }}
          >
            Duplicate for next round
          </Button>
        ) : (
          <Link href="/pricing" className="inline-flex min-h-11 items-center text-sm text-sky underline">More lists with the Season Pass</Link>
        )}
      </div>
      {nextRound && <p className="-mt-2 text-sm text-muted-foreground" data-print-hide>For {nextRound.when}.</p>}

      {/* As on every results page: Cards | Table, then the CSV. */}
      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        <ViewToggle page="choices" view={view} />
        <Button variant="secondary" disabled={!n} onClick={download} aria-label={`Download CSV of ${list.name}`}><Download className="size-4" aria-hidden />CSV</Button>
        <Button variant="secondary" disabled={!n} onClick={copy}>Copy in MCC order</Button>
        <Button variant="secondary" disabled={!n} onClick={share}>Share on WhatsApp</Button>
        <Button variant="secondary" disabled={!n} onClick={() => window.print()}>Print</Button>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          Mark how far you&apos;ve typed into MCC: up to choice
          <span className="w-20">
            <input
              type="number" min={0} max={n} value={prefix}
              onChange={(e) => setState((s) => updateActive(s, (l) => markTypedUpTo(l, Number(e.target.value) || 0)))}
              className={cn(control, "numeric")}
            />
          </span>
        </label>
      </div>
      {copyMsg && (
        <div className="text-sm" data-print-hide>
          <p>{copyMsg.text}</p>
          {copyMsg.lines && <ol className="mt-1 grid gap-0.5 border-l-2 border-border pl-3 text-xs text-muted-foreground">{copyMsg.lines.map((l) => <li key={l} className="break-words">{l}</li>)}</ol>}
        </div>
      )}
      {missingTyped > 0 && (
        <p className="text-sm text-sun" data-print-hide>
          {missingTyped === 1 ? "1 option you marked as typed into MCC is" : `${missingTyped} options you marked as typed into MCC are`} no longer in this list, but still in the
          portal. Remove {missingTyped === 1 ? "it" : "them"} there too, then set the typed count again.
        </p>
      )}

      <p className="sr-only" aria-live="assertive">{announce}</p>
      <p className="sr-only" aria-live="polite">{copyMsg?.text.replace(/:$/, ".") ?? ""}</p>
      {removed && (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm" data-print-hide>
          Removed {name(removed.item)} from {removed.listName}.
          <Button id="choices-undo" variant="ghost" onClick={undo}>Undo</Button>
        </p>
      )}

      <h2 id="choices-h" tabIndex={-1} className="sr-only">{list.name}</h2>
      {n === 0 ? (
        <EmptyState title={`${list.name} is empty`} description="Add options with the star on the Options screen or an institute page.">
          <Link href={L.options()} className={cn(smallLink, "text-sm text-sky")}>Go to Options</Link>
        </EmptyState>
      ) : (
        <>
          {view === "cards" ? cards : table}
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {current && ranked ? "Labels, seats and terms: from the current data and your rank." : current ? "Terms: from the current data. Labels marked (when added) are from when you added each option." : "Labels marked (when added) are from when you added each option."}
            <InfoTip label="labels, seats and terms">
              {current && ranked
                ? `Reach labels use your current rank and category and previous years' closing ranks.${round ? ` ${round} seats: each choice's seats in the ${lists.map((l) => l.kind).join(", ")} lists, in its quota and your seat categories, "—" when a list has none; the lists overlap, so they are never added.` : ""} Fee, stipend, bond and leaving: each choice's course and quota, as published.`
                : `Set your rank to see labels and seats for your current profile.${current ? " Fee, stipend, bond and leaving: each choice's course and quota, as published." : ""}`}
            </InfoTip>
          </p>
        </>
      )}
    </div>
  );
}
