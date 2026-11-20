"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The branch tables' search and sort (branch-ranks.tsx; the search, the residents pages' hospitals too). The search hides the rows whose `data-name` lacks a typed word,
 * and marks the section `data-searching` so its folded rows show while she searches. The tables are server-rendered;
 * this is all the JS.
 */
export function BranchSearch({ label = "Search a branch", placeholder = "Search a branch, e.g. radio" }: { label?: string; placeholder?: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      className="h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus:border-sky focus-visible:ring-2 focus-visible:ring-ring sm:w-xs sm:text-sm"
      onChange={(e) => {
        const root = e.currentTarget.closest<HTMLElement>("[data-lr]");
        if (!root) return;
        const words = e.currentTarget.value.toLowerCase().split(/\s+/).filter(Boolean);
        root.toggleAttribute("data-searching", words.length > 0);
        for (const row of root.querySelectorAll<HTMLElement>("[data-name]")) row.hidden = !words.every((w) => row.dataset.name!.includes(w));
        for (const panel of root.querySelectorAll<HTMLElement>("[data-panel]")) {
          const none = panel.querySelector<HTMLElement>("[data-none]");
          if (none) none.hidden = !words.length || !!panel.querySelector("[data-name]:not([hidden])");
        }
      }}
    />
  );
}

/**
 * Rows in the order a sort option names, from their data-* (`data-i`: the server's order). "": the server's order;
 * "name": A–Z; else a key, lowest first, or highest first with "-desc" ("open", "open-desc", "n-desc"). A row without
 * the key falls back to `data-last` (a restricted row's one last rank), else goes last; ties keep the server's order.
 */
export function ordered<T extends { dataset: DOMStringMap }>(rows: T[], by: string): T[] {
  const [key, dir] = by.split("-");
  const v = (r: T) => Number(r.dataset[key] ?? r.dataset.last ?? NaN);
  const cmp = (a: T, b: T) => {
    if (!key) return 0;
    if (key === "name") return a.dataset.name!.localeCompare(b.dataset.name!);
    const [x, y] = [v(a), v(b)];
    if (Number.isNaN(x) || Number.isNaN(y)) return Number(Number.isNaN(x)) - Number(Number.isNaN(y));
    return dir === "desc" ? y - x : x - y;
  };
  return [...rows].sort((a, b) => cmp(a, b) || Number(a.dataset.i) - Number(b.dataset.i));
}

/** Reorders each table's rows as the select says and refolds them: the first `fold` rows are the top of that order. */
function sortTables(select: HTMLSelectElement, fold: number) {
  for (const body of select.closest("[data-lr]")?.querySelectorAll("tbody") ?? []) {
    ordered([...body.querySelectorAll<HTMLElement>(":scope > [data-name]")], select.value).forEach((row, i) => {
      row.toggleAttribute("data-more", i >= fold);
      body.append(row);
    });
  }
}
/** A phone's category chip beside Open for a sort option ("obc": #lr-c-OBC), when it is one. */
const chip = (select: HTMLSelectElement, v: string) =>
  select.closest("[data-lr]")?.querySelector<HTMLInputElement>(`input[name="lr-cat"][id="lr-c-${v.toUpperCase()}"]`) ?? null;
const load = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // storage blocked: the default order
  }
};

/**
 * The tables' sort: `children` are its <option>s, the first one the server's order. Kept for this tab (sessionStorage
 * `store`, not the address: the public pages stay static) and said to a screen reader. On a phone, a category sort shows
 * that category beside Open, and picking another category there sorts by it.
 */
export function BranchSort({ fold, store, children }: { fold: number; store: string; children: React.ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLSelectElement>(null);
  const [said, setSaid] = useState("");
  const choose = (select: HTMLSelectElement, v: string) => {
    select.value = v;
    sortTables(select, fold);
    const c = chip(select, v);
    if (c) c.checked = true;
    try {
      sessionStorage.setItem(store, v);
    } catch {}
    setSaid(`Sorted by ${select.selectedOptions[0]?.text ?? ""}`);
  };

  // Her kept sort on load, and again after the server re-renders the rows in its order (a new rank on Decide Home: new
  // `children` too).
  useEffect(() => {
    const select = ref.current!;
    const v = load(store);
    if (v != null && [...select.options].some((o) => o.value === v)) select.value = v;
    if (select.selectedIndex > 0) sortTables(select, fold);
  }, [children, fold, store]);
  // A phone's category beside Open, while sorted by a category: sort by the one she picks there.
  useEffect(() => {
    const select = ref.current!;
    const root = select.closest("[data-lr]");
    const onPick = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "lr-cat" && chip(select, select.value)) choose(select, t.id.slice("lr-c-".length).toLowerCase());
    };
    root?.addEventListener("change", onPick);
    return () => root?.removeEventListener("change", onPick);
  });

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={id}>Sort</label>
      <select
        id={id}
        ref={ref}
        onChange={(e) => choose(e.currentTarget, e.currentTarget.value)}
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-base text-foreground outline-none focus:border-sky focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:text-sm"
      >
        {children}
      </select>
      <p role="status" className="sr-only">{said}</p>
    </div>
  );
}
