"use client";

import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { typedPrefix } from "../lib/choices";
import { useChoices, useDecideLinks } from "../lib/use-decide-store";
import { smallLink, StatCell } from "./ui";

/** StatStrip cell for her active choice list (on this device). Neutral until localStorage is read, never a false "0". */
export function ChoicesStat() {
  const [choices, , hydrated] = useChoices();
  const L = useDecideLinks();
  const list = choices.lists.find((l) => l.id === choices.activeId) ?? choices.lists[0];
  const typed = typedPrefix(list);
  return (
    <StatCell
      label={hydrated ? `In your ${list.name} list` : "In your choice list"}
      value={hydrated ? formatRank(list.items.length) : "—"}
      note={<Link href={L.choices()} className={smallLink}>{!hydrated ? "Open your list" : typed ? `${formatRank(typed)} typed into MCC` : "None typed into MCC yet"}</Link>}
    />
  );
}

export function TopChoices() {
  const [state, , hydrated] = useChoices();
  const L = useDecideLinks();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const top = list.items.slice(0, 5);
  return (
    <section aria-labelledby="top-choices" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="top-choices" className="text-base font-semibold">{hydrated ? `Top of ${list.name}` : "Top of your list"}</h2>
        <Link href={L.choices()} className={`${smallLink} text-sm text-sky`}>Open list</Link>
      </div>
      {!hydrated ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your list from this device…</p>
      ) : top.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing added yet. Star options on the Options screen to build your list.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {top.map((c, i) => (
            <li key={c.id} className="flex items-baseline gap-3 py-2.5">
              <span className="numeric w-6 text-right text-sm font-bold">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.institute}</span>
                <span className="block text-xs text-muted-foreground">{c.course}, {c.quota}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
