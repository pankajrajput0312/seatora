"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orderFor, type Profile } from "../profile";

/**
 * "Your order" in the profile editor: her courses (`units`: her exact pairs, else her specialties) most wanted first,
 * moved with up / down, a course ticked "Equal to the one above" sharing its place. Not set (`value` undefined): they
 * are listed as picked and count as equal until she moves or ties one. Suggest my list reads it (profile.ts prefRank).
 */
export function CourseOrder({ units, value, onChange }: { units: { key: string; label: string }[]; value: Profile["order"]; onChange: (o: string[][]) => void }) {
  const keys = units.map((u) => u.key);
  const groups = value?.length ? (orderFor(value, keys) ?? [keys]) : keys.map((k) => [k]);
  // One row a course; `tie`: in the place of the one above (ties stay with the place when a course moves).
  const rows = groups.flatMap((g) => g.map((key, k) => ({ key, tie: k > 0 })));
  const place = rows.reduce<number[]>((xs, r, i) => [...xs, i === 0 ? 1 : xs[i - 1] + (r.tie ? 0 : 1)], []);
  const label = (k: string) => units.find((u) => u.key === k)?.label ?? k;
  const [said, setSaid] = useState("");
  const set = (next: typeof rows) => {
    const out: string[][] = [];
    next.forEach((r, i) => (i > 0 && r.tie ? out.at(-1)!.push(r.key) : out.push([r.key])));
    onChange(out);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = rows.map((r) => ({ ...r }));
    [next[i].key, next[i + d].key] = [next[i + d].key, next[i].key];
    set(next);
    setSaid(`${label(rows[i].key)} moved ${d < 0 ? "up" : "down"}, place ${place[i + d]} of ${place.at(-1)}.`);
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium">Your order</legend>
      <p className="text-xs text-muted-foreground">
        {value?.length
          ? "Your first preference at the top. Suggest my list puts every seat of a course above the next course's. Tick Equal for courses you would take as gladly."
          : "Not set: Suggest my list counts your courses as equal. Move one up or down, or tick Equal, to set it."}
      </p>
      <ol className="mt-2 grid gap-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1.5rem_1fr] items-center gap-x-2 rounded-md border border-input bg-secondary py-1 pr-1 pl-3 text-sm sm:grid-cols-[1.5rem_1fr_auto]">
            <span className="numeric font-bold"><span className="sr-only">Place </span>{place[i]}</span>
            <span className="min-w-0 py-1">{label(r.key)}</span>
            {/* Phones: the controls on a line of their own under the name. */}
            <span className="col-start-2 flex items-center justify-between gap-x-2 sm:col-start-3">
              {i > 0 ? (
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" className="size-4 accent-sky" checked={r.tie} onChange={(e) => set(rows.map((x, k) => (k === i ? { ...x, tie: e.target.checked } : x)))} />
                  Equal to the one above<span className="sr-only">: {label(rows[i - 1].key)}</span>
                </label>
              ) : <span />}
              <span className="flex">
                <Button type="button" size="icon" variant="ghost" disabled={i === 0} aria-label={`Move ${label(r.key)} up`} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button type="button" size="icon" variant="ghost" disabled={i === rows.length - 1} aria-label={`Move ${label(r.key)} down`} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{said}</p>
    </fieldset>
  );
}
