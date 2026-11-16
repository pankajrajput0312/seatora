"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useLocal } from "../lib/local-store";

// A wide table that never traps the finger: the page is the one vertical scroller (the box scrolls sideways only), and
// a copy of the header row stays pinned under the app's top bar while the page scrolls past the table. CSS sticky
// can't leave a sideways-scrolling box, so the copy sits outside it: a separate table, each header cell sized from the
// real one (ResizeObserver), scrolled sideways with the body both ways. The real <thead> stays in the table for screen
// readers; the copy is aria-hidden and out of the tab order, and a click on its links and buttons is the real one's.

/** The app's top bar height (plus any bar pinned under it, `data-app-top`) as --app-top on <html>: one observer a page. */
let topBars: ResizeObserver | null = null;
const BARS = ".app .astryx-app-shell-header, .app [data-app-top]";
function watchAppTop() {
  if (topBars) return;
  const set = () => {
    const h = [...document.querySelectorAll<HTMLElement>(BARS)].reduce((a, e) => a + e.offsetHeight, 0);
    document.documentElement.style.setProperty("--app-top", `${h}px`);
  };
  topBars = new ResizeObserver(set);
  document.querySelectorAll(BARS).forEach((e) => topBars!.observe(e));
  set();
}

/** What a click in the header copy is forwarded for (the same index in the real header). */
const CONTROLS = "a, button, summary, input, select, label";
const FRAME = "rounded-xl border border-border bg-card";

/**
 * `label`: the scrolling box's name (it is a focusable region, so arrow keys scroll it). `id`: on that box. `scope`: a
 * name on the whole thing (`data-scroll-table`), for CSS that must reach the header copy too (Display's hidden columns).
 * `className`: the frame (default: the ruled card); `scrollClassName`: the box's scroll-padding, so a focused cell clears
 * a sticky first column.
 */
export function ScrollTable({ label, id, scope, className = FRAME, scrollClassName, children }: {
  label: string;
  id?: string;
  scope?: string;
  className?: string;
  scrollClassName?: string;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const headBox = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useLocal("medpath.swipe-seen", false);

  useEffect(() => {
    const o = outer.current!, p = pin.current!, hb = headBox.current!, b = body.current!;
    watchAppTop();
    let table: HTMLTableElement | null = null;
    let copy: HTMLTableElement | null = null;
    let from: HTMLElement | null = null; // the thead copied
    const sizes = new ResizeObserver(() => measure());

    const edges = () => {
      const max = b.scrollWidth - b.clientWidth;
      o.toggleAttribute("data-more-left", b.scrollLeft > 1);
      o.toggleAttribute("data-more-right", b.scrollLeft < max - 1);
    };
    // Pinned once the real header has gone up under the top bar (the copy, at rest exactly over it, stays hidden until then).
    const stuck = () => {
      const h = table?.tHead;
      p.toggleAttribute("data-stuck", !!h && p.getBoundingClientRect().top > h.getBoundingClientRect().top + 1);
    };
    const measure = () => {
      const h = table?.tHead;
      if (!table || !h || !copy) return;
      copy.style.width = copy.style.minWidth = `${table.getBoundingClientRect().width}px`;
      const mine = copy.tHead!.querySelectorAll<HTMLElement>("th, td");
      h.querySelectorAll("th, td").forEach((c, i) => {
        const s = mine[i]?.style;
        if (s) s.width = s.minWidth = s.maxWidth = `${c.getBoundingClientRect().width}px`;
      });
      const height = h.getBoundingClientRect().height;
      p.style.height = `${height}px`;
      p.style.marginBottom = `${-height}px`;
      o.style.setProperty("--head-h", `${height}px`);
      // The sticky first column's right edge: the left shadow starts there.
      const left = b.getBoundingClientRect().left;
      const pinned = [...h.rows[0].cells].filter((c) => getComputedStyle(c).position === "sticky");
      o.style.setProperty("--stick-w", `${Math.max(0, ...pinned.map((c) => c.getBoundingClientRect().right - left))}px`);
      hb.scrollLeft = b.scrollLeft;
      edges();
      stuck();
    };
    const build = () => {
      const t = b.querySelector("table");
      if (t !== table) {
        if (table) sizes.unobserve(table);
        table = t;
        if (table) sizes.observe(table);
      }
      from = table?.tHead ?? null;
      if (!table?.tHead) return hb.replaceChildren();
      copy = document.createElement("table");
      copy.className = table.className;
      copy.style.contain = "paint"; // as the body's table (below)
      table.querySelectorAll(":scope > colgroup").forEach((c) => copy!.append(c.cloneNode(true)));
      const h = table.tHead.cloneNode(true) as HTMLElement;
      // No duplicate ids, no second copy of an (i)'s panel (the copy's (i) opens the real one: popovertarget stays).
      h.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      h.querySelectorAll("[popover]").forEach((e) => e.remove());
      h.querySelectorAll<HTMLElement>(`${CONTROLS}, [tabindex]`).forEach((e) => (e.tabIndex = -1));
      copy.append(h);
      hb.replaceChildren(copy);
      measure();
    };

    let frame = 0;
    // The header changed (a client re-render, a sort link) or the table was replaced: copy again. Not for an (i)'s
    // panel being placed (it moves with every scroll while open); a size change is the ResizeObserver's.
    const changes = new MutationObserver((records) => {
      const head = table?.tHead;
      const inHead = (n: Node) => {
        const el = n instanceof Element ? n : n.parentElement;
        return !!head && head.contains(n) && !el?.closest("[popover]");
      };
      if (b.querySelector("table") !== table || table?.tHead !== from || records.some((r) => inHead(r.target))) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(build);
      }
    });
    changes.observe(b, { subtree: true, childList: true, attributes: true, characterData: true });
    sizes.observe(b);

    const fromBody = () => {
      if (Math.abs(hb.scrollLeft - b.scrollLeft) > 0.5) hb.scrollLeft = b.scrollLeft;
      if (!seen && b.scrollLeft > 1) setSeen(true);
      edges();
    };
    const fromHead = () => {
      if (Math.abs(b.scrollLeft - hb.scrollLeft) > 0.5) b.scrollLeft = hb.scrollLeft;
    };
    b.addEventListener("scroll", fromBody, { passive: true });
    hb.addEventListener("scroll", fromHead, { passive: true });
    window.addEventListener("scroll", stuck, { passive: true });
    build();
    return () => {
      cancelAnimationFrame(frame);
      changes.disconnect();
      sizes.disconnect();
      b.removeEventListener("scroll", fromBody);
      hb.removeEventListener("scroll", fromHead);
      window.removeEventListener("scroll", stuck);
    };
  }, [seen, setSeen]);

  // A click on the copy's link or button is the real one's (its href, its handler, its next/link navigation). An (i)
  // keeps its popovertarget and opens the real panel itself (InfoTip places it under the copy's button).
  const forward = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest(CONTROLS);
    const real = body.current?.querySelector("table")?.tHead;
    if (!t || !real || t.hasAttribute("popovertarget")) return;
    const i = [...headBox.current!.querySelectorAll(CONTROLS)].indexOf(t);
    const to = real.querySelectorAll<HTMLElement>(CONTROLS)[i];
    if (!to) return;
    e.preventDefault();
    to.click();
  };

  return (
    // min-w-0: in a grid or flex row the box takes the row's width, not the table's (the table scrolls inside it).
    <div ref={outer} data-scroll-table={scope ?? ""} className={cn("group/st relative min-w-0", className)}>
      {/* The pinned header copy: sticky to the page under the top bar, hidden until the real header scrolls up under it. */}
      <div
        ref={pin}
        aria-hidden
        onClick={forward}
        className="invisible sticky top-[var(--app-top,0px)] z-[5] bg-card data-[stuck]:visible data-[stuck]:shadow-[0_2px_4px_-2px_rgb(0_0_0/0.18)] print:hidden"
      >
        <div ref={headBox} className="overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
      </div>
      {/* contain:paint on the table: a 44px hit area or (i) target reaching past its edge doesn't make a table that fits
          scroll a few pixels sideways (or show the edge shadow and "Swipe for more"). */}
      <div ref={body} id={id} role="region" aria-label={label} tabIndex={0} className={cn("overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-px-12 print:overflow-visible [&>table]:[contain:paint] print:[&>table]:[contain:none]", scrollClassName)}>
        {children}
      </div>
      {/* More columns off to a side: a soft shadow on that edge (the left one at the sticky column's edge). */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-[var(--stick-w,0px)] z-[6] w-4 bg-linear-to-r from-foreground/12 to-transparent opacity-0 group-data-[more-left]/st:opacity-100 motion-safe:transition-opacity print:hidden" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-[6] w-5 rounded-r-xl bg-linear-to-l from-foreground/12 to-transparent opacity-0 group-data-[more-right]/st:opacity-100 motion-safe:transition-opacity print:hidden" />
      {!seen && (
        <span aria-hidden className="pointer-events-none absolute top-[calc(var(--head-h,2.5rem)+0.5rem)] right-2 z-[6] hidden rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow-overlay group-data-[more-right]/st:block print:hidden">
          <span className="pointer-coarse:hidden">Scroll sideways for more →</span>
          <span className="pointer-fine:hidden">Swipe for more →</span>
        </span>
      )}
    </div>
  );
}
