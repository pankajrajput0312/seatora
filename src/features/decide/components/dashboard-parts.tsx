"use client";

import Link from "next/link";
import { CHOICES_KEY, defaultChoices, type ChoicesState } from "../lib/choices";
import { useLocal } from "../lib/local-store";

/** Ruled strip of headline numbers: one band split by hairlines, not floating cards. */
export function StatStrip({ items }: { items: { label: string; value: string; note?: string; href?: string }[] }) {
  const [choices] = useLocal<ChoicesState>(CHOICES_KEY, defaultChoices);
  const r2 = choices.lists.find((l) => l.id === choices.activeId) ?? choices.lists[0];
  const all = [...items, { label: `In your ${r2?.name ?? "choice"} list`, value: String(r2?.items.length ?? 0), note: r2?.transcribedUpTo ? `${r2.transcribedUpTo} typed into MCC` : "None typed into MCC yet", href: "/decide/choices" }];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border xl:grid-cols-4">
      {all.map((s) => (
        <div key={s.label} className="bg-card p-4 sm:p-5">
          <dt className="text-sm text-muted-foreground">{s.label}</dt>
          <dd className="mt-1 text-3xl leading-tight font-bold tracking-tight sm:text-[2.5rem]">{s.value}</dd>
          {s.note && <dd className="text-xs text-muted-foreground">{s.href ? <Link href={s.href} className="underline hover:text-foreground">{s.note}</Link> : s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function TopChoices({ href }: { href: string }) {
  const [state] = useLocal<ChoicesState>(CHOICES_KEY, defaultChoices);
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const top = list?.items.slice(0, 5) ?? [];
  return (
    <section aria-labelledby="top-choices" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="top-choices" className="text-base font-semibold">Top of {list?.name ?? "your list"}</h2>
        <Link href={href} className="text-sm text-sky underline">Open list</Link>
      </div>
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing added yet. Star options on the Options screen to build your list.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {top.map((c, i) => (
            <li key={c.id} className="flex items-baseline gap-3 py-2.5">
              <span className="w-6 text-right text-sm font-bold">{i + 1}</span>
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
