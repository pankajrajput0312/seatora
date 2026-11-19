"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { collegeKeyOf, nameFirstList, renameOptionId, renameSaved, type RenamedCollege } from "../lib/choices";
import { examRetiredKeys } from "@/app/decide/retired-actions";
import { DEFAULT_EXAM } from "@/features/exams/keys";
import { useChoices, useCompare, useExam } from "../lib/use-decide-store";
import { navigating } from "./nav-pending";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// Once per page load: ids saved since come from the current data, never under a retired key.
let checked = false;

/**
 * Option ids saved in this browser (choice lists, the compare tray, a compare link's ?ids=) under a college key an MCC
 * import retired (merged colleges, neutral names) move to the key the college has now (/api/v1/retired-keys, keyed by
 * the old key or its sha256), and a notice says how many. `listName`: the round she fills next ("Round 3 · 2026", the
 * layout's from MCC's schedule): her first list takes it on any page, so a star on Options names the list Choices shows.
 */
export function RenamedSaved({ listName }: { listName?: string | null }) {
  const [choices, setChoices, hydrated] = useChoices();
  useEffect(() => {
    if (hydrated && listName && nameFirstList(choices, listName)) setChoices((s) => nameFirstList(s, listName) ?? s);
  }, [hydrated, listName, choices, setChoices]);
  const [compare, setCompare] = useCompare();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [renamed, setRenamed] = useState(0);
  const exam = useExam();

  useEffect(() => {
    if (!hydrated || checked) return;
    const urlIds = sp.getAll("ids").flatMap((v) => v.split(",")).filter(Boolean);
    const keys = [...new Set([...choices.lists.flatMap((l) => [...l.items.map((i) => i.id), ...l.typedIds]), ...compare, ...urlIds].map(collegeKeyOf))];
    if (!keys.length) return;
    checked = true;
    (async () => {
      // NEET PG: the API, as ever; another exam (staff): its own keys, through a server action that reads the URL's exam.
      const body = exam === DEFAULT_EXAM ? ((await (await fetch("/api/v1/retired-keys")).json()) as { ok: boolean; data?: Record<string, RenamedCollege> }) : { ok: true, data: (await examRetiredKeys()) ?? undefined };
      if (!body.ok || !body.data) throw new Error("retired keys unavailable");
      const map = body.data;
      const hashed = new Map(await Promise.all(keys.map(async (k) => [k, `sha256:${await sha256(k)}`] as const)));
      const of = (k: string) => map[k] ?? map[hashed.get(k) ?? ""];
      if (!keys.some(of)) return;
      const old = new Set<string>();
      setChoices((s) => {
        const r = renameSaved(s, [], of);
        r.renamed.forEach((x) => old.add(x));
        return r.choices;
      });
      setCompare((ids) => {
        const r = renameSaved({ lists: [], activeId: "" }, ids, of);
        r.renamed.forEach((x) => old.add(x));
        return r.compare;
      });
      setRenamed(old.size);
      const next = urlIds.map((id) => renameOptionId(id, of));
      if (next.some((id, i) => id !== urlIds[i])) {
        const p = new URLSearchParams(sp.toString());
        p.set("ids", [...new Set(next)].join(","));
        navigating();
        router.replace(`${pathname}?${p}`, { scroll: false });
      }
    })().catch(() => {
      checked = false; // try again on the next page
    });
  }, [hydrated, choices, compare, sp, router, pathname, setChoices, setCompare, exam]);

  return (
    <div role="status" className={renamed ? "px-4 pt-4 md:px-6 xl:px-10" : undefined} data-print-hide>
      {renamed > 0 && (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm">
          {renamed} saved {renamed === 1 ? "option was" : "options were"} renamed after MCC&apos;s college names were cleaned up.
          <Button variant="ghost" onClick={() => setRenamed(0)}>Dismiss</Button>
        </p>
      )}
    </div>
  );
}
