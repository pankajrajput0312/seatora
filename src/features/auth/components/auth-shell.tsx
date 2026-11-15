import { Container } from "@/components/layout/container";
import { CyclingBubble } from "@/components/marketing/cycling-bubble";
import { PixelEmblem } from "@/components/marketing/pixel-emblem";

const queries = ["AIQ rank 12,450 · OBC · MD Medicine", "stipend vs bond in my state?", "R2 closing ranks for radiology", "compare two GMCs for paediatrics"];
const statuses = ["comparing previous-year rounds", "checking the seat matrix", "reading resident experiences", "sorting your shortlist"];

export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[radial-gradient(ellipse_at_top_right,var(--color-muted),transparent_60%)]">
      <Container className="grid items-center gap-12 py-6 sm:py-12 md:py-16 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-2">
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <PixelEmblem className="bob mb-8 hidden w-20 sm:block lg:hidden" animated />{/* phones: the form comes first */}
          <p className="font-mono text-xs uppercase tracking-widest text-sky">{eyebrow}</p>
          <h1 className="glow mt-4 font-pixel text-4xl leading-none tracking-tight md:text-5xl">{title}</h1>
          <div className="mt-6 flex flex-col sm:mt-8">{children}</div>
        </div>

        <div className="relative mx-auto hidden w-full max-w-md py-12 lg:block" aria-hidden>
          <CyclingBubble
            messages={queries}
            className="absolute top-0 left-0 z-10 rounded-full border border-input bg-secondary px-4 py-2 text-sm shadow-overlay"
          />
          <PixelEmblem className="bob mx-auto w-4/5" animated />
          <div className="absolute right-0 bottom-0 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-overlay">
            <span className="size-1.5 animate-pulse rounded-full bg-sky" />
            <CyclingBubble messages={statuses} interval={3400} />
          </div>
        </div>
      </Container>
    </section>
  );
}
