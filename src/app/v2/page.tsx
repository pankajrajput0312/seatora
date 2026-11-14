import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { EcgLine } from "@/components/home-v2/ecg-line";
import { RankCard } from "@/components/home-v2/rank-card";
import { Tiles } from "@/components/home-v2/tiles";

export default function HomeV2() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-5 md:px-8">
          <Link href="/v2" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <LogoMark className="size-7" /> MEDPATH
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 text-[15px] text-muted-foreground md:flex">
            <Link href="/decide/options" className="hover:text-foreground">Planner</Link>
            <Link href="/decide/institutes" className="hover:text-foreground">Colleges</Link>
            <Link href="/#preview" className="hover:text-foreground">Residents</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden h-11 items-center rounded-full border border-foreground px-5 text-sm font-semibold sm:inline-flex">Sign in</Link>
            <Link href="/decide" className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-white hover:bg-foreground/90">Open planner</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden px-5 pt-12 pb-8 text-center md:pt-16">
          <h1 className="mx-auto max-w-5xl text-[2.75rem] leading-[1.02] font-bold tracking-[-0.03em] text-balance md:text-[4.5rem]">
            Your NEET PG rank, turned into a plan.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground md:text-xl">
            Where your rank got in before, who&apos;s there now, and the list you&apos;ll submit.
          </p>
          <div className="mt-10"><RankCard /></div>
        </section>

        <EcgLine />

        <section aria-labelledby="what" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <h2 id="what" className="max-w-2xl text-[2rem] leading-tight font-bold tracking-[-0.02em] md:text-[2.75rem]">Three things, done properly.</h2>
          <div className="mt-10"><Tiles /></div>
        </section>

        <section className="border-y border-border bg-background">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-8 text-[15px] text-muted-foreground md:px-8">
            <span>Built on <span className="font-semibold text-foreground">official MCC results</span></span>
            <span aria-hidden className="hidden h-4 w-px bg-border md:block" />
            <span><span className="font-semibold text-foreground">Every number dated</span> and sourced</span>
            <span aria-hidden className="hidden h-4 w-px bg-border md:block" />
            <span><span className="font-semibold text-foreground">History, not predictions</span></span>
          </div>
        </section>

        <section className="px-5 py-20 md:py-28">
          <div className="mx-auto grid max-w-5xl place-items-center gap-6 rounded-[2rem] bg-foreground px-6 py-16 text-center text-white md:py-20">
            <h2 className="max-w-2xl text-[2rem] leading-tight font-bold tracking-[-0.02em] text-white md:text-[3rem]">Make your choice list with a clear head.</h2>
            <Link href="/decide" className="group inline-flex h-14 items-center gap-3 rounded-full bg-white pr-2 pl-6 font-semibold text-foreground">
              Open the planner
              <span className="grid size-10 place-items-center rounded-full bg-mark text-white transition-transform group-hover:rotate-45"><ArrowUpRight className="size-5" aria-hidden /></span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:px-8">
          <span className="flex items-center gap-2 font-semibold text-foreground"><LogoMark className="size-5" /> MEDPATH</span>
          <span>Independent. Not affiliated with MCC, NBEMS or NMC.</span>
          <nav aria-label="Footer" className="flex gap-5"><Link href="/privacy" className="hover:text-foreground">Privacy</Link><Link href="/" className="hover:text-foreground">Classic home</Link></nav>
        </div>
      </footer>
    </>
  );
}
