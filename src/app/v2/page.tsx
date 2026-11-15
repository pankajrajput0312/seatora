import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { legalLinks } from "@/components/layout/site-footer";
import { EcgLine } from "@/components/home-v2/ecg-line";
import { RankCard } from "@/components/home-v2/rank-card";
import { Roster } from "@/components/home-v2/roster";
import { ThemeToggle } from "@/components/home-v2/theme-toggle";
import { Tools } from "@/components/home-v2/tools";

const nav = [
  { label: "Residents", href: "#residents" },
  { label: "Plan", href: "#plan" },
  { label: "Tools", href: "#tools" },
  { label: "FAQ", href: "#faq" },
];

const faqs = [
  { q: "Where do the residents' names come from?", a: "From MCC's admitted-candidates lists for 2023 to 2025. Seatora holds no contact details, and hides a name if that person asks." },
  { q: "Who can see the names?", a: "Only signed-in accounts with access. Public pages, like this one, never show them." },
  { q: "Does Seatora predict my college?", a: "No. It shows where ranks like yours were allotted in past rounds. That history isn't a promise of a seat." },
  { q: "Which counselling does it cover?", a: "MCC's All India counselling: All India quota, deemed and central universities, and DNB seats. State counselling isn't included yet." },
];

const h2 = "text-[2rem] leading-tight font-bold tracking-[-0.02em] md:text-[2.75rem]";

export default function HomeV2() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-5 md:px-8">
          <Link href="/v2" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <LogoMark className="size-7 [&_path]:fill-foreground" /> Seatora
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 text-[15px] text-muted-foreground md:flex">
            {nav.map((n) => <a key={n.href} href={n.href} className="hover:text-foreground">{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="hidden h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:border-foreground sm:inline-flex">Sign in</Link>
            <Link href="/decide" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open planner</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section id="residents" className="chart-paper scroll-mt-18 border-b border-border px-5 pt-14 pb-16 md:pt-20 md:pb-20">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance md:text-[4rem]">
              Choose your PG seat knowing who&apos;s already there.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl">
              See the residents at any hospital by course and batch, check where your rank got in before, and build your MCC choice list.
            </p>
            <form action="/decide/institutes" className="mx-auto mt-9 flex max-w-xl items-center gap-2 rounded-full border border-input bg-card p-1.5 pl-4 shadow-overlay has-focus-visible:border-foreground">
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <label htmlFor="v2-q" className="sr-only">Hospital or state</label>
              <input id="v2-q" name="q" placeholder="Hospital or state" autoComplete="off" className="h-11 min-w-0 flex-1 bg-transparent text-base focus:outline-none" />
              <button type="submit" className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Search<span className="hidden sm:inline"> hospitals</span></button>
            </form>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Or <a href="#plan" className="font-semibold text-foreground underline underline-offset-4 hover:decoration-2">start with your rank</a>
            </p>
          </div>
          <div className="mt-14"><Roster /></div>
        </section>

        <EcgLine />

        <section id="plan" className="mx-auto grid max-w-7xl scroll-mt-18 items-center gap-10 px-5 pt-8 pb-20 md:grid-cols-[0.9fr_1.1fr] md:gap-16 md:px-8 md:pb-28">
          <div>
            <h2 className={h2}>Start with your rank.</h2>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              Enter your All India Rank and category. Seatora lists every college and course where that rank was allotted in MCC&apos;s past rounds.
            </p>
            <p className="mt-3 max-w-md text-[15px] text-muted-foreground">Past closing ranks are history, not a promise of a seat.</p>
          </div>
          <RankCard />
        </section>

        <section id="tools" aria-labelledby="tools-h" className="scroll-mt-18 border-y border-border bg-background">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
            <h2 id="tools-h" className={`max-w-2xl ${h2}`}>What&apos;s inside the planner.</h2>
            <p className="mt-3 text-[15px] text-muted-foreground">Previews are illustrations, not data.</p>
            <div className="mt-10"><Tools /></div>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-h" className="mx-auto grid max-w-7xl scroll-mt-18 gap-8 px-5 py-20 md:grid-cols-[0.9fr_1.1fr] md:gap-16 md:px-8 md:py-28">
          <h2 id="faq-h" className={h2}>Questions doctors ask.</h2>
          <div className="border-t border-border">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-border">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="max-w-prose pb-5 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-5 pb-20 md:pb-28">
          <div className="mx-auto grid max-w-5xl place-items-center gap-7 rounded-2xl bg-primary px-6 py-16 text-center md:py-20">
            <h2 className="max-w-2xl text-[2rem] leading-tight font-bold tracking-[-0.02em] text-primary-foreground md:text-[3rem]">Make your choice list with a clear head.</h2>
            <Link href="/decide" className="inline-flex h-12 items-center rounded-full bg-primary-foreground px-6 font-semibold text-primary hover:bg-primary-foreground/90">Open the planner</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:px-8">
          <span className="flex items-center gap-2 font-semibold text-foreground"><LogoMark className="size-5 [&_path]:fill-foreground" /> Seatora</span>
          <span>Independent. Not affiliated with MCC, NBEMS or NMC.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
            {[...legalLinks, { label: "Classic home", href: "/" }].map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center hover:text-foreground">{l.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}
