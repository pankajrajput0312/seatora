"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { control } from "./ui";

type Opt = { value: string; label: string };
type Find = (q: string) => Promise<Opt[] | null>;

/**
 * The Residents search box: as she types (2+ letters) a dropdown lists matching hospitals and names, each with a tick
 * box; ticking several keeps them as chips (hidden `college` / `name` inputs) until Search. Enter searches the typed
 * text (`q`) when nothing is ticked. Without JS it is the plain `q` box.
 */
export function ResidentsSearch({ q, colleges, names, findColleges, findNames }: { q?: string; colleges: Opt[]; names: string[]; findColleges: Find; findNames: Find }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(q ?? "");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ colleges: Opt[]; names: Opt[] }>({ colleges: [], names: [] });
  const [pickedColleges, setPickedColleges] = useState<Opt[]>(colleges);
  const [pickedNames, setPickedNames] = useState<string[]>(names);

  useEffect(() => {
    const t = typed.trim();
    if (t.length < 2) return setFound({ colleges: [], names: [] });
    let live = true;
    // Each list shows as soon as it arrives: names search more rows and come back later.
    const timer = setTimeout(() => {
      findColleges(t).then((c) => live && setFound((f) => ({ ...f, colleges: c ?? [] })));
      if (t.length >= 3) findNames(t).then((n) => live && setFound((f) => ({ ...f, names: n ?? [] })));
      else setFound((f) => ({ ...f, names: [] }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, findColleges, findNames]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggleCollege = (o: Opt) => setPickedColleges((p) => (p.some((x) => x.value === o.value) ? p.filter((x) => x.value !== o.value) : [...p, o]));
  const toggleName = (n: string) => setPickedNames((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const any = found.colleges.length + found.names.length > 0;
  const tick = "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted";

  return (
    <div ref={box} className="relative min-w-0 flex-1 basis-32 md:min-w-56" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
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
          onFocus={() => setOpen(true)}
        />
      </label>
      {pickedColleges.map((c) => <input key={c.value} type="hidden" name="college" value={c.value} />)}
      {pickedNames.map((n) => <input key={n} type="hidden" name="name" value={n} />)}
      {(pickedColleges.length > 0 || pickedNames.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[...pickedColleges.map((c) => ({ key: `c:${c.value}`, label: c.label, drop: () => toggleCollege(c) })), ...pickedNames.map((n) => ({ key: `n:${n}`, label: n, drop: () => toggleName(n) }))].map((c) => (
            <button key={c.key} type="button" onClick={c.drop} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-muted px-2.5 text-xs" aria-label={`Remove ${c.label}`}>
              <span className="max-w-56 truncate">{c.label}</span>
              <X className="size-3.5" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {open && any && (
        <div id={`${id}-list`} role="group" aria-label="Matches" className="absolute inset-x-0 top-12 z-40 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {found.colleges.length > 0 && <p className="px-2 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">Hospitals</p>}
          {found.colleges.map((o) => (
            <label key={o.value} className={tick}>
              <input type="checkbox" checked={pickedColleges.some((x) => x.value === o.value)} onChange={() => toggleCollege(o)} className="size-4" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {found.names.length > 0 && <p className="px-2 pt-2 pb-0.5 text-xs font-semibold text-muted-foreground">Names</p>}
          {found.names.map((o) => (
            <label key={o.value} className={tick}>
              <input type="checkbox" checked={pickedNames.includes(o.value)} onChange={() => toggleName(o.value)} className="size-4" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          <p className="px-2 py-1 text-xs text-muted-foreground">Tick one or more, then Search.</p>
        </div>
      )}
    </div>
  );
}
