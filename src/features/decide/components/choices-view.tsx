"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Check, GripVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { duplicateList, markTypedUpTo, move, toCsv, toMccText, typedPrefix, updateActive, type ChoiceItem } from "../lib/choices";
import { LATEST_YEAR, PAST_YEARS, reachWindow, type Reach } from "../lib/reach";
import { useChoices, useDecideLinks } from "../lib/use-decide-store";
import { keepProfileParams } from "../profile";
import { ReachBadge } from "./bits";
import { CompareToggle } from "./option-actions";
import { control, EmptyState, smallLink } from "./ui";

type Live = Record<string, { reach: Reach; provisional: boolean }>;
/** Reach labels from the current data for these ids and profile params (a server action); null when unavailable. */
type ReachFor = (ids: string[], profile: string) => Promise<Live | null>;

export function ChoicesView({ reachFor }: { reachFor?: ReachFor }) {
  const [state, setState, hydrated] = useChoices();
  const L = useDecideLinks();
  const sp = useSearchParams();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const [announce, setAnnounce] = useState("");
  const [picked, setPicked] = useState<{ index: number; origin: number } | null>(null);
  // Undo belongs to the list the item was removed from, whichever list is open when she presses it.
  const [removed, setRemoved] = useState<{ listId: string; listName: string; item: ChoiceItem; index: number } | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const items = list.items;
  const n = items.length;
  const prefix = typedPrefix(list);
  const missingTyped = list.typedIds.filter((id) => !items.some((i) => i.id === id)).length;
  const name = (i: ChoiceItem) => `${i.institute}, ${i.course}`;
  const setItems = (next: ChoiceItem[]) => setState((s) => updateActive(s, (l) => ({ ...l, items: next })));

  // Relabel from the current data and her rank and category in the URL; the stored labels are the fallback.
  const url = new URLSearchParams(sp.toString());
  const who = new URLSearchParams([...keepProfileParams(url)].filter(([k]) => k === "rank" || k === "cat" || k === "pwd")).toString();
  const liveKey = who.includes("rank=") && n ? JSON.stringify([who, items.map((i) => i.id).sort()]) : "";
  // Labels gathered for this rank and category (kept across edits, so nothing flickers); `fresh` = the last answer
  // covered exactly these ids, so a missing id really is missing from the data.
  const [live, setLive] = useState<{ who: string; key: string; data: Live } | null>(null);
  useEffect(() => {
    if (!hydrated || !reachFor || !liveKey) return;
    let stale = false;
    const [qs, ids] = JSON.parse(liveKey) as [string, string[]];
    reachFor(ids, qs).then(
      (data) => !stale && data && setLive((prev) => ({ who: qs, key: liveKey, data: { ...(prev?.who === qs ? prev.data : {}), ...data } })),
      () => {}, // no data: keep the stored labels
    );
    return () => {
      stale = true;
    };
  }, [hydrated, reachFor, liveKey]);
  const current = live?.who === who ? live.data : null;
  const fresh = live?.key === liveKey;

  /** Focus a control of the item with this id after React re-renders, and keep it in view (it may have moved). */
  const focusItem = (id: string | undefined, which: "handle" | "up" | "down" = "handle") =>
    requestAnimationFrame(() => {
      const el = id ? document.getElementById(`${which}-${id}`) : null;
      const handle = id ? document.getElementById(`handle-${id}`) : null;
      const target = el && !(el as HTMLButtonElement).disabled ? el : handle ?? listRef.current ?? document.getElementById("choices-undo") ?? document.getElementById("choices-h");
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
    try {
      await navigator.clipboard.writeText(toMccText(list));
      setCopyMsg(`Copied ${n} choices in MCC order.`);
    } catch {
      setCopyMsg("Couldn't copy. Use Download CSV or Print instead.");
    }
    setTimeout(() => setCopyMsg(null), 4000);
  };

  const dupKey = (i: ChoiceItem) => `${i.slug}|${i.course}`;
  const counts = items.reduce((m, i) => m.set(dupKey(i), (m.get(dupKey(i)) ?? 0) + 1), new Map<string, number>());

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(list)], { type: "text/csv" }));
    a.download = `${list.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
  };

  if (!hydrated) return <div className="mt-8 h-40 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="mt-8 grid gap-6">
      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        {state.lists.map((l) => (
          <Button key={l.id} variant={l.id === list.id ? "primary" : "secondary"} aria-pressed={l.id === list.id} onClick={() => setState((s) => ({ ...s, activeId: l.id }))}>
            {l.name} <span className="opacity-70">({l.items.length})</span>
          </Button>
        ))}
        <Button
          variant="ghost"
          onClick={() => {
            setState((s) => duplicateList(s, list.id));
            setAnnounce(`Duplicated ${list.name} as ${duplicateList(state, list.id).lists.at(-1)!.name}; now showing it.`);
          }}
        >
          Duplicate for next round
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        <Button variant="secondary" disabled={!n} onClick={copy}>Copy in MCC order</Button>
        <Button variant="secondary" disabled={!n} onClick={download}>Download CSV</Button>
        <Button variant="secondary" disabled={!n} onClick={() => window.print()}>Print</Button>
        <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm">
          Typed into the MCC portal up to #
          <span className="w-20">
            <input
              type="number" min={0} max={n} value={prefix}
              onChange={(e) => setState((s) => updateActive(s, (l) => markTypedUpTo(l, Number(e.target.value) || 0)))}
              className={cn(control, "numeric")}
            />
          </span>
        </label>
      </div>
      {copyMsg && <p className="text-sm" data-print-hide>{copyMsg}</p>}
      {missingTyped > 0 && (
        <p className="text-sm text-sun" data-print-hide>
          {missingTyped === 1 ? "1 option you marked as typed into MCC is" : `${missingTyped} options you marked as typed into MCC are`} no longer in this list, but still in the
          portal. Remove {missingTyped === 1 ? "it" : "them"} there too, then set the typed count again.
        </p>
      )}

      <p className="sr-only" aria-live="assertive">{announce}</p>
      <p className="sr-only" aria-live="polite">{copyMsg ?? ""}</p>
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
          <ol ref={listRef} tabIndex={-1} aria-label={`${list.name} choice list, ${n} items`} className="grid gap-2">
            {items.map((item, i) => {
              const typed = list.typedIds.includes(item.id);
              const lr = current?.[item.id];
              const closed = lr ? lr.reach === "closed-before" : item.closedEveryRound;
              const flags = [
                (counts.get(dupKey(item)) ?? 0) > 1 && "Same institute and course listed more than once",
                closed && `Closed before your rank in every round of ${reachWindow(LATEST_YEAR, PAST_YEARS)}${lr ? "" : " (when added)"}`,
                fresh && !lr && "Not found in the current MCC data; it may have been renamed. Check it on Options.",
                typed && i >= prefix && "Marked typed, but its position changed since. Check the order in the MCC portal.",
              ].filter(Boolean) as string[];
              const picking = picked?.index === i;
              return (
                <li
                  key={item.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom.current != null) { const to = reorder(dragFrom.current, i); setAnnounce(`${name(items[dragFrom.current])} moved to position ${to + 1}.`); } dragFrom.current = null; }}
                  className={cn("grid grid-cols-[auto_auto_1fr] items-start gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[auto_auto_1fr_auto]", picking ? "border-sky" : "border-border")}
                >
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
                    className="cursor-grab active:cursor-grabbing"
                    data-print-hide
                  >
                    <GripVertical className="size-5" aria-hidden />
                  </Button>
                  <span className="grid h-11 min-w-11 place-items-center text-xl font-bold tabular-nums">{i + 1}</span>
                  <div className="min-w-0 py-1">
                    <p className="font-medium">
                      <Link href={L.institute(item.slug)} className="hover:text-sky hover:underline">{item.institute}</Link>
                      {typed && <Badge tone="success" className="ml-2 align-middle"><Check className="mr-1 size-3" aria-hidden />Typed into MCC</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.course}, {item.quota}, {item.state ?? "state not listed"}</p>
                    <p className="mt-1 text-xs">
                      {lr ? <ReachBadge reach={lr.reach} provisional={lr.provisional} /> : <span className="text-muted-foreground">{item.reachLabel || "No label"} (when added)</span>}
                    </p>
                    {item.courseSlug && (
                      <p className="flex flex-wrap gap-x-4 text-xs" data-print-hide>
                        <Link href={L.lastRanks(item.courseSlug, { inst: item.slug })} className={cn(smallLink, "text-sky")}>Last ranks</Link>
                        <Link href={L.allotments({ course: item.courseSlug, inst: item.slug })} className={cn(smallLink, "text-sky")}>Allotments</Link>
                      </p>
                    )}
                    {flags.map((f) => <p key={f} className="mt-1 text-xs text-sun">{f}</p>)}
                  </div>
                  <div className="col-span-3 flex flex-wrap items-center gap-1 sm:col-span-1" data-print-hide>
                    <Button id={`up-${item.id}`} size="icon" variant="ghost" disabled={i === 0} aria-label={`Move ${name(item)} up`} onClick={() => moveBy(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                    <Button id={`down-${item.id}`} size="icon" variant="ghost" disabled={i === n - 1} aria-label={`Move ${name(item)} down`} onClick={() => moveBy(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("to")); if (v) { const t = reorder(i, v - 1); focusItem(item.id); setAnnounce(`${name(item)} moved to position ${t + 1} of ${n}.`); } }}>
                      <label className="sr-only" htmlFor={`to-${item.id}`}>Move {name(item)} to position</label>
                      <span className="w-16"><input id={`to-${item.id}`} name="to" type="number" min={1} max={n} placeholder="#" className={cn(control, "numeric")} /></span>
                      <Button type="submit" variant="ghost">Move</Button>
                    </form>
                    <CompareToggle id={item.id} label={name(item)} />
                    <Button size="icon" variant="danger" aria-label={`Remove ${name(item)}`} onClick={() => remove(i)}><Trash2 className="size-4" aria-hidden /></Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            {current
              ? "Reach labels use your current rank and category and previous years' closing ranks."
              : "Labels marked (when added) are from when you added each option. Set your rank to see them for your current profile."}
          </p>
        </>
      )}
    </div>
  );
}
