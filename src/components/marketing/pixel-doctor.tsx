import { cn } from "@/lib/cn";

// Seatora's pixel mascot: an original bean-shaped "crew doctor" with a crewmate-style feel (rounded body, stubby
// legs, big glossy visor) but its own identity: a first-aid pack with a cross, a stethoscope, and a surgical cap or
// ENT head mirror. 18×24 grid (3:4, fills a portrait card), drawn in grayscale so the card's multiply tint colours the
// body (red, blue, yellow, green), as on roook.space's portraits. Accessories vary deterministically by seed.

const W = 18;
const H = 24;
type Cell = `${number},${number}`;
const key = (x: number, y: number): Cell => `${x},${y}`;

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function build(seed: string) {
  const h = hash(seed);
  const hat = (["cap", "mirror", "none"] as const)[h % 3];
  const layers: Record<string, Set<Cell>> = {
    body: new Set(), shade: new Set(), visor: new Set(), visorShade: new Set(), glint: new Set(), pack: new Set(), cross: new Set(), steth: new Set(), cap: new Set(), band: new Set(),
  };
  const add = (layer: string, x: number, y: number) => layers[layer].add(key(x, y));

  // Bean body: domed head, straight sides, two stubby legs.
  for (let y = 4; y <= 21; y++) {
    const [x0, x1] = y === 4 ? [7, 12] : y === 5 ? [6, 13] : [5, 14];
    for (let x = x0; x <= x1; x++) {
      if (y >= 19 && (x === 9 || x === 10)) continue; // gap between the legs
      add(x === x1 && y > 5 ? "shade" : "body", x, y);
    }
  }
  // Big rounded visor sticking out past the body on the right, like a crewmate's; lower row shaded, glint top-left.
  for (let y = 7; y <= 11; y++)
    for (let x = 8; x <= 16; x++) {
      if ((x === 8 || x === 16) && (y === 7 || y === 11)) continue;
      add(y === 11 || (y === 10 && x === 16) ? "visorShade" : "visor", x, y);
    }
  [[10, 8], [11, 8], [10, 9]].forEach(([x, y]) => add("glint", x, y));
  // First-aid pack on the back, with a cross.
  for (let y = 10; y <= 17; y++) for (let x = 2; x <= 4; x++) add("pack", x, y);
  [[3, 12], [3, 13], [3, 14], [2, 13], [4, 13]].forEach(([x, y]) => add("cross", x, y));
  // Headwear.
  // Surgical cap: a domed cap sitting on the head, with a tie at the back.
  if (hat === "cap") {
    for (let y = 1; y <= 5; y++) {
      const [x0, x1] = y === 1 ? [8, 11] : y === 2 ? [7, 12] : [6, 13];
      for (let x = x0; x <= x1; x++) add("cap", x, y);
    }
    [[5, 5], [4, 6]].forEach(([x, y]) => add("cap", x, y));
  }
  if (hat === "mirror") {
    for (let x = 6; x <= 13; x++) add("band", x, 6);
    [[8, 4], [9, 4], [8, 5], [9, 5]].forEach(([x, y]) => add("glint", x, y));
  }

  // Outline: every empty cell touching the character.
  const filled = new Set<Cell>(Object.entries(layers).filter(([k]) => k !== "glint" && k !== "cross" && k !== "band").flatMap(([, s]) => [...s]));
  const outline = new Set<Cell>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (filled.has(key(x, y))) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled.has(key(x + dx, y + dy)))) outline.add(key(x, y));
    }
  // Paint order: later layers win where cells overlap.
  const order = ["body", "shade", "pack", "visor", "visorShade", "cap", "band", "cross"];
  const final = new Map<Cell, string>();
  for (const name of order) for (const c of layers[name]) final.set(c, name);
  for (const c of layers.glint) final.set(c, "glint");
  for (const c of outline) final.set(c, "outline");
  const paths: Record<string, string> = {};
  for (const [c, name] of final) {
    const [x, y] = c.split(",").map(Number);
    paths[name] = (paths[name] ?? "") + `M${x} ${y}h1v1h-1z`;
  }
  return { paths, delay: (h % 7) * 0.7 };
}

// Tones under the card's multiply tint: white = full card colour. The visor is the brightest part, like a crewmate's.
const fills: Record<string, string> = {
  outline: "fill-black",
  body: "fill-white/60",
  shade: "fill-white/40",
  pack: "fill-white/45",
  cross: "fill-white",
  visor: "fill-white/95",
  visorShade: "fill-white/70",
  cap: "fill-white/80",
  band: "fill-black/50",
};

export function PixelDoctor({ seed, className }: { seed: string; className?: string }) {
  const { paths, delay } = build(seed);
  return (
    <svg viewBox={`0 -1 ${W} ${H}`} shapeRendering="crispEdges" preserveAspectRatio="xMidYMax meet" className={className} aria-hidden>
      <g className="bob" style={{ animationDelay: `${delay}s` }}>
        {Object.entries(fills).map(([name, cls]) => (paths[name] ? <path key={name} d={paths[name]} className={cls} /> : null))}
        {paths.glint && <path d={paths.glint} className={cn("fill-white", "blink")} style={{ animationDelay: `${delay}s` }} />}
      </g>
    </svg>
  );
}
