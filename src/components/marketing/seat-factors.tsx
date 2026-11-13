import { cn } from "@/lib/cn";
import { Container } from "@/components/layout/container";

// Pixel art on a 24×16 grid, drawn in dark ink over each tinted halftone card.
const W = 24;
const H = 16;
type Cells = Array<[number, number]>;

function rect(x: number, y: number, w: number, h: number): Cells {
  const out: Cells = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j]);
  return out;
}

/** Rising bars: closing ranks climbing round by round. */
const ranks: Cells = [4, 7, 10, 13].flatMap((h, i) => rect(1 + i * 6, H - 1 - h, 4, h));

/** ECG trace: clinical exposure. Consecutive points are joined vertically. */
const ecgY = [10, 10, 10, 10, 10, 9, 8, 9, 10, 10, 11, 2, 14, 10, 10, 10, 9, 7, 7, 9, 10, 10, 10, 10];
const ecg: Cells = ecgY.flatMap((y, x) => {
  const prev = ecgY[x - 1] ?? y;
  return rect(x, Math.min(y, prev), 1, Math.abs(y - prev) + 1);
});

/** Coin stacks: fees, stipend and bond. */
const coins: Cells = [2, 4, 5].flatMap((n, i) =>
  Array.from({ length: n }, (_, k) => rect(1 + i * 8, H - 2 - k * 3, 6, 2)).flat(),
);

/** Clock: duty hours and resident life. */
const clock: Cells = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - 11.5, y - 7.5);
    if (d > 6.2 && d < 7.6) clock.push([x, y]);
  }
clock.push(...rect(11, 3, 1, 5), ...rect(12, 7, 4, 1));

const toPath = (cells: Cells) => cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");

const factors = [
  { label: "closing ranks", art: ranks, bg: "bg-ember", text: "text-ember", body: "Opening and closing ranks by round, quota and category." },
  { label: "clinical exposure", art: ecg, bg: "bg-sky", text: "text-sky", body: "Beds, patient load and case mix, from residents and records." },
  { label: "fees & bond", art: coins, bg: "bg-sun", text: "text-sun", body: "Tuition, stipend and bond penalty, dated and sourced." },
  { label: "resident life", art: clock, bg: "bg-leaf", text: "text-leaf", body: "Duty hours, faculty and hostel, labelled as experiences." },
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
                <div className={cn("halftone relative flex aspect-[3/4] items-end overflow-hidden rounded-lg p-4", f.bg)} aria-hidden>
                  <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" className="w-full">
                    <path d={toPath(f.art)} className="fill-background/60" />
                  </svg>
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
