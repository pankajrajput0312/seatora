"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, GripVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CHOICES_KEY, defaultChoices, duplicateList, move, toCsv, toMccText, updateActive, type ChoiceItem, type ChoicesState } from "../lib/choices";
import { useLocal } from "../lib/local-store";

export function ChoicesView() {
  const [state, setState, hydrated] = useLocal<ChoicesState>(CHOICES_KEY, defaultChoices);
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const [announce, setAnnounce] = useState("");
  const [picked, setPicked] = useState<{ index: number; origin: number } | null>(null);
  const [removed, setRemoved] = useState<{ item: ChoiceItem; index: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);

  const items = list.items;
  const n = items.length;
  const setItems = (next: ChoiceItem[]) => setState((s) => updateActive(s, (l) => ({ ...l, items: next })));
  const reorder = (from: number, to: number, focus = true) => {
    const target = Math.max(0, Math.min(n - 1, to));
    setItems(move(items, from, target));
    if (focus) requestAnimationFrame(() => handles.current[target]?.focus());
    return target;
  };
  const name = (i: ChoiceItem) => `${i.institute}, ${i.course}`;

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
      setAnnounce(`${name(items[index])}, position ${to + 1} of ${n}.`);
    } else if (picked && e.key === "Escape") {
      e.preventDefault();
      reorder(index, picked.origin);
      setAnnounce(`Move cancelled. ${name(items[index])} back at position ${picked.origin + 1}.`);
      setPicked(null);
    }
  };

  const remove = (index: number) => {
    setRemoved({ item: items[index], index });
    setItems(items.filter((_, i) => i !== index));
    setAnnounce(`Removed ${name(items[index])}.`);
  };
  const undo = () => {
    if (!removed) return;
    const next = [...items];
    next.splice(removed.index, 0, removed.item);
    setItems(next);
    setAnnounce(`Restored ${name(removed.item)} at position ${removed.index + 1}.`);
    setRemoved(null);
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
          <Button key={l.id} size="sm" variant={l.id === list.id ? "primary" : "secondary"} aria-pressed={l.id === list.id} className="min-h-11" onClick={() => setState((s) => ({ ...s, activeId: l.id }))}>
            {l.name} <span className="numeric opacity-70">({l.items.length})</span>
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setState((s) => duplicateList(s, list.id))}>Duplicate for next round</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        <Button size="sm" variant="secondary" className="min-h-11" disabled={!n} onClick={async () => { await navigator.clipboard.writeText(toMccText(list)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? "Copied" : "Copy in MCC order"}
        </Button>
        <Button size="sm" variant="secondary" className="min-h-11" disabled={!n} onClick={download}>Download CSV</Button>
        <Button size="sm" variant="secondary" className="min-h-11" disabled={!n} onClick={() => window.print()}>Print</Button>
        <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm">
          Typed into the MCC portal up to #
          <input
            type="number" min={0} max={n} value={list.transcribedUpTo}
            onChange={(e) => setState((s) => updateActive(s, (l) => ({ ...l, transcribedUpTo: Math.max(0, Math.min(n, Number(e.target.value) || 0)) })))}
            className="numeric h-11 w-20 rounded-md border border-input bg-card px-2"
          />
        </label>
      </div>

      <p className="sr-only" aria-live="assertive">{announce}</p>
      {removed && (
        <p role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm" data-print-hide>
          Removed {name(removed.item)}.
          <Button size="sm" variant="ghost" onClick={undo}>Undo</Button>
        </p>
      )}

      {n === 0 ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">{list.name} is empty.</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add options with the ☆ on the Options screen.</p>
          <Link href="/decide/options" className="text-sm text-sky underline">Go to Options</Link>
        </div>
      ) : (
        <ol aria-label={`${list.name} choice list, ${n} items`} className="grid gap-2">
          {items.map((item, i) => {
            const flags = [
              (counts.get(dupKey(item)) ?? 0) > 1 && "Same institute and course listed more than once",
              item.closedEveryRound && "Closed before your rank in every past round",
            ].filter(Boolean) as string[];
            const typed = i < list.transcribedUpTo;
            return (
              <li
                key={item.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom.current != null) reorder(dragFrom.current, i, false); dragFrom.current = null; }}
                className={cn("grid grid-cols-[auto_auto_1fr] items-start gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[auto_auto_1fr_auto]", picked?.index === i ? "border-sky" : "border-border")}
              >
                <button
                  ref={(el) => { handles.current[i] = el; }}
                  type="button"
                  draggable
                  onDragStart={() => { dragFrom.current = i; }}
                  onKeyDown={(e) => onHandleKey(e, i)}
                  onBlur={() => picked && setPicked(null)}
                  aria-label={`Reorder ${name(item)}, position ${i + 1} of ${n}. Press Space to pick up.`}
                  aria-pressed={picked?.index === i}
                  className="grid size-11 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
                  data-print-hide
                >
                  <GripVertical className="size-5" aria-hidden />
                </button>
                <span className="numeric grid h-11 min-w-11 place-items-center font-pixel text-xl">{i + 1}</span>
                <div className="min-w-0 py-1">
                  <p className="font-medium">
                    <Link href={`/decide/institutes/${item.slug}`} className="hover:text-sky">{item.institute}</Link>
                    {typed && <Badge tone="success" className="ml-2 align-middle"><Check className="mr-1 size-3" aria-hidden />Typed into MCC</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.course}, {item.quota}{item.state ? `, ${item.state}` : ""}</p>
                  {item.courseSlug && (
                    <p className="mt-1 flex gap-3 text-xs" data-print-hide>
                      <Link href={`/decide/last-ranks?course=${item.courseSlug}&inst=${item.slug}#inst-${item.slug}`} className="text-sky underline">Last ranks</Link>
                      <Link href={`/decide/allotments?course=${item.courseSlug}&inst=${item.slug}`} className="text-sky underline">Allotments</Link>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{item.reachLabel}</p>
                  {flags.map((f) => <p key={f} className="mt-1 text-xs text-sun">{f}</p>)}
                </div>
                <div className="col-span-3 flex flex-wrap items-center gap-1 sm:col-span-1" data-print-hide>
                  <Button size="sm" variant="ghost" className="size-11 p-0" disabled={i === 0} aria-label={`Move ${name(item)} up`} onClick={() => reorder(i, i - 1)}><ArrowUp className="size-4" /></Button>
                  <Button size="sm" variant="ghost" className="size-11 p-0" disabled={i === n - 1} aria-label={`Move ${name(item)} down`} onClick={() => reorder(i, i + 1)}><ArrowDown className="size-4" /></Button>
                  <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("to")); if (v) { const t = reorder(i, v - 1); setAnnounce(`${name(item)} moved to position ${t + 1}.`); } }}>
                    <label className="sr-only" htmlFor={`to-${item.id}`}>Move {name(item)} to position</label>
                    <input id={`to-${item.id}`} name="to" type="number" min={1} max={n} placeholder="#" className="numeric h-11 w-16 rounded-md border border-input bg-background px-2 text-sm" />
                    <Button type="submit" size="sm" variant="ghost" className="min-h-11">Move</Button>
                  </form>
                  <Button size="sm" variant="ghost" className="size-11 p-0 text-ember" aria-label={`Remove ${name(item)}`} onClick={() => remove(i)}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
