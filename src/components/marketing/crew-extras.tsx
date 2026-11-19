import { Crew } from "./crew";

/** A starfield strip where a crewmate drifts past, spinning. */
export function SpaceBand() {
  const stars = Array.from({ length: 40 }, (_, i) => ({ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 100}%`, delay: `${(i % 11) * 0.3}s` }));
  return (
    <section aria-label="Interlude" className="relative h-48 overflow-hidden border-b border-border bg-black md:h-56">
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
    <div aria-hidden className="pointer-events-none absolute right-10 bottom-full flex gap-3 overflow-hidden md:right-16">
      <div className="peek w-10 md:w-12"><Crew className="w-full text-sky" pack hat="cap" /></div>
      <div className="peek w-10 [animation-delay:0.4s] md:w-12"><Crew className="w-full text-sun" hat="mirror" /></div>
    </div>
  );
}
