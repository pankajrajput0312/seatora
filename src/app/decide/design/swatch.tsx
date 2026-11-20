"use client";

import { useEffect, useRef, useState } from "react";
import { contrast, tintOf } from "@/features/decide/lib/contrast";
import { cn } from "@/lib/cn";

const WHITE = [255, 255, 255];

/**
 * One colour token (`cls`: its bg- class): a chip of it, the value this page resolves it to (read from the page, so the
 * guide never drifts from globals.css), and for a text colour (`text`) its contrast on white and on its own 10% tint.
 */
export function Swatch({ cls, note, text }: { cls: string; note: string; text?: boolean }) {
  const chip = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState<{ hex: string; white: number; tint: number } | null>(null);
  useEffect(() => {
    const rgb = getComputedStyle(chip.current!).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!rgb) return;
    setV({ hex: `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`, white: contrast(rgb, WHITE), tint: contrast(rgb, tintOf(rgb)) });
  }, []);
  return (
    <li className="flex min-w-0 items-center gap-3 py-2">
      <span ref={chip} aria-hidden className={cn("size-10 shrink-0 rounded-md border border-border", cls)} />
      <span className="min-w-0 text-sm">
        <span className="block font-semibold">{cls.replace("bg-", "")}</span>
        <span className="block text-xs text-muted-foreground">
          {note}
          {v && <> · <span className="font-mono">{v.hex}</span></>}
          {v && text && <> · {v.white.toFixed(1)}:1 on white, {v.tint.toFixed(1)}:1 on its tint</>}
        </span>
      </span>
    </li>
  );
}
