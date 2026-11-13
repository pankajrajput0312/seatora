// 7×7 pixel cross in a ring; same motif as the hero emblem and the favicon.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" className={className} aria-hidden>
      <path className="fill-sky" d="M2 0h5v1H2zM1 1h1v1H1zM7 1h1v1H7zM0 2h1v5H0zM8 2h1v5H8zM1 7h1v1H1zM7 7h1v1H7zM2 8h5v1H2z" />
      <path className="fill-leaf" d="M4 2h1v5H4zM2 4h5v1H2z" />
    </svg>
  );
}
