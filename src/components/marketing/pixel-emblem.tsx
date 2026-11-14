import { cn } from "@/lib/cn";

// Pixel-art emblem for the hero: dithered halo, ring, shaded disc and a green
// medical cross (green, not red: the red cross is a protected emblem).

const N = 44;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type Layer = "halo" | "ring" | "disc" | "shine" | "shadow" | "cross";

function buildPaths() {
  const paths: Record<Layer, string> = { halo: "", ring: "", disc: "", shine: "", shadow: "", cross: "" };
  const c = (N - 1) / 2;
  const R = N / 2;
  const isCross = (dx: number, dy: number) =>
    (Math.abs(dx) <= 2.5 && Math.abs(dy) <= 8.5) || (Math.abs(dy) <= 2.5 && Math.abs(dx) <= 8.5);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy) / R;
      const t = (BAYER[y % 4][x % 4] + 0.5) / 16;
      const px = `M${x} ${y}h1v1h-1z`;
      let layer: Layer | null = null;

      if (d > 1) layer = null;
      else if (d > 0.87) layer = t < ((1 - d) / 0.13) * 0.7 ? "halo" : null;
      else if (d > 0.79) layer = "ring";
      else if (d > 0.73) layer = null;
      else if (isCross(dx, dy)) layer = "cross";
      else if (isCross(dx - 1, dy - 1)) layer = "shadow";
      else {
        // Light from the top-left: denser highlight dither there.
        const light = Math.max(0, (-dx - dy) / (2 * R * 0.73) + 0.15);
        layer = t < light ? "shine" : "disc";
      }
      if (layer) paths[layer] += px;
    }
  }
  return paths;
}

const paths = buildPaths();

export function PixelEmblem({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" className={className} aria-hidden>
      <path d={paths.halo} className={cn("fill-sky/40", animated && "twinkle")} />
      <path d={paths.ring} className="fill-sky" />
      <path d={paths.disc} className="fill-raised" />
      <path d={paths.shine} className="fill-sky/30" />
      <g className={cn(animated && "heartbeat")}>
        <path d={paths.shadow} className="fill-background/70" />
        <path d={paths.cross} className="fill-leaf" />
      </g>
    </svg>
  );
}
