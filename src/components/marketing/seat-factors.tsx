import { cn } from "@/lib/cn";
import { Container } from "@/components/layout/container";

const factors = [
  { label: "closing ranks", glyph: "#", bg: "bg-ember", text: "text-ember", body: "Opening and closing ranks by round, quota and category." },
  { label: "clinical exposure", glyph: "+", bg: "bg-sky", text: "text-sky", body: "Beds, patient load and case mix, from residents and records." },
  { label: "fees & bond", glyph: "₹", bg: "bg-sun", text: "text-sun", body: "Tuition, stipend and bond penalty, dated and sourced." },
  { label: "resident life", glyph: "~", bg: "bg-leaf", text: "text-leaf", body: "Duty hours, faculty and hostel, labelled as experiences." },
];

export function SeatFactors() {
  return (
    <section className="border-b border-border">
      <Container className="py-20 md:py-28">
        <div className="relative">
          <h2 className="glow-strong pointer-events-none mb-8 text-center font-pixel text-4xl leading-none md:absolute md:inset-x-0 md:top-[24%] md:z-10 md:mb-0 md:text-7xl">
            what decides your seat?
          </h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {factors.map((f) => (
              <li key={f.label}>
                <div className={cn("halftone relative flex aspect-[3/4] items-end overflow-hidden p-4 rounded-lg", f.bg)} aria-hidden>
                  <span className="font-pixel text-6xl leading-none text-background/45 md:text-7xl">{f.glyph}</span>
                </div>
                <h3 className={cn("mt-4 font-pixel text-lg", f.text)}>{f.label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
