import { cn } from "@/lib/cn";

// Pixel-art doctor bust on a 24×24 grid (cropped to 3:4 to fill a portrait card), drawn in grayscale so a multiply tint above it turns it duotone
// (the same trick roook.space uses on its portraits). Hair, glasses and pen vary deterministically by seed.

type Cells = Array<[number, number]>;
const rect = (x: number, y: number, w: number, h: number): Cells => {
  const out: Cells = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j]);
  return out;
};
const without = (cells: Cells, drop: Cells) => cells.filter(([x, y]) => !drop.some(([a, b]) => a === x && b === y));
const path = (cells: Cells) => cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const hairStyles: Record<string, Cells> = {
  short: [...without(rect(7, 4, 10, 3), [[7, 4], [16, 4]]), ...rect(7, 7, 1, 3), ...rect(16, 7, 1, 3)],
  long: [...without(rect(7, 4, 10, 3), [[7, 4], [16, 4]]), ...rect(6, 7, 2, 9), ...rect(16, 7, 2, 9)],
  bun: [...without(rect(10, 1, 4, 3), [[10, 1], [13, 1]]), ...without(rect(7, 4, 10, 3), [[7, 4], [16, 4]]), ...rect(7, 7, 1, 2), ...rect(16, 7, 1, 2)],
  cap: [...without(rect(7, 3, 10, 4), [[7, 3], [16, 3]]), ...rect(17, 6, 1, 2)],
};

export function PixelDoctor({ seed, className }: { seed: string; className?: string }) {
  const h = hash(seed);
  const hair = hairStyles[Object.keys(hairStyles)[h % 4]];
  const glasses = (h >> 3) % 2 === 0;
  const pen = (h >> 5) % 2 === 0;

  const face = [...without(rect(8, 7, 8, 8), [[8, 7], [15, 7], [8, 14], [15, 14]]), ...rect(10, 15, 4, 2)];
  const shade = [...rect(15, 9, 1, 5), [11, 12], [12, 12]] as Cells; // cheek shadow + mouth
  const coat = [...rect(5, 17, 14, 1), ...rect(3, 18, 18, 6)];
  const scrubs: Cells = [...rect(10, 17, 4, 1), ...rect(10, 18, 4, 1), ...rect(11, 19, 2, 1)];
  const lapels: Cells = [[9, 17], [9, 18], [10, 19], [11, 20], [14, 17], [14, 18], [13, 19], [12, 20]];
  const stethoscope: Cells = [...rect(8, 18, 1, 3), ...rect(15, 18, 1, 3), ...rect(9, 21, 6, 1), ...rect(11, 22, 2, 2)];
  const frames: Cells = glasses ? [...without(rect(9, 9, 3, 3), [[10, 10]]), ...without(rect(12, 9, 3, 3), [[13, 10]])] : [];
  const penCells: Cells = pen ? rect(17, 19, 1, 3) : [];

  return (
    <svg viewBox="3 1 18 24" shapeRendering="crispEdges" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <path d={path(face)} className="fill-white" />
      <path d={path(shade)} className="fill-black/25" />
      <path d={path(without(without(coat, scrubs), lapels))} className="fill-white" />
      <path d={path(scrubs)} className="fill-black/55" />
      <path d={path([...hair, ...lapels, ...stethoscope, ...penCells])} className="fill-black" />
      <path d={path(frames)} className="fill-black/45" />
      <path d={path([[10, 10], [13, 10]])} className={cn("fill-black", "blink")} style={{ animationDelay: `${(h % 7) * 0.7}s` }} />
    </svg>
  );
}
