"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { PixelEmblem } from "./pixel-emblem";

// Scripted loop modelled on roook.space's hero: a question arrives, a dim "working" pill steps through
// what Seatora is doing, then flips to a bright result while pixels burst from the emblem.
// Illustrative only: no counts or claims about specific data.
const scenes = [
  { ask: "AIQ rank 12,450 · MD Medicine", work: ["finding hospitals near your rank"], done: "residents you can message" },
  { ask: "who's doing ortho near Pune?", work: ["finding residents there"], done: "say hello on WhatsApp" },
  { ask: "AIQ rank 42,284 · Anaesthesia", work: ["finding hospitals near your rank"], done: "residents you can message" },
];

const ASK_MS = 900;
const WORK_MS = 1500;
const DONE_MS = 2800;

type Phase = { scene: number; step: number }; // step < work.length: working; === work.length: done

export function HeroScene() {
  const [p, setP] = useState<Phase>({ scene: 0, step: -1 });
  const scene = scenes[p.scene];
  const done = p.step === scene.work.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP({ scene: 0, step: scenes[0].work.length });
      return;
    }
    const ms = p.step < 0 ? ASK_MS : done ? DONE_MS : WORK_MS;
    const t = setTimeout(
      () => setP(done ? { scene: (p.scene + 1) % scenes.length, step: -1 } : { scene: p.scene, step: p.step + 1 }),
      ms,
    );
    return () => clearTimeout(t);
  }, [p, done]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden>
      <div className="pixel-field absolute inset-0 opacity-50 [mask-image:radial-gradient(circle,black_35%,transparent_68%)]" />

      {[...Array(7)].map((_, i) => (
        <span
          key={i}
          className="mote absolute size-1.5 bg-sky/70"
          style={{ left: `${18 + ((i * 37) % 64)}%`, top: `${16 + ((i * 53) % 66)}%`, animationDelay: `${i * 0.9}s` } as React.CSSProperties}
        />
      ))}

      <div className="absolute inset-0 grid place-items-center">
        <div className={cn("relative w-[62%] transition-transform duration-500", done && "scale-[1.03]")}>
          <PixelEmblem className="bob w-full" animated />
          {done &&
            [...Array(8)].map((_, i) => (
              <span
                key={`${p.scene}-${i}`}
                className="pixel-rise absolute font-pixel text-lg text-leaf"
                style={{ left: `${30 + ((i * 41) % 42)}%`, top: `${30 + ((i * 29) % 30)}%`, animationDelay: `${i * 0.08}s` }}
              >
                +
              </span>
            ))}
        </div>
      </div>

      <p
        key={`ask-${p.scene}`}
        className="bubble-in absolute top-[8%] left-0 max-w-[78%] rounded-2xl rounded-bl-sm bg-white/[0.08] px-4 py-2.5 text-sm text-foreground ring-1 ring-white/10 backdrop-blur"
      >
        {scene.ask}
      </p>

      {p.step >= 0 && (
        <p
          key={`pill-${p.scene}-${p.step}`}
          className={cn(
            "bubble-in absolute right-0 bottom-[8%] flex max-w-[82%] items-center gap-2 rounded-full py-2 pr-4 pl-3 text-sm shadow-overlay",
            done ? "bg-foreground text-background" : "bg-secondary text-muted-foreground ring-1 ring-input",
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", done ? "bg-leaf" : "animate-pulse bg-sky")} />
          {done ? scene.done : scene.work[p.step]}
        </p>
      )}
    </div>
  );
}
