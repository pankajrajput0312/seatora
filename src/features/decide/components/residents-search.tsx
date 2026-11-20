"use client";

import { X } from "lucide-react";
import { createContext, use, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { searchMatcher } from "../lib/college-aliases";
import { FilterSection } from "./filter-form";
import { control } from "./ui";

type Opt = { value: string; label: string; group?: string; find?: string };
type Find = (q: string) => Promise<Opt[] | null>;

/**
 * The colleges ticked for the Residents search: one set for the search box's list and the Filters sheet's College
 * section, submitted as the search box's hidden `college` inputs. Starts from the applied ones (key it by them). The
 * full list of hospitals (Government first) is loaded once, when either is first opened.
 */
const Picks = createContext<{ picked: Opt[]; toggle: (o: Opt) => void; all: Opt[] | null; loadAll: () => void } | null>(null);

export function ResidentsPicks({ colleges, listColleges, children }: { colleges: Opt[]; listColleges: () => Promise<Opt[] | null>; children: React.ReactNode }) {
  const [picked, setPicked] = useState(colleges);
  const [all, setAll] = useState<Opt[] | null>(null);
  const loadAll = () => {
    if (all !== null) return;
    setAll([]);
    listColleges().then((r) => setAll(r ?? []));
  };
  const toggle = (o: Opt) => setPicked((p) => (p.some((x) => x.value === o.value) ? p.filter((x) => x.value !== o.value) : [...p, o]));
  return <Picks value={{ picked, toggle, all, loadAll }}>{children}</Picks>;
}

const usePicks = () => use(Picks)!;
/** Opens the page's Filters sheet at its College section. */
const openCollegeFilter = () => {
  const sheet = document.querySelector<HTMLDialogElement>("dialog[data-filters]");
  if (!sheet) return;
  if (!sheet.open) sheet.showModal();
  const section = sheet.querySelector<HTMLDetailsElement>("[data-section=college] details");
  if (section) section.open = true;
  section?.querySelector<HTMLElement>("input[type=search]")?.focus();
};

/**
 * The Residents search box: as she types (2+ letters) a dropdown lists matching hospitals (by name, city or short name:
 * "KEM") and names, each with a tick box; ticking several keeps them as chips (hidden `college` / `name` inputs) until
 * Search. Enter searches the typed text (`q`) when nothing is ticked. A comma in it: a hint that it finds one name or
 * hospital, and Filters → College for several. Without JS it is the plain `q` box.
 */
export function ResidentsSearch({ q, colleges, names, findColleges, findNames }: { q?: string; colleges: Opt[]; names: string[]; findColleges: Find; findNames: Find }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const { picked: pickedColleges, toggle: toggleCollege, all, loadAll } = usePicks();
  const [typed, setTyped] = useState(q ?? "");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ colleges: Opt[]; names: Opt[] }>({ colleges: [], names: [] });
  const [pickedNames, setPickedNames] = useState<string[]>(names);

  useEffect(() => {
    const t = typed.trim();
    if (t.length < 2) return setFound({ colleges: [], names: [] });
    // Hospitals: from the full list when it is here (instant), else the server.
    const match = searchMatcher(t);
    const local = all?.length && match ? all.filter((o) => match(`${o.label} ${o.find ?? ""}`)).slice(0, 50) : null;
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
    const close = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const toggleName = (n: string) => setPickedNames((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const browsing = typed.trim().length < 2;
  const pending = pickedColleges.map((c) => c.value).join("\n") !== colleges.map((c) => c.value).join("\n") || pickedNames.join("\n") !== names.join("\n");
  const shownColleges = browsing ? all ?? [] : found.colleges;
  const any = shownColleges.length + (browsing ? 0 : found.names.length) > 0 || (browsing && all !== null);
  const tick = "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted";
  const several = typed.includes(",") && !pickedColleges.length;

  return (
    <>
      {/* In the toolbar beside Filters; on phones the list is the screen's width (from the box's left edge), not the box's. */}
      <div ref={box} className="relative min-w-0 @container" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        <label>
          <span className="sr-only">Search a name or hospital</span>
          <input
            type="search"
            name={pickedColleges.length || pickedNames.length ? undefined : "q"}
            value={typed}
            maxLength={60}
            autoComplete="off"
            placeholder=" "
            className={cn(control, "peer")}
            role="combobox"
            aria-expanded={open && any}
            aria-controls={`${id}-list`}
            aria-describedby={several ? `${id}-several` : undefined}
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
          {/* The placeholder, shorter when the box is narrow (a container query: large text too), never cut off. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 hidden items-center text-sm text-muted-foreground peer-placeholder-shown:flex max-md:text-[1rem]">
            <span className="@max-[11rem]:hidden">Name or hospital</span>
            <span className="@min-[11rem]:hidden">Search</span>
          </span>
        </label>
        {pickedColleges.map((c) => <input key={c.value} type="hidden" name="college" value={c.value} />)}
        {pickedNames.map((n) => <input key={n} type="hidden" name="name" value={n} />)}
        {open && any && (
          <div id={`${id}-list`} role="group" aria-label="Matches" className="absolute top-full left-0 z-40 mt-1 max-h-[40dvh] w-[calc(100vw_-_var(--spacing)*8)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-overlay md:right-0 md:w-auto">
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
      {several && (
        <p id={`${id}-several`} className="mt-1 text-xs text-muted-foreground">
          Search finds one name or hospital; use{" "}
          <button type="button" onClick={openCollegeFilter} className="hit relative font-semibold text-sky underline">Filters → College</button> for several.
        </p>
      )}
      {/* The picks not searched yet, under the box (the applied ones are the page's chips). */}
      {pending && (
        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
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

/**
 * The Residents Filters sheet's College section: every hospital with residents (Government first), a box to find them
 * by name, city or short name, and a tick box each; ticked ones stay at the top. The same picks as the search box.
 */
export function ResidentsCollegeFilter() {
  const { picked, toggle, all, loadAll } = usePicks();
  const [typed, setTyped] = useState("");
  const match = searchMatcher(typed);
  const isPicked = (o: Opt) => picked.some((x) => x.value === o.value);
  const rest = (all ?? []).filter((o) => !isPicked(o) && (!match || match(`${o.label} ${o.find ?? ""}`)));
  const chip = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-3 text-sm hover:border-foreground/70 has-checked:border-sky has-checked:bg-sky/10 has-checked:font-semibold has-checked:text-sky";
  const item = (o: Opt) => (
    <label key={o.value} className={chip}>
      {/* No name: the search box's hidden `college` inputs submit the picks. */}
      <input type="checkbox" checked={isPicked(o)} onChange={() => toggle(o)} className="size-4 shrink-0 accent-sky" />
      {o.label}
    </label>
  );
  return (
    <div data-section="college" className="contents">
      <FilterSection
        title="College"
        none="All colleges"
        value={picked.length ? (picked.length === 1 ? picked[0].label : `${picked.length} selected`) : "All colleges"}
        onOpen={loadAll}
        info="Tick one or more hospitals (find each by name, city or short name, like KEM). Ticked colleges replace the search box's text."
      >
        <div className="sticky top-0 z-[1] flex items-center gap-3 bg-card pb-2">
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} aria-label="Find a college" placeholder="Find a college" className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm" />
          <span aria-hidden className={cn("shrink-0 text-sm", picked.length ? "font-semibold text-sky" : "text-muted-foreground")}>{picked.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">{picked.map(item)}</div>
        {all !== null && all.length === 0 && <p className="py-2 text-sm text-muted-foreground">Loading hospitals…</p>}
        {!!all?.length && match && !rest.length && <p role="status" className="py-2 text-sm text-muted-foreground">No college matches “{typed.trim()}”.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {rest.map((o, i) => (
            <div key={o.value} className="contents">
              {!match && o.group && o.group !== rest[i - 1]?.group && <p className="basis-full pt-2 text-xs font-semibold text-muted-foreground">{o.group}</p>}
              {item(o)}
            </div>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
