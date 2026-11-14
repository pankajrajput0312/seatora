"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, GripVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { duplicateList, markTypedUpTo, move, toCsv, toMccText, typedPrefix, updateActive, type ChoiceItem } from "../lib/choices";
import { useChoices, useProfileHref } from "../lib/use-decide-store";
import { CompareToggle } from "./option-actions";

export function ChoicesView() {
  const [state, setState, hydrated] = useChoices();
  const href = useProfileHref();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const [announce, setAnnounce] = useState("");
  const [picked, setPicked] = useState<{ index: number; origin: number } | null>(null);
  const [removed, setRemoved] = useState<{ item: ChoiceItem; index: number } | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const items = list.items;
  const n = items.length;
  const prefix = typedPrefix(list);
  const name = (i: ChoiceItem) => `${i.institute}, ${i.course}`;
  const setItems = (next: ChoiceItem[]) => setState((s) => updateActive(s, (l) => ({ ...l, items: next })));
  /** Focus a control of the item with this id after React re-renders. */
  const focusItem = (id: string | undefined, control: "handle" | "up" | "down" = "handle") =>
    requestAnimationFrame(() => {
      const el = id ? document.getElementById(`${control}-${id}`) : null;
      const handle = id ? document.getElementById(`handle-${id}`) : null;
      const target = el && !(el as HTMLButtonElement).disabled ? el : handle ?? listRef.current ?? document.getElementById("choices-h");
      target?.focus();
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
    setRemoved({ item, index });
    setItems(items.filter((_, i) => i !== index));
    // Focus the item that took its place, else the one before, else the list.
    focusItem((items[index + 1] ?? items[index - 1])?.id);
    setAnnounce(`Removed ${name(item)}. Undo is available.`);
  };
  const undo = () => {
    if (!removed) return;
    const next = [...items];
    next.splice(removed.index, 0, removed.item);
    setItems(next);
    focusItem(removed.item.id);
    setAnnounce(`Restored ${name(removed.item)} at position ${removed.index + 1}.`);
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
        <Button variant="ghost" onClick={() => setState((s) => duplicateList(s, list.id))}>Duplicate for next round</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        <Button variant="secondary" disabled={!n} onClick={copy}>Copy in MCC order</Button>
        <Button variant="secondary" disabled={!n} onClick={download}>Download CSV</Button>
        <Button variant="secondary" disabled={!n} onClick={() => window.print()}>Print</Button>
        <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm">
          Typed into the MCC portal up to #
          <input
            type="number" min={0} max={n} value={prefix}
            onChange={(e) => setState((s) => updateActive(s, (l) => markTypedUpTo(l, Number(e.target.value) || 0)))}
            className="numeric h-11 w-20 rounded-md border border-input bg-card px-2"
          />
        </label>
      </div>
      {copyMsg && <p className="text-sm" data-print-hide>{copyMsg}</p>}

      <p className="sr-only" aria-live="assertive">{announce}</p>
      <p className="sr-only" aria-live="polite">{copyMsg ?? ""}</p>
      {removed && (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm" data-print-hide>
          Removed {name(removed.item)}.
          <Button variant="ghost" onClick={undo}>Undo</Button>
        </p>
      )}

      <h2 id="choices-h" tabIndex={-1} className="sr-only">{list.name}</h2>
      {n === 0 ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="font-medium">{list.name} is empty.</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add options with the star on the Options screen or an institute page.</p>
          <Link href={href("/decide/options")} className="text-sm text-sky underline">Go to Options</Link>
        </div>
      ) : (
        <>
          <ol ref={listRef} tabIndex={-1} aria-label={`${list.name} choice list, ${n} items`} className="grid gap-2">
            {items.map((item, i) => {
              const typed = list.typedIds.includes(item.id);
              const flags = [
                (counts.get(dupKey(item)) ?? 0) > 1 && "Same institute and course listed more than once",
                item.closedEveryRound && "Closed before your rank in every past round",
                typed && i >= prefix && "Marked typed, but its position changed since. Check the order in the MCC portal.",
              ].filter(Boolean) as string[];
              return (
                <li
                  key={item.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom.current != null) { const to = reorder(dragFrom.current, i); setAnnounce(`${name(items[dragFrom.current])} moved to position ${to + 1}.`); } dragFrom.current = null; }}
                  className={cn("grid grid-cols-[auto_auto_1fr] items-start gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[auto_auto_1fr_auto]", picked?.index === i ? "border-sky" : "border-border")}
                >
                  <button
                    id={`handle-${item.id}`}
                    type="button"
                    draggable
                    onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); }}
                    onKeyDown={(e) => onHandleKey(e, i)}
                    onBlur={() => picked && setPicked(null)}
                    aria-label={`Reorder ${name(item)}, position ${i + 1} of ${n}. Press Space to pick up.`}
                    aria-pressed={picked?.index === i}
                    className="grid size-11 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    data-print-hide
                  >
                    <GripVertical className="size-5" aria-hidden />
                  </button>
                  <span className="grid h-11 min-w-11 place-items-center text-xl font-bold tabular-nums">{i + 1}</span>
                  <div className="min-w-0 py-1">
                    <p className="font-medium">
                      <Link href={href(`/decide/institutes/${item.slug}`)} className="hover:text-sky hover:underline">{item.institute}</Link>
                      {typed && <Badge tone="success" className="ml-2 align-middle"><Check className="mr-1 size-3" aria-hidden />Typed into MCC</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.course}, {item.quota}{item.state ? `, ${item.state}` : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.reachLabel} <span className="text-muted-foreground/80">(when added)</span></p>
                    {item.courseSlug && (
                      <p className="mt-1 flex gap-3 text-xs" data-print-hide>
                        <Link href={href("/decide/last-ranks", { course: item.courseSlug, inst: item.slug }, `#inst-${item.slug}`)} className="text-sky underline">Last ranks</Link>
                        <Link href={href("/decide/allotments", { course: item.courseSlug, inst: item.slug })} className="text-sky underline">Allotments</Link>
                      </p>
                    )}
                    {flags.map((f) => <p key={f} className="mt-1 text-xs text-sun">{f}</p>)}
                  </div>
                  <div className="col-span-3 flex flex-wrap items-center gap-1 sm:col-span-1" data-print-hide>
                    <Button id={`up-${item.id}`} size="icon" variant="ghost" disabled={i === 0} aria-label={`Move ${name(item)} up`} onClick={() => moveBy(i, -1)}><ArrowUp className="size-4" /></Button>
                    <Button id={`down-${item.id}`} size="icon" variant="ghost" disabled={i === n - 1} aria-label={`Move ${name(item)} down`} onClick={() => moveBy(i, 1)}><ArrowDown className="size-4" /></Button>
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("to")); if (v) { const t = reorder(i, v - 1); focusItem(item.id); setAnnounce(`${name(item)} moved to position ${t + 1} of ${n}.`); } }}>
                      <label className="sr-only" htmlFor={`to-${item.id}`}>Move {name(item)} to position</label>
                      <input id={`to-${item.id}`} name="to" type="number" min={1} max={n} placeholder="#" className="numeric h-11 w-16 rounded-md border border-input bg-background px-2 text-sm" />
                      <Button type="submit" variant="ghost">Move</Button>
                    </form>
                    <CompareToggle id={item.id} label={name(item)} />
                    <Button size="icon" variant="danger" aria-label={`Remove ${name(item)}`} onClick={() => remove(i)}><Trash2 className="size-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">Reach labels are from when you added each option, based on previous years&apos; closing ranks. History, not a prediction.</p>
        </>
      )}
    </div>
  );
}
