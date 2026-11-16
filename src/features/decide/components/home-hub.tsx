import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Calculator, GitCompareArrows, IndianRupee, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp } from "lucide-react";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { PLANS } from "@/features/payments/plans";
import { freeNow, shortDate } from "@/features/plans/plans";
import { formatPaise, REFERRAL_PERCENT } from "@/features/referrals/lib";
import type { DecideLinks } from "../lib/links";

// The planner's home, in Seatora's own look (the logo's ink, cyan and green; a faint pixel grid): the Residents card first,
// then every tool as a row with what it answers. The Season Pass card: ~~₹499~~ ₹0 while FREE_FOR_ALL_UNTIL is ahead, then ~~₹499~~ ₹199.

const groups = [
  {
    title: "Plan your round",
    tools: [
      { href: "/decide/options", label: "Options", note: "Where your rank got in before", icon: SlidersHorizontal },
      { href: "/decide/seats", label: "Seats", note: "Round 2 clear, virtual and new seats", icon: LayoutGrid },
      { href: "/decide/choices", label: "Choice list", note: "Order it, copy it into MCC", icon: ListOrdered },
      { href: "/decide/compare", label: "Compare", note: "Up to 4 side by side", icon: GitCompareArrows },
    ],
  },
  {
    title: "Research",
    tools: [
      { href: "/decide/fees", label: "Fees & bond", note: "Fee, stipend, bond, penalties", icon: IndianRupee },
      { href: "/decide/last-ranks", label: "Last ranks", note: "Closing ranks, newest year first", icon: TrendingUp },
      { href: "/decide/allotments", label: "Allotments", note: "Who got which seat, by rank", icon: Table2 },
      { href: "/decide/institutes", label: "Institutes", note: "Every college, type and beds", icon: Building2 },
      { href: "/decide/rank-scan", label: "Rank scan", note: "Seats around your rank", icon: ScanSearch },
      { href: "/decide/counselling", label: "Schedule", note: "MCC dates and notices", icon: CalendarDays },
      { href: "/decide/rank-tools", label: "Score & rank", note: "Score to rank, merit position", icon: Calculator },
    ],
  },
] as const;

export function HomeHub({ L }: { L: DecideLinks }) {
  const free = freeNow();
  return (
    <div className="grid gap-4">
      <section aria-labelledby="residents-h" className="relative overflow-hidden rounded-xl border border-[#1f2a33] bg-[#0b0e12] text-[#f1f4f7]">
        {/* A faint pixel grid, the logo's texture. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#5ccfe6_1px,transparent_1px),linear-gradient(90deg,#5ccfe6_1px,transparent_1px)] [background-size:14px_14px]" />
        <div className="relative grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-xs tracking-[0.25em] text-[#5ccfe6]">▮ RESIDENTS · NEW</p>
            <h2 id="residents-h" className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl" style={{ color: "#f1f4f7" }}>
              Know who&apos;s already there.
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[#a3abb3]">The residents at every PG hospital, by course and year, from MCC&apos;s official admitted lists.</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {[["77K+", "residents"], ["1,800+", "hospitals"], ["2023–25", "batches"]].map(([n, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-xl font-bold text-[#5fd36f] numeric">{n} <span className="font-sans text-xs text-[#a3abb3]">{l}</span></dd>
                </div>
              ))}
            </dl>
            <Link href={L.to("/decide/residents")} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#5ccfe6] px-4 text-sm font-semibold text-[#0b0e12] hover:bg-[#7fdcef]">
              Search residents <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div data-placement="home_card" className="rounded-lg border border-dashed border-[#2b3a45] px-4 py-3 md:text-right">
            <p className="font-mono text-xs tracking-[0.25em] text-[#a3abb3]">SEASON PASS</p>
            <p className="mt-1 flex items-baseline gap-2 md:justify-end">
              <s className="text-sm text-[#6b7480]" aria-label={`Was ${formatPaise(PLANS.season_pass.wasAmount)}`}>{formatPaise(PLANS.season_pass.wasAmount)}</s>
              <span className="text-3xl font-extrabold text-[#5fd36f]">{formatPaise(free ? 0 : PLANS.season_pass.amount)}</span>
            </p>
            {free && <p className="text-xs text-[#f1f4f7]">Everything free till {shortDate(free)}</p>}
            <div className="mt-3">
              <SeasonPassButton
                className="min-h-10 rounded-md bg-[#5fd36f] px-4 text-sm font-semibold text-[#0b0e12] hover:bg-[#7fe08b]"
                noteClassName="text-[#a3abb3]"
              />
            </div>
            <Link href={L.to("/decide/refer")} className="mt-1 inline-flex min-h-10 items-center text-xs text-[#5ccfe6] underline">
              Refer a friend: {REFERRAL_PERCENT}% off for them, {REFERRAL_PERCENT}% for you
            </Link>
          </div>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="grid gap-2">
          <h2 className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">{g.title}</h2>
          <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {g.tools.map(({ href, label, note, icon: Icon }) => (
              <li key={href}>
                <Link href={L.to(href)} className="group flex min-h-12 items-center gap-2 rounded-lg border sm:gap-3 border-border bg-card px-3 py-2 hover:border-[#5ccfe6]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md sm:size-9 bg-[#0b0e12] text-[#5ccfe6]">
                    <Icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{note}</span>
                  </span>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
