import { Crew } from "./crew";

/**
 * Among Us-style "total tasks completed" bar: fills as you scroll the page (pure CSS scroll timeline). data-nosnippet here and
 * on the other decorations: Google once quoted this bar as the home page's search snippet.
 */
export function TaskBar() {
  return (
    <div aria-hidden data-nosnippet className="pointer-events-none fixed top-[4.75rem] left-4 z-30 hidden w-60 rounded-md border border-border bg-background/90 p-2.5 shadow-overlay backdrop-blur-md xl:block">
      <p className="mb-1.5 font-pixel text-xs text-foreground">Counselling tasks completed</p>
      <div className="h-3 border-2 border-black bg-muted/90">
        <div className="task-fill h-full bg-leaf" />
      </div>
    </div>
  );
}

/** A starfield strip where a crewmate drifts past, spinning. */
export function SpaceBand() {
  const stars = Array.from({ length: 40 }, (_, i) => ({ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 100}%`, delay: `${(i % 11) * 0.3}s` }));
  return (
    <section aria-label="Interlude" data-nosnippet className="relative h-48 overflow-hidden border-b border-border bg-black md:h-56">
      {stars.map((s, i) => <span key={i} className="twinkle absolute size-1 bg-white/60" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
      <div className="drift-across absolute top-[28%] left-0 w-14 md:w-16">
        <Crew className="w-full text-ember" />
      </div>
      <p className="absolute inset-x-0 bottom-8 text-center font-pixel text-lg text-white/90 md:text-2xl">Rank anxiety, sorted.</p>
    </section>
  );
}

/** Two crewmates peeking over the top edge of a card. */
export function PeekingCrew() {
  return (
    <div aria-hidden data-nosnippet className="pointer-events-none absolute right-10 bottom-full flex gap-3 overflow-hidden md:right-16">
      <div className="peek w-10 md:w-12"><Crew className="w-full text-sky" pack hat="cap" /></div>
      <div className="peek w-10 [animation-delay:0.4s] md:w-12"><Crew className="w-full text-sun" hat="mirror" /></div>
    </div>
  );
}
