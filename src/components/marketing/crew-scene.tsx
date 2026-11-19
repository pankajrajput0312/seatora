"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Crew } from "./crew";

// Hero story on a loop, in pixels: an injured crewmate (bandage, cracked visor, low HP) is lost in counselling;
// a Seatora crew doctor walks in, runs a med-scan, the HP bar fills, and the patient jumps, healed.
// Illustrative only: no claims about specific data. Reduced motion shows the healed end state, still.
const phases = [
  { id: "hurt", ms: 1900, pill: "rank anxiety: critical", done: false },
  { id: "arrive", ms: 1500, pill: "Seatora medic on the way", done: false },
  { id: "scan", ms: 2300, pill: "scanning past closing ranks…", done: false },
  { id: "heal", ms: 1500, pill: "matching colleges to your rank", done: false },
  { id: "celebrate", ms: 2600, pill: "your seat plan is ready", done: true },
] as const;
type PhaseId = (typeof phases)[number]["id"];

const confetti = Array.from({ length: 18 }, (_, i) => ({
  dx: `${Math.round(Math.cos((i / 18) * Math.PI * 2) * (60 + (i % 3) * 25))}px`,
  dy: `${Math.round(Math.sin((i / 18) * Math.PI * 2) * (50 + (i % 4) * 20)) - 40}px`,
  color: ["bg-sky", "bg-leaf", "bg-sun", "bg-ember", "bg-white"][i % 5],
  delay: `${(i % 6) * 0.04}s`,
}));
const stars = Array.from({ length: 22 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 70}%`, delay: `${(i % 9) * 0.35}s`, size: i % 4 === 0 ? "size-1.5" : "size-1" }));

export function CrewScene() {
  const [i, setI] = useState(0);
  const phase = phases[i];
  const at = (id: PhaseId) => phases.findIndex((p) => p.id === id) <= i;
  const healed = at("heal");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setI(phases.length - 1);
    const t = setTimeout(() => setI((n) => (n + 1) % phases.length), phase.ms);
    return () => clearTimeout(t);
  }, [i, phase.ms]);

  const hp = phase.id === "hurt" || phase.id === "arrive" ? 2 : phase.id === "scan" ? 4 : 10;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[540px] overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(ellipse_at_50%_35%,var(--color-muted),var(--color-background)_70%)]" aria-hidden>
      {stars.map((s, n) => <span key={n} className={cn("twinkle absolute bg-white/70", s.size)} style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}

      {/* Patient's HP bar */}
      <div className="absolute top-[14%] right-[13%] flex items-center gap-1.5">
        <span className="font-pixel text-xs text-muted-foreground">HP</span>
        <div className="flex gap-0.5 border-2 border-black bg-black p-0.5">
          {Array.from({ length: 10 }, (_, n) => (
            <span key={n} className={cn("h-3 w-2.5 transition-colors", n < hp ? (hp >= 10 ? "bg-leaf" : hp > 3 ? "bg-sun" : "bg-ember") : "bg-muted")} style={{ transitionDelay: `${n * 90}ms` }} />
          ))}
        </div>
      </div>

      {/* Med-scanner pad under the patient */}
      <div className={cn("absolute bottom-[14%] right-[9%] h-[5%] w-[38%] rounded-[50%] border-2 border-black bg-muted transition-colors duration-300", (phase.id === "scan" || phase.id === "heal") && "bg-leaf/50")} />

      {/* Patient */}
      <div className={cn("absolute right-[12%] bottom-[16%] w-[31%] origin-bottom", !healed && "wobble", phase.id === "celebrate" && "hop")}>
        <Crew className="w-full text-sun" bandage={!healed} crack={!healed} />
        {phase.id === "scan" && <span className="scan-sweep absolute inset-x-[-8%] top-0 h-[10%] bg-leaf/60 shadow-[0_0_16px] shadow-leaf" />}
        {phase.id === "heal" && Array.from({ length: 8 }, (_, n) => (
          <span key={n} className="pixel-rise absolute font-pixel text-xl text-leaf" style={{ left: `${10 + n * 11}%`, top: `${20 + (n % 3) * 15}%`, animationDelay: `${n * 0.07}s` }}>+</span>
        ))}
        {phase.id === "celebrate" && confetti.map((c, n) => (
          <span key={n} className={cn("confetti absolute top-[20%] left-1/2 size-2", c.color)} style={{ "--dx": c.dx, "--dy": c.dy, animationDelay: c.delay } as React.CSSProperties} />
        ))}
      </div>

      {/* Crew doctor: walks in, then scans */}
      <div
        className={cn("absolute bottom-[16%] left-[8%] w-[31%] transition-transform ease-[steps(8)]", phase.id === "celebrate" && "hop [animation-delay:0.15s]")}
        style={{ transform: at("arrive") ? "translateX(0)" : "translateX(-170%)", transitionDuration: at("arrive") && phase.id === "arrive" ? "1300ms" : "0ms" }}
      >
        <Crew className="w-full text-sky" pack hat="cap" walking={phase.id === "arrive"} />
      </div>

      {/* Bubbles */}
      <p key={`ask-${i === 0}`} className="bubble-in absolute top-[5%] left-[5%] max-w-[62%] rounded-2xl rounded-bl-sm bg-white/[0.08] px-4 py-2.5 text-sm text-foreground ring-1 ring-white/10 backdrop-blur">
        AIR 42,284 · OBC · where do I even go?
      </p>
      <p key={`pill-${i}`} className={cn("bubble-in absolute right-[5%] bottom-[4%] flex max-w-[80%] items-center gap-2 rounded-full py-2 pr-4 pl-3 text-sm shadow-overlay", phase.done ? "bg-foreground text-background" : "bg-secondary text-muted-foreground ring-1 ring-input")}>
        <span className={cn("size-1.5 shrink-0 rounded-full", phase.done ? "bg-leaf" : phase.id === "hurt" ? "animate-pulse bg-ember" : "animate-pulse bg-sky")} />
        {phase.pill}
      </p>
    </div>
  );
}
