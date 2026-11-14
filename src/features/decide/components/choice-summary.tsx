"use client";

import Link from "next/link";
import { useChoices } from "../lib/use-decide-store";

export function ChoiceSummary({ choicesHref }: { choicesHref: string }) {
  const [state] = useChoices();
  return (
    <section aria-labelledby="choices-h" className="rounded-xl border border-border bg-card p-6">
      <h2 id="choices-h" className="text-lg font-medium">Choice lists</h2>
      <ul className="mt-4 grid gap-2">
        {state.lists.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{l.name}</span>
            <span className="numeric text-muted-foreground">{l.items.length} {l.items.length === 1 ? "choice" : "choices"}</span>
          </li>
        ))}
      </ul>
      <Link href={choicesHref} className="mt-4 inline-flex min-h-11 items-center text-sm text-sky underline">Open choice lists</Link>
    </section>
  );
}
