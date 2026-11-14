/** One orchestrated motion: a thin ECG trace that draws itself once across the page. */
export function EcgLine() {
  const d = "M0 60 H380 l14 -6 10 6 H450 l10 22 16 -78 14 92 12 -36 H620 l18 -10 18 10 H1000 l14 -6 10 6 H1100 l10 22 16 -78 14 92 12 -36 H1300 l18 -10 18 10 H1600";
  return (
    <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="h-24 w-full md:h-32" aria-hidden>
      <path d={d} pathLength={1} className="ecg-draw fill-none stroke-mark" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
