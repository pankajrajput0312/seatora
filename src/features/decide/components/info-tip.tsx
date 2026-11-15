"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

const GAP = 6;
const EDGE = 8;

/** Under the button (above it when there is no room below), centred on it and kept inside the window. */
function placeTip(btn: HTMLElement, p: HTMLElement) {
  const b = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // Before it shows (beforetoggle) it has no box yet: its CSS width, and room below assumed.
  const w = p.offsetWidth || Math.min(320, vw - 16);
  const h = p.offsetHeight;
  const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), vw - w - EDGE);
  const below = b.bottom + GAP;
  const top = h && below + h > vh - EDGE && b.top - GAP - h >= EDGE ? b.top - GAP - h : below;
  p.style.left = `${Math.max(EDGE, left)}px`;
  p.style.top = `${top}px`;
}

/**
 * An (i) button with the longer words behind it: a real button named "About <label>". Click, tap, Enter and Space open
 * it (a native popover, so it works before hydration too); Escape, a click outside or Tab out of it closes it. Focus
 * moves into the panel on open and back to the button on close. Never hover-only. The panel sits in the top layer (a
 * scrolling table never clips it), under the button or above it when there is no room, inside the window at 390px.
 * 44px hit area round a 20px icon. The panel is a <span>, so a tip may sit inside a <p>, a <th> or a link's line: pass
 * phrasing content (text, links, <strong>, <br />, SourceRef), not <p> or <ul>.
 */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const id = `tip${useId().replace(/[^\w-]/g, "")}`;
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  // Feeds aria-expanded and the scroll/resize follow; the popover itself is the source of truth.
  const [open, setOpen] = useState(false);

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
      <button
        onBlur={tabOut}
        ref={btn}
        type="button"
        popoverTarget={id}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        // The panel's CSS anchor (before hydration, or without JS, it sits under the button: see the panel's classes).
        style={{ anchorName: `--${id}` } as React.CSSProperties}
        className={cn(
          "relative inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-sky",
          // The 44px hit area; never on paper, where it would reach past a table box's last row.
          "before:absolute before:-inset-3 before:content-[''] print:before:hidden",
          className,
        )}
      >
        <Info className="size-4" strokeWidth={2} aria-hidden />
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
        style={{ positionAnchor: `--${id}` } as React.CSSProperties}
        // No display class: it would beat the UA's display:none for a closed popover (fixed already makes it a block).
        // Before placeTip runs (no JS yet): under the button by CSS anchor positioning, kept inside the window; a browser
        // without it drops these and shows it at the window's top left. placeTip's inline left/top win once it runs.
        className={cn(
          "fixed m-0 max-h-[min(24rem,calc(100dvh-1rem))] w-[min(20rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-border bg-popover p-3 text-left text-xs leading-relaxed font-normal whitespace-normal text-foreground normal-case shadow-overlay outline-none",
          "[right:auto] [bottom:auto] [top:calc(anchor(bottom)_+_6px)] [left:clamp(0.5rem,calc(anchor(center)_-_min(10rem,50vw_-_0.5rem)),calc(100vw_-_min(20rem,100vw_-_1rem)_-_0.5rem))]",
        )}
      >
        {children}
      </span>
    </>
  );
}
