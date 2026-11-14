import { cn } from "@/lib/cn";

// Colour pixel sprites of Seatora's "crew" (original bean-shaped characters with a crewmate-style feel), used for the
// landing-page animations. 18×24 grid, facing right. Body colour comes from `text-*` on the sprite (fill-current).

const W = 18;
const H = 24;
type Cell = `${number},${number}`;
const k = (x: number, y: number): Cell => `${x},${y}`;

export type CrewOpts = { pack?: boolean; hat?: "cap" | "mirror" | "none"; bandage?: boolean; crack?: boolean; legs?: "stand" | "a" | "b" };

function cells(o: CrewOpts) {
  const L: Record<string, Set<Cell>> = {};
  const add = (n: string, x: number, y: number) => (L[n] ??= new Set()).add(k(x, y));
  for (let y = 4; y <= 18; y++) {
    const [x0, x1] = y === 4 ? [7, 12] : y === 5 ? [6, 13] : [5, 14];
    for (let x = x0; x <= x1; x++) add(x === x1 && y > 5 ? "shade" : "body", x, y);
  }
  const legs = o.legs ?? "stand";
  const [l0, r0] = legs === "a" ? [4, 12] : legs === "b" ? [6, 10] : [5, 11];
  for (let y = 19; y <= 21; y++) for (let i = 0; i < 4; i++) { add("body", l0 + i, y); add(i === 3 ? "shade" : "body", r0 + i, y); }
  for (let y = 7; y <= 11; y++)
    for (let x = 8; x <= 16; x++) {
      if ((x === 8 || x === 16) && (y === 7 || y === 11)) continue;
      add(y === 11 ? "visorShade" : "visor", x, y);
    }
  [[10, 8], [11, 8], [10, 9]].forEach(([x, y]) => add("glint", x, y));
  if (o.pack) {
    for (let y = 10; y <= 17; y++) for (let x = 2; x <= 4; x++) add("pack", x, y);
    [[3, 12], [3, 13], [3, 14], [2, 13], [4, 13]].forEach(([x, y]) => add("cross", x, y));
  }
  if (o.hat === "cap") {
    for (let y = 1; y <= 5; y++) {
      const [a, b] = y === 1 ? [8, 11] : y === 2 ? [7, 12] : [6, 13];
      for (let x = a; x <= b; x++) add("cap", x, y);
    }
  }
  if (o.hat === "mirror") {
    for (let x = 6; x <= 13; x++) add("band", x, 6);
    [[8, 4], [9, 4], [8, 5], [9, 5]].forEach(([x, y]) => add("glint", x, y));
  }
  if (o.bandage) {
    for (let x = 6; x <= 13; x++) add("bandage", x, 5);
    for (let x = 7; x <= 12; x++) add("bandage", x, 4);
    add("bandageCross", 9, 4); add("bandageCross", 9, 5); add("bandageCross", 10, 4);
  }
  if (o.crack) [[12, 8], [13, 9], [13, 10], [14, 10], [15, 9]].forEach(([x, y]) => add("crack", x, y));

  const solid = new Set<Cell>(["body", "shade", "visor", "visorShade", "pack", "cap"].flatMap((n) => [...(L[n] ?? [])]));
  const outline = new Set<Cell>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!solid.has(k(x, y)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid.has(k(x + dx, y + dy)))) outline.add(k(x, y));
  const order = ["body", "shade", "pack", "visor", "visorShade", "cap", "band", "bandage", "bandageCross", "crack", "cross", "glint"];
  const final = new Map<Cell, string>();
  for (const n of order) for (const c of L[n] ?? []) final.set(c, n);
  for (const c of outline) final.set(c, "outline");
  const paths: Record<string, string> = {};
  for (const [c, n] of final) {
    const [x, y] = c.split(",");
    paths[n] = (paths[n] ?? "") + `M${x} ${y}h1v1h-1z`;
  }
  return paths;
}

const fills: Record<string, string> = {
  body: "fill-current",
  shade: "fill-current",
  pack: "fill-current",
  outline: "fill-black",
  visor: "fill-mist",
  visorShade: "fill-mist/60",
  glint: "fill-white",
  cap: "fill-mist",
  band: "fill-black/60",
  bandage: "fill-white",
  bandageCross: "fill-ember",
  crack: "fill-black/70",
  cross: "fill-white",
};
// Darken overlays drawn over shade and pack cells for depth.
const overlays: Record<string, string> = { shade: "fill-black/30", pack: "fill-black/40" };

function Frame({ o, className }: { o: CrewOpts; className?: string }) {
  const p = cells(o);
  return (
    <g className={className}>
      {Object.entries(fills).map(([n, cls]) => (p[n] ? <path key={n} d={p[n]} className={cls} /> : null))}
      {Object.entries(overlays).map(([n, cls]) => (p[n] ? <path key={`o-${n}`} d={p[n]} className={cls} /> : null))}
    </g>
  );
}

/** A crew sprite. `walking` alternates two leg frames with a stepped animation. */
export function Crew({ className, walking, flip, ...o }: CrewOpts & { className?: string; walking?: boolean; flip?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" className={cn("overflow-visible", className)} aria-hidden>
      <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
        {walking ? (
          <>
            <Frame o={{ ...o, legs: "a" }} className="walk-a" />
            <Frame o={{ ...o, legs: "b" }} className="walk-b" />
          </>
        ) : (
          <Frame o={o} />
        )}
      </g>
    </svg>
  );
}
