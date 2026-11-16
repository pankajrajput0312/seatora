"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { cn } from "@/lib/cn";
import type { SourceType } from "@/types/provenance";

// One "Sources (N)" footer per page (AppPage renders it last): every block registers the documents it draws on, each
// document once (deduped by key), numbered in the order blocks first cite them (the page's own MCC documents first:
// `first`). A numbered ref (SourceRef, SourceRefs) links #source-n and opens the footer there. Provenance stays one
// click away without a source line under every block. Before hydration (and without JS) each ref is its document's own
// link instead, and there is no footer: the server streams the page, so it renders the footer before blocks still on
// their way (async server components, client modules loading) and could not list them.

/** A file under one entry (a year's MCC result PDFs: one link per round). `order` sorts links merged from several blocks. */
export type SourceLink = { label: string; url: string | null; title?: string; provisional?: boolean; order?: number };
/** One document a block cites. `key` dedupes (default its url, else its name); `links` from every block citing the key are merged. */
export type SourceDoc = { key?: string; name: string; url?: string | null; type?: SourceType; note?: string; links?: SourceLink[] };
export type NumberedDoc = SourceDoc & { key: string; n: number };

// One URL is one document, whatever name a block gives it (merge keeps the first name).
export const docKey = (d: SourceDoc) => d.key ?? (d.url || d.name);

/** Merged entry: the first block's name, link, tier and note; every block's links, deduped, in `order`. */
function merge(key: string, ds: SourceDoc[], n: number): NumberedDoc {
  const links = new Map<string, SourceLink>();
  for (const d of ds) for (const l of d.links ?? []) links.set(`${l.label}|${l.url}`, l);
  const sorted = [...links.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ...ds[0], key, n, ...(sorted.length && { links: sorted }) };
}

/**
 * The page's registry: documents in the order the page first cited them (`first` ones before the rest), each with the
 * blocks (`id`) citing it; a document's number is its place among those still cited, so numbers stay 1…N with no gaps
 * when a block goes away, and a block that re-registers (its filter changed) keeps its documents' places. Changes in one
 * commit (hundreds of refs mounting) rebuild once and tell subscribers once, in a microtask.
 */
export function createSourceStore() {
  const docs = new Map<string, Map<string, SourceDoc>>();
  const seen = new Map<string, number>();
  let next = 0;
  let list: NumberedDoc[] = [];
  let numbers = new Map<string, number>();
  let dirty = false;
  let queued = false;
  const subs = new Set<() => void>();
  const fresh = () => {
    if (!dirty) return;
    dirty = false;
    const keys = [...docs.keys()].sort((a, b) => seen.get(a)! - seen.get(b)!);
    list = keys.map((key, i) => merge(key, [...docs.get(key)!.values()], i + 1));
    numbers = new Map(list.map((d) => [d.key, d.n]));
  };
  const changed = () => {
    dirty = true;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      subs.forEach((f) => f());
    });
  };
  return {
    add(id: string, ds: SourceDoc[], first = false) {
      for (const d of ds) {
        const k = docKey(d);
        const at = seen.get(k);
        // A `first` document goes ahead of every other one, even one a block cited before it.
        if (at === undefined || (first && at >= 0)) seen.set(k, next++ - (first ? 1e9 : 0));
        (docs.get(k) ?? docs.set(k, new Map()).get(k)!).set(id, d);
      }
      changed();
    },
    remove(id: string) {
      for (const [k, by] of docs) if (by.delete(id) && !by.size) docs.delete(k);
      changed();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
    list: () => (fresh(), list),
    number: (key: string) => (fresh(), numbers.get(key) ?? null),
  };
}
type Store = ReturnType<typeof createSourceStore>;

const Ctx = createContext<Store | null>(null);
/** False inside a view pane that is not on show (ViewPanes): its refs still read their numbers but register nothing. */
const On = createContext(true);
const EMPTY: NumberedDoc[] = [];
const noop = () => () => {};

/** Wraps a page (AppPage does): its blocks register here, `PageSourcesFooter` lists them. */
export function PageSources({ children }: { children: React.ReactNode }) {
  const [store] = useState(createSourceStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** `on={false}`: the blocks inside (a hidden view pane) cite nothing in the page's Sources. */
export function SourcesOn({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <On.Provider value={on}>{children}</On.Provider>;
}

/**
 * Registers `docs` for as long as the caller is mounted; returns their page numbers (null before hydration or outside
 * PageSources). `first`: the page's main documents (its MCC result PDFs, its seat list), numbered before the rest.
 */
export function useSources(docs: SourceDoc[], first = false): (number | null)[] {
  const store = useContext(Ctx);
  const on = useContext(On);
  const id = useId();
  const sig = JSON.stringify(docs);
  useLayoutEffect(() => {
    if (!store || !on) return;
    store.add(id, JSON.parse(sig) as SourceDoc[], first);
    return () => store.remove(id);
  }, [store, on, id, sig, first]);
  const nums = useSyncExternalStore(store?.subscribe ?? noop, () => (store ? docs.map((d) => store.number(docKey(d))).join(",") : ""), () => "");
  return docs.map((_, i) => {
    const n = nums.split(",")[i];
    return n ? Number(n) : null;
  });
}

/** Opens the footer at entry `n` and moves focus there (a ref inside an InfoTip closes it first). */
function openSource(e: React.MouseEvent<HTMLAnchorElement>, n: number) {
  const li = document.getElementById(`source-${n}`);
  if (!li) return;
  e.preventDefault();
  e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
  const box = li.closest("details");
  if (box) box.open = true;
  li.scrollIntoView({ block: "center" });
  li.focus({ preventScroll: true });
}

const docName = (d: SourceDoc) => d.name;
const refClass = "underline decoration-dotted underline-offset-2 hover:text-sky";

/** A numbered superscript for one document (a figure's source): "Source 3: name", linking the footer entry. */
export function SourceRef({ doc, first, className }: { doc: SourceDoc; first?: boolean; className?: string }) {
  const [n] = useSources([doc], first);
  // Outside a page, and before hydration (or without JS: the numbers are the browser's), the document itself.
  if (n == null) return <Fallback docs={[doc]} sup />;
  return (
    <sup className={className ?? "ml-0.5 text-[max(0.75em,0.75rem)] font-normal text-muted-foreground"}>
      <a href={`#source-${n}`} onClick={(e) => openSource(e, n)} aria-label={`Source ${n}: ${docName(doc)}`} title={docName(doc)} className={`hit ${refClass}`}>{n}</a>
    </sup>
  );
}

/**
 * A block's sources as one short line, "Sources 1, 2, 3", each number linking its footer entry; nothing when none.
 * `label`: the word before the numbers.
 */
export function SourceRefs({ docs, first, label = "Sources", className }: { docs: SourceDoc[]; first?: boolean; label?: string; className?: string }) {
  const nums = useSources(docs, first);
  const inPage = useContext(Ctx);
  if (!docs.length) return null;
  if (!inPage) return <Fallback docs={docs} />;
  const byN = new Map(nums.flatMap((n, i) => (n == null ? [] : [[n, docs[i]] as const])));
  // Before hydration (or without JS): the documents as short links, so the HTML has them.
  if (!byN.size) return <p className={className ?? "text-xs text-muted-foreground"}>{label}: <Fallback docs={docs} sup /></p>;
  const link = (n: number) => (
    <a href={`#source-${n}`} onClick={(e) => openSource(e, n)} aria-label={`Source ${n}: ${docName(byN.get(n)!)}`} title={docName(byN.get(n)!)} className={`hit ${refClass} numeric inline-flex min-h-11 min-w-6 items-center justify-center`}>{n}</a>
  );
  return (
    <p className={className ?? "text-xs text-muted-foreground"}>
      {byN.size === 1 && label === "Sources" ? "Source" : label}{" "}
      {numberRuns([...byN.keys()]).map(([a, b], i) => (
        <span key={a}>
          {i > 0 && ", "}
          {link(a)}
          {b !== a && <>–{link(b)}</>}
        </span>
      ))}
    </p>
  );
}

/** Sorted numbers as runs, a run of 3 or more as [first, last] ("4–9"), else one by one: [[1,1],[4,9],[11,11]]. */
export function numberRuns(ns: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of [...new Set(ns)].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  // A run of two reads better as "4, 5".
  return out.flatMap(([a, b]): [number, number][] => (b === a + 1 ? [[a, a], [b, b]] : [[a, b]]));
}

/** Registers documents without showing anything (a list whose figures cite them by SourceRef, or none at all). */
export function RegisterSources({ docs, first }: { docs: SourceDoc[]; first?: boolean }) {
  useSources(docs, first);
  return null;
}

/**
 * Outside a page (a test, a dialog rendered elsewhere): the documents as plain links where they are cited. `sup`: short
 * ("source", each named for screen readers and in its title), as a superscript or the links of a "Sources:" line.
 */
function Fallback({ docs, sup }: { docs: SourceDoc[]; sup?: boolean }) {
  const ext = (url: string, text: string, sr: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">{text}<span className="sr-only">{sr} (opens in a new tab)</span></a>
  );
  const out = docs.map((d, i) => (
    <span key={docKey(d)}>
      {i > 0 && "; "}
      {d.url ? ext(d.url, sup ? "source" : d.name, sup ? `: ${d.name}` : "") : d.name}
      {d.links?.map((l) => <span key={`${l.label}|${l.url}`}> {l.url ? ext(l.url, l.label, `: ${l.title ?? d.name}`) : l.label}</span>)}
    </span>
  ));
  return sup ? <sup className="ml-0.5 text-[0.75em] font-normal text-muted-foreground">{out}</sup> : <p className="text-xs text-muted-foreground">Sources: {out}</p>;
}

/** The page's numbered sources, collapsed: "Sources (N)" at the end of the page. Nothing while no block cites one. */
export function PageSourcesFooter({ className }: { className?: string }) {
  const store = useContext(Ctx);
  const list = useSyncExternalStore(store?.subscribe ?? noop, store?.list ?? (() => EMPTY), () => EMPTY);
  const box = useRef<HTMLDetailsElement>(null);
  // On paper the sources print open.
  useEffect(() => {
    const open = () => box.current && (box.current.open = true);
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);
  if (!list.length) return null;
  return (
    <details ref={box} id="page-sources" className={cn("rounded-xl border border-border bg-card px-4 text-sm", className)}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold">
        Sources <span className="numeric font-normal text-muted-foreground">({list.length})</span>
      </summary>
      <ol className="grid gap-2 pb-4 text-xs text-muted-foreground">
        {list.map((d) => {
          const tier = d.type && sourceTypeLabels[d.type];
          return (
            <li key={d.key} id={`source-${d.n}`} tabIndex={-1} className="grid grid-cols-[2rem_1fr] gap-x-2 rounded-md py-1 outline-none focus:bg-muted">
              <span className="numeric pt-0.5 text-right font-semibold text-foreground">{d.n}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {tier && <Badge tone={tier.tone}>{tier.text}</Badge>}
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-foreground underline hover:text-sky">{d.name}<span className="sr-only"> (opens in a new tab)</span></a>
                ) : (
                  <span className="text-foreground">{d.name}</span>
                )}
                {d.links?.map((l) => (
                  <span key={`${l.label}|${l.url}`} className="inline-flex items-center gap-1">
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.title} className="inline-flex min-h-11 min-w-11 items-center justify-center underline hover:text-sky">
                        {l.title && <span className="sr-only">{l.title}: </span>}{l.label}<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span title={l.title}>{l.label}</span>
                    )}
                    {l.provisional && <Badge tone="warning">Provisional</Badge>}
                  </span>
                ))}
                {d.note && <span className="basis-full">{d.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
