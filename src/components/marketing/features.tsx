import {
  Bell, Building2, ClipboardList, GitCompareArrows, IndianRupee, LayoutGrid, MessagesSquare, TrendingUp,
} from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "./section-heading";

const problems = [
  { title: "Cutoffs in scattered PDFs", body: "Round-wise allotments from MCC and every state, in different formats, every year." },
  { title: "Fees and bonds out of date", body: "Stipends, bond penalties and fee hikes are rarely dated or easy to find." },
  { title: "Residency life in group chats", body: "Patient load, duty hours and teaching quality live in forwarded messages." },
];

const modules = [
  { icon: Building2, title: "Institutes", body: "Every PG college with type, location, specialties, beds and infrastructure." },
  { icon: TrendingUp, title: "Previous-year ranks", body: "Opening and closing ranks by round, quota and category, with trends." },
  { icon: LayoutGrid, title: "Seat matrix", body: "Seats per specialty, quota and category for each counselling year." },
  { icon: IndianRupee, title: "Fees, stipend, bond", body: "Tuition, monthly stipend and service-bond terms, all dated and sourced." },
  { icon: MessagesSquare, title: "Resident experiences", body: "Academics, clinical exposure, faculty, workload and hostel, clearly labelled." },
  { icon: GitCompareArrows, title: "Compare", body: "Put colleges side by side for the specialty you actually want." },
  { icon: ClipboardList, title: "Shortlist & choice filling", body: "Build and reorder your choice list from your rank and preferences." },
  { icon: Bell, title: "Counselling tracker", body: "Registration, choice filling and result dates across MCC and state rounds." },
];

export function Features() {
  return (
    <>
      <section className="border-b border-border">
        <Container className="grid gap-px overflow-hidden py-0 md:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="border-t border-border py-10 first:border-t-0 md:border-t-0 md:px-8 md:first:pl-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-border">
              <h3 className="text-base font-medium">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </Container>
      </section>

      <section id="features" className="scroll-mt-16 border-b border-border">
        <Container className="py-20 md:py-28">
          <SectionHeading eyebrow="Everything inside" title="Everything you need for counselling, in one place.">
            Stop switching between forty tabs. MEDPATH puts the research behind every choice in one place.
          </SectionHeading>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted">
                <Icon className="size-5 text-sky" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-5 text-base font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
