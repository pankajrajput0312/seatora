import { CalendarDays, FileText, LayoutGrid, Scale } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "./section-heading";

const routes = [
  {
    title: "All India counselling",
    authority: "Medical Counselling Committee (MCC)",
    status: { label: "First at launch", tone: "info" as const },
    seats: [
      "All India Quota: 50% of seats in state government colleges",
      "Deemed universities: all seats",
      "Central universities and institutes",
      "DNB post-MBBS seats",
    ],
  },
  {
    title: "State counselling",
    authority: "Each state's DME, DMER or designated authority",
    status: { label: "Added state by state", tone: "warning" as const },
    seats: [
      "State quota: the other 50% in government colleges",
      "Private colleges: government and management quota seats",
      "Domicile, in-service and bond rules that differ by state",
      "Separate rounds and dates from MCC",
    ],
  },
];

const perRoute = [
  { icon: CalendarDays, title: "Schedules & dates", body: "Registration, choice filling, results and reporting deadlines." },
  { icon: Scale, title: "Rules & eligibility", body: "Who can apply, reservation rules and required documents." },
  { icon: LayoutGrid, title: "Seats & allotments", body: "Seat matrices and previous closing ranks by round and quota." },
  { icon: FileText, title: "Notices", body: "Official notices, each linked to its source." },
];

export function Coverage() {
  return (
    <section id="coverage" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="Coverage" title="Every counselling route in one planner.">
          MCC and state counselling run separately, with their own quotas, rules and dates. MEDPATH keeps them side by side,
          so you don&apos;t miss a route you&apos;re eligible for.
        </SectionHeading>

        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {routes.map((r) => (
            <div key={r.title} className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium">{r.title}</h3>
                  <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.authority}</p>
                </div>
                <Badge tone={r.status.tone}>{r.status.label}</Badge>
              </div>
              <ul className="mt-6 grid gap-3 text-sm">
                {r.seats.map((s) => (
                  <li key={s} className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 bg-sky" aria-hidden />
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <ul className="mt-3 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {perRoute.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-background p-5">
              <Icon className="size-5 text-sky" strokeWidth={1.75} aria-hidden />
              <p className="mt-4 text-sm font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">For each route, MEDPATH tracks the above as the counselling authority publishes it.</p>
      </Container>
    </section>
  );
}
