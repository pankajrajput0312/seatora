import Link from "next/link";
import { Check, GripVertical } from "lucide-react";

// Three tiles, one line each. Visuals are illustrative shapes, not data.
function StripMini() {
  const dots = [12, 22, 31, 38, 47, 55, 63, 74, 86];
  return (
    <svg viewBox="0 0 220 70" className="w-full" aria-hidden>
      <line x1="0" x2="220" y1="40" y2="40" className="stroke-border" strokeWidth="1" />
      <line x1="108" x2="108" y1="8" y2="62" className="stroke-foreground" strokeWidth="2" />
      {dots.map((x, i) => <circle key={i} cx={x * 2.4} cy="40" r="5" className={x * 2.4 >= 108 ? "fill-mark" : "fill-muted-foreground/40"} />)}
    </svg>
  );
}
function ResidentMini() {
  return (
    <div className="grid w-full gap-2" aria-hidden>
      {["MD Anaesthesiology", "DNB Family Medicine"].map((c, i) => (
        <div key={c} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2"><span className={`size-7 shrink-0 rounded-full ${i ? "bg-sun/30" : "bg-mark/25"}`} />{c}</span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">2025</span>
        </div>
      ))}
    </div>
  );
}
function ListMini() {
  return (
    <ol className="grid w-full gap-1.5 text-sm" aria-hidden>
      {[1, 2, 3].map((n) => (
        <li key={n} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
          <GripVertical className="size-4 text-muted-foreground" />
          <span className="w-4 font-bold">{n}</span>
          <span className="h-2 flex-1 rounded-full bg-muted" />
          {n < 3 && <Check className="size-4 text-leaf" />}
        </li>
      ))}
    </ol>
  );
}

const tiles = [
  { title: "See where your rank lands", body: "Every college and course, against last years' closing ranks.", href: "/decide/options", visual: <StripMini /> },
  { title: "See who's there", body: "Residents' names, course and year, from MCC's admitted lists.", href: "/#preview", visual: <ResidentMini /> },
  { title: "Fill choices with confidence", body: "Order your list and copy it straight into MCC.", href: "/decide/choices", visual: <ListMini /> },
];

export function Tiles() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.title}>
          <Link href={t.href} className="group flex h-full flex-col rounded-[1.5rem] border border-border bg-background p-6 transition-colors hover:border-foreground/30">
            <div className="flex h-36 items-center">{t.visual}</div>
            <h3 className="mt-6 text-xl font-bold tracking-tight">{t.title}</h3>
            <p className="mt-1.5 text-muted-foreground">{t.body}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
