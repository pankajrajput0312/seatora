import { cn } from "@/lib/cn";

// Questions aspirants ask during counselling. Prompts only, not data claims.
const rows = [
  ["which colleges closed near my rank last year?", "is the bond worth the stipend?", "MD or MS with this rank?", "how heavy is the patient load?"],
  ["AIQ or state quota first?", "what changed between round 1 and round 2?", "deemed fees vs government stipend", "what opens up in round 3?"],
  ["hostel and duty hours?", "how is the faculty in radiology?", "seat matrix for my category", "when does choice filling close?"],
];

export function QuestionMarquee() {
  return (
    <section aria-label="Questions MEDPATH helps answer" className="mask-x overflow-hidden border-b border-border py-10">
      <ul className="sr-only">{rows.flat().map((q) => <li key={q}>{q}</li>)}</ul>
      {rows.map((row, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "flex w-max py-3 whitespace-nowrap",
            i === 1 ? "marquee text-3xl md:text-4xl" : "marquee-slow text-lg text-muted-foreground opacity-50 blur-[1.5px]",
            i === 2 && "[animation-direction:reverse]",
          )}
        >
          {[...row, ...row, ...row, ...row].map((q, j) => <span key={j} className="pr-16">{q}</span>)}
        </div>
      ))}
    </section>
  );
}
