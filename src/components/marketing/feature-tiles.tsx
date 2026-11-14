import { Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";

// Sample figures for illustration; the section is labelled "Sample screens".

function Tile({ title, caption, className, children }: { title: string; caption: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-card p-5", className)}>
      <div className="flex-1">{children}</div>
      <h3 className="mt-5 text-base font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

const rounds = ["R1", "R2", "R3", "Stray"];
const series = [
  { name: "Government", values: [6800, 8200, 9100, 10400], stroke: "stroke-foreground", fill: "fill-foreground", dot: "bg-foreground" },
  { name: "Deemed", values: [14200, 18900, 22600, 27500], stroke: "stroke-sky", fill: "fill-sky", dot: "bg-sky" },
];

function RanksChart() {
  const W = 320, H = 140, P = 8, max = 30000;
  const x = (i: number) => P + (i * (W - 2 * P)) / (rounds.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
        {[0, 10000, 20000, 30000].map((v) => (
          <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} className={cn("fill-none", s.stroke)} strokeWidth={2} />
            {s.values.map((v, i) => <rect key={i} x={x(i) - 3} y={y(v) - 3} width={6} height={6} className={s.fill} />)}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {rounds.map((r) => <span key={r}>{r}</span>)}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5"><span className={cn("size-2", s.dot)} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}

const specialties = ["Medicine", "Surgery", "Paediatrics", "Radiology", "OBG"];
const categories = ["GEN", "EWS", "OBC", "SC", "ST"];
const seats = [[9, 3, 6, 4, 2], [8, 2, 5, 3, 1], [6, 2, 4, 2, 1], [4, 1, 3, 2, 1], [7, 2, 5, 3, 1]];

function SeatGrid() {
  return (
    <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-xs">
      <span />
      {categories.map((c) => <span key={c} className="text-center font-mono text-muted-foreground">{c}</span>)}
      {specialties.map((s, i) => (
        <div key={s} className="contents">
          <span className="pr-2 text-muted-foreground">{s}</span>
          {seats[i].map((n, j) => (
            <span key={j} className={cn("numeric grid aspect-square place-items-center", n >= 3 ? "text-background" : "text-foreground")}
              style={{ backgroundColor: `color-mix(in oklch, var(--color-sky) ${15 + (n / 9) * 85}%, transparent)` }}>
              {n}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const money = [
  { label: "Tuition / yr", value: 78000, max: 100000, cls: "bg-foreground" },
  { label: "Stipend / mo", value: 92000, max: 100000, cls: "bg-leaf" },
  { label: "Bond penalty", value: 1000000, max: 2500000, cls: "bg-sun" },
];

function MoneyBars() {
  return (
    <ul className="grid gap-3">
      {money.map((m) => (
        <li key={m.label}>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{m.label}</span>
            <span className="numeric">{formatINR(m.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 bg-muted">
            <div className={cn("h-full", m.cls)} style={{ width: `${(m.value / m.max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const residentRows = [["Resident A", "MD Medicine", 8240], ["Resident B", "MS Surgery", 9105], ["Resident C", "MD Paediatrics", 11870]] as const;

function ResidentsMini() {
  return (
    <ul className="grid gap-2 text-xs">
      {residentRows.map(([name, course, rank]) => (
        <li key={name} className="flex items-center justify-between gap-3">
          <span>{name} <span className="text-muted-foreground">· {course} · 2025</span></span>
          <span className="numeric font-mono text-muted-foreground">AIR {formatRank(rank)}</span>
        </li>
      ))}
    </ul>
  );
}

const compareRows = [
  { label: "Closing R2", a: formatRank(8240), b: formatRank(12900), better: "a" },
  { label: "Annual fee", a: formatINR(52000), b: formatINR(78000), better: "a" },
  { label: "Stipend", a: formatINR(85000), b: formatINR(92000), better: "b" },
  { label: "Bond", a: "2 yrs", b: "1 yr", better: "b" },
] as const;

function CompareMini() {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <th className="pb-2 text-left font-normal"><span className="sr-only">Measure</span></th>
          <th className="pb-2 text-right font-normal">College A</th>
          <th className="pb-2 text-right font-normal">College B</th>
        </tr>
      </thead>
      <tbody>
        {compareRows.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <td className="py-1.5 text-muted-foreground">{r.label}</td>
            <td className={cn("numeric py-1.5 text-right", r.better === "a" && "text-leaf")}>{r.a}</td>
            <td className={cn("numeric py-1.5 text-right", r.better === "b" && "text-leaf")}>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InstituteMini() {
  return (
    <div>
      <p className="text-sm font-medium">Sample college profile</p>
      <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">City · State · Est. 1960</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>Government</Badge>
        <Badge>Sample</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Beds", "1,800"], ["PG seats", "142"], ["Specialties", "21"]].map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted py-2">
            <dd className="numeric font-pixel text-lg">{v}</dd>
            <dt className="text-xs text-muted-foreground">{k}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

const shortlist = [["College A · Medicine", "bg-leaf"], ["College B · Medicine", "bg-leaf"], ["College C · Paediatrics", "bg-sun"], ["College D · Medicine", "bg-ember"]] as const;

function ShortlistMini() {
  return (
    <ol className="grid gap-1.5">
      {shortlist.map(([name, dot], i) => (
        <li key={name} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="numeric font-mono text-muted-foreground">{i + 1}</span>
          <span className="flex-1">{name}</span>
          <span className={cn("size-1.5 rounded-full", dot)} />
        </li>
      ))}
    </ol>
  );
}

const steps = [
  { label: "Registration", state: "done" },
  { label: "Choice filling R1", state: "done" },
  { label: "R1 result", state: "done" },
  { label: "Choice filling R2", state: "next" },
  { label: "R2 result", state: "todo" },
  { label: "Round 3", state: "todo" },
  { label: "Stray vacancy", state: "todo" },
] as const;

function TrackerMini() {
  return (
    <ol className="grid gap-2 sm:grid-cols-7 sm:gap-1">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2">
          <span className={cn("h-1.5 w-6 shrink-0 sm:w-auto", s.state === "done" ? "bg-foreground" : s.state === "next" ? "animate-pulse bg-sky" : "bg-muted")} />
          <span className={cn("flex items-start gap-1 text-xs leading-tight", s.state === "todo" ? "text-muted-foreground" : s.state === "next" ? "text-sky" : "")}>
            {s.state === "done" && <Check className="mt-px size-3 shrink-0" aria-hidden />}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function FeatureTiles() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile title="Previous-year ranks" caption="Closing ranks by round, quota and category." className="sm:col-span-2"><RanksChart /></Tile>
      <Tile title="Seat matrix" caption="Seats per specialty and category."><SeatGrid /></Tile>
      <Tile title="Fees, stipend, bond" caption="Dated and sourced, side by side."><MoneyBars /></Tile>
      <Tile title="Residents" caption="Name, course, year and 2025 AIR, from MCC's lists."><ResidentsMini /></Tile>
      <Tile title="Compare" caption="Differences highlighted, not buried."><CompareMini /></Tile>
      <Tile title="Institutes" caption="Every PG college, one profile each."><InstituteMini /></Tile>
      <Tile title="Shortlist & choice filling" caption="Order choices with history beside each."><ShortlistMini /></Tile>
      <Tile title="Counselling tracker" caption="Every round across MCC and state counselling, in order." className="sm:col-span-2 lg:col-span-4"><TrackerMini /></Tile>
    </div>
  );
}
