"use client";

/**
 * The branch tables' search (branch-ranks.tsx): hides the rows whose `data-name` lacks a typed word, and marks the
 * section `data-searching` so its folded rows show while she searches. The tables are server-rendered; this is all the JS.
 */
export function BranchSearch() {
  return (
    <input
      type="search"
      aria-label="Search a branch"
      placeholder="Search a branch, e.g. radio"
      className="h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus:border-sky focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs sm:text-sm"
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
