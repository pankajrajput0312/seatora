"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { collegeKeyOf, nameFirstList, renameOptionId, renameSaved, type RenamedCollege } from "../lib/choices";
import { examRetiredKeys } from "@/app/decide/retired-actions";
import { authorityOf, DEFAULT_EXAM } from "@/features/exams/keys";
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
  const [renamed, setRenamed] = useState<string[]>([]);
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
      // Old id → its name in the notice; the choices go first, so a choice's (with its course) wins over a compared id's.
      const old = new Map<string, string>();
      const note = (r: ReturnType<typeof renameSaved>) => r.renamed.forEach((x, k) => old.has(x) || old.set(x, r.names[k]));
      setChoices((s) => {
        const r = renameSaved(s, [], of);
        note(r);
        return r.choices;
      });
      setCompare((ids) => {
        const r = renameSaved({ lists: [], activeId: "" }, ids, of);
        note(r);
        return r.compare;
      });
      setRenamed([...new Set(old.values())]);
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
    <div role="status" className={renamed.length ? "px-4 pt-4 md:px-6 xl:px-10" : undefined} data-print-hide>
      {renamed.length > 0 && (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm">
          {renamed.length} saved {renamed.length === 1 ? "option was" : "options were"} renamed after {authorityOf(exam)}&apos;s college names were cleaned up:{" "}
          {renamed.slice(0, 3).join("; ")}{renamed.length > 3 ? `; and ${renamed.length - 3} more` : ""}.
          <Button variant="ghost" onClick={() => setRenamed([])}>Dismiss</Button>
        </p>
      )}
    </div>
  );
}
