"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupsIn, quotaIn } from "@/features/exams/exam";
import { authorityOf } from "@/features/exams/keys";
import { formatRank } from "@/features/cutoffs/lib/format";
import { addToList, choiceListTitle, putFirst, toCsv, toMccText, updateActive, type ChoiceItem } from "../lib/choices";
import { bucketName, type Bucket } from "../lib/suggest";
import { useChoices, useDecideLinks, useExamInfo, useSavedProfile } from "../lib/use-decide-store";
import { profileFromParams } from "../profile";
import { toast } from "./nav-pending";
import { smallLink } from "./ui";

/** One suggested choice: its snapshot for her list, and why it is where it is (lib/suggest.ts Suggested). */
export type SuggestItem = { item: ChoiceItem; bucket: Bucket; reason: string; pref: number; unsure?: boolean };
const tone = { dream: "warning", target: "info", safe: "success" } as const;
const FIRST = 50;

/**
 * The suggested list (Suggest my list) and what she can do with it. Signed in or not, nothing is written until she
 * clicks: Add all / Add selected put the choices after hers in her open list (one already there stays where it is),
 * Use this order puts them first and keeps hers after them (it asks first); none of them removes a choice. Trying a
 * rank (the address's rank, category or question group isn't her saved one): nothing to save into, so Copy and CSV.
 * `groups`: her preference groups' names (index = pref), null without an order; `safeNote`: said under each Safe
 * choice (INI-CET: AIIMS's Round 1 rules, from its data; the page cites them).
 */
export function SuggestList({ items, groups, safeNote }: { items: SuggestItem[]; groups: string[] | null; safeNote?: string }) {
  const E = useExamInfo();
  const L = useDecideLinks();
  const sp = useSearchParams();
  const [state, setState, hydrated] = useChoices();
  const [saved, , savedRead] = useSavedProfile();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [all, setAll] = useState(items.length <= FIRST);
  const [said, setSaid] = useState("");
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const url = profileFromParams(new URLSearchParams(sp.toString()));
  const group = (q: string[]) => groupsIn(E, q).join("|");
  // As the shell's "Trying" banner (decide-shell.tsx): the address's rank, category, PwD or question group isn't hers.
  const trying = savedRead && !!url && (!saved || url.rank !== saved.rank || url.category !== saved.category || url.pwd !== saved.pwd || group(url.quotas) !== group(saved.quotas));
  const at = new Map(list.items.map((i, k) => [i.id, k + 1]));
  const say = (text: string) => {
    setSaid(text);
    toast(text);
  };
  const add = (xs: ChoiceItem[]) => {
    const { added } = addToList(list, xs);
    setState((s) => updateActive(s, (l) => addToList(l, xs).list));
    say(added ? `Added ${formatRank(added)} to ${list.name}${added < xs.length ? `; ${formatRank(xs.length - added)} already in it stay where they are` : ""}.` : `All ${formatRank(xs.length)} are already in ${list.name}.`);
    setPicked(new Set());
  };
  const reorder = () => {
    const xs = items.map((x) => x.item);
    const rest = list.items.filter((i) => !xs.some((x) => x.id === i.id)).length;
    if (!confirm(`Put these ${xs.length} choices first in your ${choiceListTitle(list.name)}, in this order${rest ? `, and keep your ${rest} other ${rest === 1 ? "choice" : "choices"} after them` : ""}? Nothing is removed.`)) return;
    setState((s) => updateActive(s, (l) => putFirst(l, xs)));
    say(`Your ${choiceListTitle(list.name)} now starts with these ${formatRank(xs.length)}${rest ? `, then your ${formatRank(rest)} other ${rest === 1 ? "choice" : "choices"}` : ""}.`);
  };
  // Copy and CSV: every suggested choice, each quota as MCC words it.
  const out = { id: "suggested", name: "Suggested list", typedIds: [], items: items.map((x) => ({ ...x.item, quota: quotaIn(E, x.item.quota) })) };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMccText(out));
      say(`Copied ${formatRank(items.length)} choices in ${authorityOf(E.key)} order.`);
    } catch {
      say("Couldn't copy. Use CSV instead.");
    }
  };
  const csv = () => {
    const why = new Map(items.map((x) => [x.item.id, [bucketName[x.bucket], x.reason.replace(/^\w+: /, "")]]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(out, (id) => why.get(id) ?? null, ["Suggested as", "Why"])], { type: "text/csv" }));
    a.download = "suggested-list.csv";
    a.click();
  };
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const shown = all ? items : items.slice(0, FIRST);
  // One numbered run per preference group (its heading), the numbers going on from the run before.
  const runs = shown.reduce<{ pref: number; at: number; xs: SuggestItem[] }[]>((rs, x, i) => {
    if (!rs.length || (groups && rs.at(-1)!.pref !== x.pref)) rs.push({ pref: x.pref, at: i, xs: [] });
    rs.at(-1)!.xs.push(x);
    return rs;
  }, []);
  const name = (i: ChoiceItem) => `${i.institute}, ${i.course}, ${quotaIn(E, i.quota)}`;
  const chosen = items.filter((x) => picked.has(x.item.id)).map((x) => x.item);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        {!hydrated || !savedRead ? (
          <p role="status" className="text-sm text-muted-foreground">Loading your list…</p>
        ) : trying ? (
          <>
            <p className="basis-full text-sm">
              Trying {E.rankWord} <span className="numeric">{formatRank(url!.rank)}</span>: nothing is saved, so this list isn&apos;t added to yours. Copy or download it, or choose Save as mine above to keep the rank and add it.
            </p>
            <Button variant="secondary" onClick={copy}>Copy in {authorityOf(E.key)} order</Button>
            <Button variant="secondary" onClick={csv} aria-label="Download CSV of the suggested list"><Download className="size-4" aria-hidden />CSV</Button>
          </>
        ) : (
          <>
            <Button onClick={() => add(items.map((x) => x.item))}>Add all {formatRank(items.length)} to {list.name}</Button>
            <Button variant="secondary" aria-disabled={!chosen.length || undefined} onClick={() => chosen.length && add(chosen)} className="aria-disabled:opacity-50">
              Add {formatRank(chosen.length)} selected
            </Button>
            <Button variant="ghost" onClick={reorder}>Use this order in {list.name}</Button>
            <Button variant="ghost" onClick={csv} aria-label="Download CSV of the suggested list"><Download className="size-4" aria-hidden />CSV</Button>
            <span className="basis-full text-xs text-muted-foreground">
              Adds go after your {formatRank(list.items.length)} {list.items.length === 1 ? "choice" : "choices"} in your {choiceListTitle(list.name)}; nothing in it is removed. <Link href={L.choices()} className={smallLink}>Open {list.name}</Link>
            </span>
          </>
        )}
        <p role="status" aria-live="polite" className="sr-only">{said}</p>
      </div>

      {runs.map((run) => (
        <section key={run.at} aria-labelledby={groups ? `pref-${run.at}` : undefined}>
          {groups && (
            <h3 id={`pref-${run.at}`} className="border-b border-border pb-1 text-sm font-semibold">
              {groups[run.pref] ?? "Courses not in your order"}
            </h3>
          )}
          <ol start={run.at + 1} aria-label={groups ? undefined : "Suggested list"} className="divide-y divide-border">
            {run.xs.map((x, k) => {
              const n = run.at + k + 1;
              const i = x.item;
              const mine = at.get(i.id);
              return (
                <li key={i.id} className="flex gap-2 py-2">
                  <span className="flex w-11 shrink-0 flex-col items-center">
                    <span className="numeric text-sm font-bold">{n}</span>
                    {!trying && (
                      <label className="grid size-11 cursor-pointer place-items-center">
                        <input type="checkbox" className="size-5 accent-sky" checked={picked.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} aria-label={`Select ${n}: ${name(i)}`} />
                      </label>
                    )}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <Link href={L.institute(i.slug)} className="font-semibold hover:text-sky hover:underline">{i.institute}</Link>
                      <span className="text-xs text-muted-foreground">{i.state ?? "State not listed"}</span>
                    </span>
                    <span className="text-sm">{i.course}, {quotaIn(E, i.quota)}</span>
                    <span className="text-xs">
                      <Badge tone={tone[x.bucket]} className="mr-1.5 font-semibold">{bucketName[x.bucket]}</Badge>
                      {x.reason.replace(/^\w+: /, "")}
                    </span>
                    {x.unsure && <span className="text-xs text-muted-foreground">A figure your caps need is not published (kept by Include not published).</span>}
                    {safeNote && x.bucket === "safe" && <span className="text-xs text-sun">{safeNote}</span>}
                    {mine && <span className="text-xs text-muted-foreground">Already in {list.name} at <span className="numeric">{mine}</span></span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {!all && (
        <Button variant="secondary" className="justify-self-center" onClick={() => setAll(true)}>
          Show all {formatRank(items.length)}
        </Button>
      )}
    </div>
  );
}
