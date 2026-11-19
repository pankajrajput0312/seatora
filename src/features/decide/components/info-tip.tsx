"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const GAP = 6;
const EDGE = 8;

/**
 * Under the button (above it when there is no room below), centred on it and kept inside the window. A table's header
 * pinned by ScrollTable is a copy with its own (i) for this panel: while the copy is pinned, the panel goes under that one.
 */
function placeTip(btn: HTMLElement, p: HTMLElement) {
  const pinned = document.querySelector<HTMLElement>(`[data-stuck] [popovertarget="${btn.getAttribute("popovertarget")}"]`);
  const b = (pinned ?? btn).getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // Before it shows (beforetoggle) it has no box yet: its CSS width, and room below assumed.
  const w = p.offsetWidth || Math.min(320, vw - 16);
  const h = p.offsetHeight;
  const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), vw - w - EDGE);
  const below = b.bottom + GAP;
  const top = h && below + h > vh - EDGE && b.top - GAP - h >= EDGE ? b.top - GAP - h : below;
  // Over the CSS's own placement (the UA's centring, or under the button by anchor positioning).
  p.style.margin = "0";
  p.style.inset = `${top}px auto auto ${Math.max(EDGE, left)}px`;
}

/*
 * One stylesheet for every (i) on the page (React puts it in <head> once, however many tips render): each tip's markup
 * is two short classes, not two long Tailwind strings (a 50-row table has hundreds of tips). In the components layer,
 * so a caller's utilities (`className`, `[&_button]:before:top-0`) still win. The panel has no display rule: it would
 * beat the UA's display:none for a closed popover (fixed already makes it a block). Before placeTip runs (no JS yet) it
 * sits under its button by CSS anchor positioning (the popover's invoker is its implicit anchor; no anchor: the
 * fallbacks centre it), kept inside the window; a browser without anchor positioning keeps the UA's centring.
 * ponytail: hand-written CSS on the theme's tokens; an @utility in globals.css if the design system wants it there.
 */
const CSS = `@layer components{
.tip-i{position:relative;display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;border-radius:9999px;vertical-align:middle;color:var(--color-muted-foreground)}
.tip-i:hover{color:var(--color-sky)}
.tip-i::before{content:"";position:absolute;inset:-.75rem}
.tip-i>svg{width:1rem;height:1rem}
.tip-p{position:fixed;width:min(20rem,calc(100vw - 1rem));max-height:min(24rem,calc(100dvh - 1rem));overflow:auto;padding:.75rem;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-popover);color:var(--color-foreground);box-shadow:var(--shadow-overlay);font-size:var(--text-xs);line-height:var(--leading-relaxed);font-weight:400;text-align:left;white-space:normal;text-transform:none;outline:none}
@supports (top:anchor(bottom)){.tip-p{position-anchor:auto;margin:0;right:auto;bottom:auto;top:calc(anchor(bottom,calc(50% - 6px)) + 6px);left:clamp(.5rem,calc(anchor(center,50%) - min(10rem,50vw - .5rem)),calc(100vw - min(20rem,100vw - 1rem) - .5rem))}}
@media print{.tip-i::before{display:none}}
}`;

/**
 * The tap outside an open (i) that closes it does only that: the click it would make on what is under it (a card's
 * link, the Filters sheet's backdrop) is dropped. Decided at pointerdown (the UA hides the panel at pointerup, before
 * the click), so a scroll gesture (cancelled, no click) or a key press drops nothing. One pair of listeners per page.
 */
let swallow = false;
let guarded = false;
export function outsideTip(target: Element, open: HTMLElement | null) {
  return !!open && !open.contains(target) && !target.closest(`[popovertarget="${open.id}"]`);
}
function guardOutsideTaps() {
  if (guarded) return;
  guarded = true;
  document.addEventListener("pointerdown", (e) => (swallow = e.target instanceof Element && outsideTip(e.target, document.querySelector<HTMLElement>(".tip-p:popover-open"))), true);
  for (const reset of ["pointercancel", "keydown"]) document.addEventListener(reset, () => (swallow = false), true);
  document.addEventListener(
    "click",
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

/**
 * An (i) button with the longer words behind it: a real button named "About <label>". Click, tap, Enter and Space open
 * it (a native popover, so it works before hydration too); Escape, a click outside (only closing it: guardOutsideTaps)
 * or Tab out of it closes it. Focus
 * moves into the panel on open and back to the button on close. Never hover-only. The panel sits in the top layer (a
 * scrolling table never clips it), under the button or above it when there is no room, inside the window at 390px.
 * 44px hit area (`::before`; never on paper, where it would reach past a table box's last row) round a 20px icon. The
 * panel is a <span>, so a tip may sit inside a <p>, a <th> or a link's line: pass phrasing content (text, links,
 * <strong>, <br />, SourceRef), not <p> or <ul>.
 */
/** `more`: the rest of a long explanation, behind a "More" button in the panel (the panel says 1-2 sentences first). */
export function InfoTip({ label, children, more, className }: { label: string; children: React.ReactNode; more?: React.ReactNode; className?: string }) {
  const id = `tip${useId().replace(/[^\w-]/g, "")}`;
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  // Feeds aria-expanded and the scroll/resize follow; the popover itself is the source of truth.
  const [open, setOpen] = useState(false);
  const [rest, setRest] = useState(false);
  useEffect(guardOutsideTaps, []);

  // While open, follow the button when the page or a table scrolls, or the window resizes.
  useEffect(() => {
    if (!open) return;
    const place = () => btn.current && pop.current && placeTip(btn.current, pop.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Tab out of the button or the panel, to anything but the other, closes it: it never covers what she tabbed to.
  const tabOut = (e: React.FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    const p = pop.current;
    if (p?.matches(":popover-open") && to && !p.contains(to) && to !== btn.current) p.hidePopover();
  };

  return (
    <>
      <style href="medpath-info-tip" precedence="medpath">{CSS}</style>
      <button onBlur={tabOut} ref={btn} type="button" popoverTarget={id} aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} className={cn("tip-i", className)}>
        {/* lucide's Info, its attributes trimmed (hundreds per page). */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <span
        ref={pop}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onBeforeToggle={(e) => e.newState === "open" && btn.current && placeTip(btn.current, e.currentTarget)}
        onToggle={(e) => {
          const now = e.newState === "open";
          setOpen(now);
          if (now) {
            if (btn.current) placeTip(btn.current, e.currentTarget);
            pop.current?.focus({ preventScroll: true });
          } else {
            // Escape or a click on nothing focusable: back to the button. A link or field she moved to keeps focus.
            const a = document.activeElement;
            if (!a || a === document.body || pop.current?.contains(a)) btn.current?.focus({ preventScroll: true });
          }
        }}
        onBlur={tabOut}
        className="tip-p"
      >
        {children}
        {more && (rest ? <span className="mt-2 block">{more}</span> : <button type="button" onClick={() => setRest(true)} className="mt-1 block min-h-8 font-semibold text-sky underline">More</button>)}
      </span>
    </>
  );
}
