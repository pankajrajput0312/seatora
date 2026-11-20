import { cn } from "@/lib/cn";
import { Crew } from "./crew";

// Questions aspirants ask during counselling, residents first. Prompts only, not data claims.
const rows = [
  ["who's already doing MD anaesthesia there?", "which colleges closed near my rank last year?", "is the bond worth the stipend?", "MD or DNB with this rank?"],
  ["which residents joined from my rank?", "deemed fees vs government stipend", "what opens up in round 3?", "who are the 2025 residents at AIIMS-type colleges?"],
  ["seat matrix for my category", "how heavy is the patient load?", "leaving penalty if I upgrade?", "when does choice filling close?"],
];

export function QuestionMarquee() {
  return (
    <section aria-label="Questions Seatora helps answer" data-nosnippet className="mask-x relative overflow-hidden border-b border-border py-10">
      <ul className="sr-only">{rows.flat().map((q) => <li key={q}>{q}</li>)}</ul>
      {rows.map((row, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "flex w-max py-3 whitespace-nowrap",
            i === 1 ? "marquee text-2xl md:text-4xl" : "marquee-slow text-base text-muted-foreground opacity-50 blur-[1.5px] md:text-lg",
            i === 2 && "[animation-direction:reverse]",
          )}
        >
          {[...row, ...row, ...row, ...row].map((q, j) => <span key={j} className="pr-16">{q}</span>)}
        </div>
      ))}
      {/* A crewmate walking across the bottom of the band. */}
      <div aria-hidden className="pointer-events-none absolute bottom-1 left-0 w-8 walk-across">
        <Crew className="w-full text-leaf" pack walking />
      </div>
    </section>
  );
}
