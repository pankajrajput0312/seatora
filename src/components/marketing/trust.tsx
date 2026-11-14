import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "./section-heading";

const principles = [
  { title: "Every number has a source", body: "Ranks, seats and fees link to the official document they came from, with the date it was last checked." },
  { title: "History, not predictions", body: "We show what closed in previous rounds. We never promise a seat or invent a \"chance %\"." },
  { title: "Missing means missing", body: "If we don't have a figure, you'll see a dash, never a guess dressed up as data." },
  { title: "Names from official lists", body: "Residents' names come only from MCC's admitted-candidates lists. No contact details are held." },
];

const tiers = [
  { label: "Official", tone: "success", note: "MCC, NBEMS, NMC, state DME notices" },
  { label: "Verified institutional", tone: "info", note: "College documents we've confirmed" },
] as const;

const residentFields = ["Name", "Course", "Year", "2025 All India Rank"];

export function Trust() {
  return (
    <section id="data" className="scroll-mt-16 border-b border-border">
      <Container className="grid gap-16 py-20 md:py-28 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="Data you can trust" title="Your career decision deserves sourced data.">
            Counselling choices are hard to undo. So Seatora is strict about where every figure comes from.
          </SectionHeading>
          <dl className="mt-10 grid gap-6 sm:grid-cols-2">
            {principles.map((p) => (
              <div key={p.title}>
                <dt className="text-sm font-medium">{p.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 self-start">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Every record is labelled</p>
            <ul className="mt-5 grid gap-3">
              {tiers.map((t) => (
                <li key={t.label} className="flex items-center justify-between gap-4 text-sm">
                  <Badge tone={t.tone}>{t.label}</Badge>
                  <span className="text-right text-muted-foreground">{t.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Residents at each college</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {residentFields.map((c) => (
                <li key={c} className="rounded-md border border-input bg-secondary px-2.5 py-1 text-xs">{c}</li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              From MCC&apos;s official admitted-candidates lists. No contact details, and a name is hidden if that person asks.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
