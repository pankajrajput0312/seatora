"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { control } from "./ui";

type Opt = { value: string; label: string; group?: string };
type Find = (q: string) => Promise<Opt[] | null>;

/**
 * The Residents search box: as she types (2+ letters) a dropdown lists matching hospitals and names, each with a tick
 * box; ticking several keeps them as chips (hidden `college` / `name` inputs) until Search. Enter searches the typed
 * text (`q`) when nothing is ticked. Without JS it is the plain `q` box.
 */
export function ResidentsSearch({ q, colleges, names, findColleges, findNames, listColleges }: { q?: string; colleges: Opt[]; names: string[]; findColleges: Find; findNames: Find; listColleges: () => Promise<Opt[] | null> }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(q ?? "");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ colleges: Opt[]; names: Opt[] }>({ colleges: [], names: [] });
  const [pickedColleges, setPickedColleges] = useState<Opt[]>(colleges);
  const [pickedNames, setPickedNames] = useState<string[]>(names);
  // Every hospital with residents (Government first), loaded once when the box is first opened: scroll and tick.
  const [all, setAll] = useState<Opt[] | null>(null);
  const loadAll = () => {
    if (all === null) {
      setAll([]);
      listColleges().then((r) => setAll(r ?? []));
    }
  };

  useEffect(() => {
    const t = typed.trim();
    if (t.length < 2) return setFound({ colleges: [], names: [] });
    // Hospitals: from the full list when it is here (instant), else the server.
    const local = all?.length ? all.filter((o) => t.toLowerCase().split(/\s+/).every((w) => o.label.toLowerCase().includes(w))).slice(0, 50) : null;
    let live = true;
    // Each list shows as soon as it arrives: names search more rows and come back later.
    const timer = setTimeout(() => {
      if (local) setFound((f) => ({ ...f, colleges: local }));
      else findColleges(t).then((c) => live && setFound((f) => ({ ...f, colleges: c ?? [] })));
      if (t.length >= 3) findNames(t).then((n) => live && setFound((f) => ({ ...f, names: n ?? [] })));
      else setFound((f) => ({ ...f, names: [] }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, findColleges, findNames, all]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggleCollege = (o: Opt) => setPickedColleges((p) => (p.some((x) => x.value === o.value) ? p.filter((x) => x.value !== o.value) : [...p, o]));
  const toggleName = (n: string) => setPickedNames((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const browsing = typed.trim().length < 2;
  const shownColleges = browsing ? all ?? [] : found.colleges;
  const any = shownColleges.length + (browsing ? 0 : found.names.length) > 0 || (browsing && all !== null);
  const tick = "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted";

  return (
    <>
      {/* Phones: the box takes the whole row (Search and Filters wrap under it), so the list is the row's width. */}
      <div ref={box} className="relative min-w-0 flex-1 basis-full md:basis-32 md:min-w-56" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        <label>
          <span className="sr-only">Search a name or hospital</span>
          <input
            type="search"
            name={pickedColleges.length || pickedNames.length ? undefined : "q"}
            value={typed}
            maxLength={60}
            autoComplete="off"
            placeholder="Search a name or hospital"
            className={control}
            role="combobox"
            aria-expanded={open && any}
            aria-controls={`${id}-list`}
            onChange={(e) => {
              setTyped(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              loadAll();
              // Phones: the box to the top of the screen, so the list has the room above the keyboard.
              if (matchMedia("(width < 48rem)").matches) box.current?.scrollIntoView({ block: "start" });
            }}
          />
        </label>
        {pickedColleges.map((c) => <input key={c.value} type="hidden" name="college" value={c.value} />)}
        {pickedNames.map((n) => <input key={n} type="hidden" name="name" value={n} />)}
        {open && any && (
          <div id={`${id}-list`} role="group" aria-label="Matches" className="absolute inset-x-0 top-full z-40 mt-1 max-h-[40dvh] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 shadow-lg">
            {browsing && all !== null && all.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">Loading hospitals…</p>}
            {!browsing && shownColleges.length > 0 && <p className="px-2 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">Hospitals</p>}
            {shownColleges.map((o, i) => (
              <div key={o.value}>
                {browsing && o.group && o.group !== shownColleges[i - 1]?.group && <p className="sticky top-0 z-10 bg-popover px-2 pt-2 pb-0.5 text-xs font-semibold text-muted-foreground">{o.group}</p>}
                <label className={tick}>
                  <input type="checkbox" checked={pickedColleges.some((x) => x.value === o.value)} onChange={() => toggleCollege(o)} className="size-4 shrink-0" />
                  <span className="line-clamp-2">{o.label}</span>
                </label>
              </div>
            ))}
            {!browsing && found.names.length > 0 && <p className="px-2 pt-2 pb-0.5 text-xs font-semibold text-muted-foreground">Names</p>}
            {!browsing && found.names.map((o) => (
              <label key={o.value} className={tick}>
                <input type="checkbox" checked={pickedNames.includes(o.value)} onChange={() => toggleName(o.value)} className="size-4 shrink-0" />
                <span className="line-clamp-2">{o.label}</span>
              </label>
            ))}
            <p className="sticky bottom-0 bg-popover px-2 py-1 text-xs text-muted-foreground">{browsing ? "Scroll and tick hospitals, or type a name or hospital." : "Tick one or more, then Search."}</p>
          </div>
        )}
      </div>
      {/* The picks: a row of their own under the search row (order-last in the form's flex row), never over Search. */}
      {(pickedColleges.length > 0 || pickedNames.length > 0) && (
        <div className="order-last flex min-w-0 basis-full flex-wrap gap-1.5">
          {[...pickedColleges.map((c) => ({ key: `c:${c.value}`, label: c.label, drop: () => toggleCollege(c) })), ...pickedNames.map((n) => ({ key: `n:${n}`, label: n, drop: () => toggleName(n) }))].map((c) => (
            <button key={c.key} type="button" onClick={c.drop} className="hit inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2.5 text-xs" aria-label={`Remove ${c.label}`}>
              <span className="truncate">{c.label}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
