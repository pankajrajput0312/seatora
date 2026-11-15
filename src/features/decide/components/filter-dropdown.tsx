"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Compact multi-select for GET filter forms: a pill that opens a checkbox panel. Ticked boxes submit repeated params
 * (sp=A&sp=B), which every Decide page reads. Only one panel is open at a time (native `<details name>`), and it closes
 * on Escape (focus back on the pill) and when focus leaves it, so it never covers the control that has focus.
 * `search`: a box above the list that shows only the options whose label has what she types (a long list; with JS).
 * `find`: a list too long to send (Residents' colleges): `options` are only the ticked ones, and the box asks `find` for
 * what she types (2+ letters); without JS the box itself is submitted as `findName` (the page searches by it).
 */
const noop = () => () => {};
export function FilterDropdown({ label, name, options, selected, none = "All", noneNote = "None ticked means all.", search, find, findName }: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  selected: string[];
  /** What the pill says, and the note explains, when nothing is ticked (quotas: the open ones, not all). */
  none?: string;
  noneNote?: string;
  search?: boolean;
  find?: (q: string) => Promise<{ value: string; label: string }[] | null>;
  findName?: string;
}) {
  const count = selected.length;
  const [typed, setTyped] = useState("");
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [found, setFound] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!find || typed.trim().length < 2) return setFound([]);
    let live = true;
    const t = setTimeout(() => find(typed.trim()).then((r) => live && setFound(r ?? [])), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [find, typed]);
  // With `find`: the ticked ones (kept while she searches on), then what the search found (each once).
  const [kept, setKept] = useState(options);
  const shown = find ? [...kept, ...found.filter((o) => !kept.some((x) => x.value === o.value))] : options;
  const keep = (o: { value: string; label: string }) => find && !kept.some((x) => x.value === o.value) && setKept((k) => [...k, o]);
  return (
    <details
      name="decide-filter"
      className="group relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.stopPropagation(); // only this panel, not a Filters panel around it
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false;
      }}
      onToggle={(e) => {
        // Open leftwards when the panel would pass the right edge of the window (the last pill in a row).
        const panel = e.currentTarget.querySelector("fieldset")!;
        delete panel.dataset.flip;
        if (e.currentTarget.open && panel.getBoundingClientRect().right > document.documentElement.clientWidth) panel.dataset.flip = "";
      }}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-card px-3 text-sm whitespace-nowrap hover:border-foreground/70 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{count ? (count === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${count} selected`) : none}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* tabIndex -1: a click on the panel's text keeps focus inside, so the panel stays open. */}
      <fieldset tabIndex={-1} className="absolute left-0 z-10 mt-1 max-h-80 min-w-56 max-w-[calc(100vw-2rem)] overflow-auto data-flip:right-0 data-flip:left-auto rounded-lg border border-border bg-card p-2 shadow-overlay outline-none">
        <legend className="sr-only">{label}</legend>
        {(search || find) && (
          <input
            type="search"
            name={find && !hydrated ? findName : undefined}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            aria-label={`Find in ${label}`}
            placeholder="Type to find"
            className="mb-1 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
          />
        )}
        {find && typed.trim().length >= 2 && !found.length && <p role="status" className="px-2 py-1 text-xs text-muted-foreground">Nothing found yet.</p>}
        {shown.map((o) => (
          <label key={o.value} hidden={(!find && !words.every((w) => o.label.toLowerCase().includes(w))) || undefined} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} onChange={(e) => e.target.checked && keep(o)} className="size-4 accent-sky" />
            {o.label}
          </label>
        ))}
        <p className="px-2 pt-1 text-xs text-muted-foreground">{noneNote}</p>
      </fieldset>
    </details>
  );
}
