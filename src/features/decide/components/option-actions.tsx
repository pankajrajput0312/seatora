"use client";

import { GitCompareArrows, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { MAX_COMPARE, toggleItem, type ChoiceItem } from "../lib/choices";
import { useChoices, useCompare } from "../lib/use-decide-store";

export function ChoiceStar({ item }: { item: ChoiceItem }) {
  const [state, setState] = useChoices();
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const on = !!active?.items.some((i) => i.id === item.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`In ${active?.name ?? "choices"}: ${item.institute}, ${item.course}, ${item.quota}`}
      onClick={() => setState((s) => toggleItem(s, item))}
      className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Star className={cn("size-5", on && "fill-sky text-sky")} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

export function CompareToggle({ id, label }: { id: string; label: string }) {
  const [ids, setIds] = useCompare();
  const on = ids.includes(id);
  const full = !on && ids.length >= MAX_COMPARE;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={full}
      aria-label={full ? `Compare is full (${MAX_COMPARE}): ${label}` : `In compare: ${label}`}
      onClick={() => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]))}
      className={cn("grid size-11 place-items-center rounded-md hover:bg-muted disabled:opacity-40", on ? "text-sky" : "text-muted-foreground")}
    >
      <GitCompareArrows className="size-5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
