import Link from "next/link";
import { Check, ChevronDown, ChevronUp, GripVertical } from "lucide-react";

// Tool cards for the /v2 home. Previews are illustrative shapes and generic labels, never data.
const bar = "h-2 rounded-full bg-border";

function ResidentsPreview() {
  return (
    <div className="grid w-full max-w-60 gap-2.5">
      {[["w-3/4", 2025], ["w-1/2", 2024], ["w-2/3", 2023]].map(([w, year]) => (
        <div key={year} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
          <span className="size-6 shrink-0 rounded-full bg-muted" />
          <span className="min-w-0 flex-1"><span className={`block ${bar} ${w}`} /></span>
          <span className="numeric text-xs text-muted-foreground">{year}</span>
        </div>
      ))}
    </div>
  );
}

function OptionsPreview() {
  const dots = [8, 19, 27, 36, 44, 58, 66, 79, 90];
  return (
    <div className="relative w-full max-w-64 pt-6">
      <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Your rank</span>
      <div className="relative h-14">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-foreground" />
        {dots.map((x) => (
          <span key={x} style={{ left: `${x}%` }} className={`absolute top-1/2 size-3 -translate-1/2 rounded-full ring-2 ring-card ${x > 50 ? "bg-foreground" : "bg-border"}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>Closed before</span><span>Reached</span></div>
    </div>
  );
}

function ChoicesPreview() {
  return (
    <ol className="grid w-full max-w-60 gap-1.5">
      {["w-3/4", "w-1/2", "w-2/3"].map((w, i) => (
        <li key={w} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <GripVertical className="size-4 text-muted-foreground" />
          <span className="numeric w-3 text-sm font-bold">{i + 1}</span>
          <span className="min-w-0 flex-1"><span className={`block ${bar} ${w}`} /></span>
          {i === 0 && <span className="flex text-muted-foreground"><ChevronUp className="size-4" /><ChevronDown className="size-4" /></span>}
        </li>
      ))}
    </ol>
  );
}

function SeatsPreview() {
  const cells = "CCVCCVCCVCCV".split("");
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c, i) => (
          <span key={i} className={`size-6 rounded ${c === "C" ? "bg-foreground" : "border-2 border-foreground"}`} />
        ))}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-foreground" />Clear</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-2 border-foreground" />Virtual</span>
      </div>
    </div>
  );
}

function FeesPreview() {
  return (
    <dl className="grid w-full max-w-60 gap-2.5 text-sm">
      {[["Fee", "w-1/2"], ["Stipend", "w-3/4"], ["Bond", "w-1/3"]].map(([label, w]) => (
        <div key={label} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd><span className={`block h-2.5 rounded-full bg-foreground ${w}`} /></dd>
        </div>
      ))}
    </dl>
  );
}

function SchedulePreview() {
  const steps = [{ label: "Registration", state: "done" }, { label: "Choice filling", state: "now" }, { label: "Result", state: "next" }, { label: "Reporting", state: "next" }];
  return (
    <ol className="grid gap-2.5 text-sm">
      {steps.map((s) => (
        <li key={s.label} className={`flex items-center gap-2.5 ${s.state === "next" ? "text-muted-foreground" : "font-semibold"}`}>
          <span className={`grid size-5 place-items-center rounded-full ${s.state === "done" ? "bg-primary text-primary-foreground" : s.state === "now" ? "border-2 border-foreground" : "border border-border"}`}>
            {s.state === "done" && <Check className="size-3" strokeWidth={3} />}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

const tools = [
  { title: "Residents by hospital", body: "The residents at each hospital, by course and batch.", has: ["Name", "Course", "Batch", "2025 AIR"], href: "/decide/institutes", preview: <ResidentsPreview /> },
  { title: "Options for your rank", body: "Every college and course where your rank got in before.", has: ["Closing ranks", "Every round", "Quota", "Category"], href: "/decide/options", preview: <OptionsPreview /> },
  { title: "Choice list", body: "Put your choices in order and copy them into MCC as they are.", has: ["Reorder", "Copy in MCC order", "CSV", "Print"], href: "/decide/choices", preview: <ChoicesPreview /> },
  { title: "Seats", body: "This round's seats at each college, by quota and category.", has: ["Clear vacancy", "Virtual vacancy", "Quota", "Category"], href: "/decide/seats", preview: <SeatsPreview /> },
  { title: "Fees, stipend and bond", body: "As each college published them, with the source document.", has: ["Course fee", "Stipend", "Bond", "Seat-leaving penalty"], href: "/decide/fees", preview: <FeesPreview /> },
  { title: "Schedule and notices", body: "MCC's dates and notices for the current round.", has: ["Round status", "Dates", "Official notices"], href: "/decide/counselling", preview: <SchedulePreview /> },
];

export function Tools() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <li key={t.href}>
          <Link href={t.href} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground">
            <div aria-hidden className="chart-paper flex h-44 items-center justify-center border-b border-border bg-background px-6">{t.preview}</div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-lg font-bold underline-offset-4 group-hover:underline">{t.title}</h3>
              <p className="mt-1 text-muted-foreground">{t.body}</p>
              <ul aria-label={`In ${t.title}`} className="mt-4 flex flex-wrap gap-1.5">
                {t.has.map((h) => <li key={h} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{h}</li>)}
              </ul>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
