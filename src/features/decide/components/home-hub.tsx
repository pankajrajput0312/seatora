import Link from "next/link";
import { ArrowRight, Building2, Calculator, GitCompareArrows, IndianRupee, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp } from "lucide-react";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { PLANS } from "@/features/payments/plans";
import { limitLine, passView } from "@/features/plans/components/plan-cards";
import { freeNow, inviteLine, planLimits, shortDate } from "@/features/plans/plans";
import { formatPaise, REFERRAL_PERCENT } from "@/features/referrals/lib";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../lib/links";

// The planner's home, in Seatora's own look (the logo's ink, cyan and green): the tools as cards under the sidebar's own
// names, and the Residents card (above the tools until her rank is set, then below them). The Season Pass box in it:
// ~~₹499~~ ₹0 and "Get free Season Pass" while FREE_FOR_ALL_UNTIL is ahead, then ~~₹499~~ ₹199. The schedule is the
// status strip above (round-status.tsx), not a card.

const groups = [
  {
    title: "Plan",
    hint: "Decide what to fill",
    cols: "xl:grid-cols-4",
    tools: [
      { href: "/decide/options", label: "Options", note: "Where your rank got in before", icon: SlidersHorizontal },
      { href: "/decide/seats", label: "Seats", note: "Clear, virtual and new seats", icon: LayoutGrid },
      { href: "/decide/choices", label: "Choice list", note: "Order it, copy it into MCC", icon: ListOrdered },
      { href: "/decide/compare", label: "Compare", note: "Up to 4 side by side", icon: GitCompareArrows },
    ],
  },
  {
    title: "Research",
    hint: "Look up past data",
    cols: "lg:grid-cols-3",
    tools: [
      { href: "/decide/fees", label: "Fees & bond", note: "Fee, stipend, bond, penalties", icon: IndianRupee },
      { href: "/decide/last-ranks", label: "Last ranks", note: "Closing ranks, newest year first", icon: TrendingUp },
      { href: "/decide/allotments", label: "Allotments", note: "Who got which seat, by rank", icon: Table2 },
      { href: "/decide/institutes", label: "Institutes", note: "Every college, type and beds", icon: Building2 },
      { href: "/decide/rank-scan", label: "Rank scan", note: "Seats around your rank", icon: ScanSearch },
      { href: "/decide/rank-tools", label: "Score & rank", note: "Score to rank, merit position", icon: Calculator },
    ],
  },
] as const;

/** Plan and Research: a section label and its one-line hint, then a card per tool (one column on phones). */
export function ToolGroups({ L }: { L: DecideLinks }) {
  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`tools-${g.title}`} className="grid gap-2">
          <div>
            <h2 id={`tools-${g.title}`} className="section-label text-muted-foreground">{g.title}</h2>
            <p className="text-body text-muted-foreground">{g.hint}</p>
          </div>
          <ul className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", g.cols)}>
            {g.tools.map(({ href, label, note, icon: Icon }) => (
              <li key={href}>
                <Link href={L.to(href)} className="group flex h-full min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-[#5ccfe6]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#0b0e12] text-[#5ccfe6]">
                    <Icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-title font-semibold text-foreground">{label}</span>
                    <span className="line-clamp-2 text-body text-muted-foreground">{note}</span>
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

/** The Residents card, compact, with the Season Pass box beside it (under it on phones). */
export async function ResidentsPromo({ L }: { L: DecideLinks }) {
  const free = freeNow();
  const { state, got, invite } = await passView(); // what the plan cards say: her pass, or her invite's price
  const list = PLANS.season_pass.amount;
  // What the Free plan keeps once the free period ends: not said to a paid pass or staff, whom it doesn't concern.
  const keeps = planLimits("FREE");
  const after = free && state !== "pass" && state !== "staff" && `Free until ${shortDate(free)}. After that: ${limitLine("institutes", keeps.institutes).replace(/ a day$/, "")} and ${limitLine("residents", keeps.residents)}.`;
  return (
    <section aria-labelledby="residents-h" className="rounded-xl border border-[#1f2a33] bg-[#0b0e12] text-[#f1f4f7]">
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="flex items-center gap-2 text-[#5ccfe6]">
            <span className="section-label">Residents</span>
            <span className="rounded-full border border-current px-1.5 text-caption font-semibold">New</span>
          </p>
          <h2 id="residents-h" className="mt-1 text-h2 font-semibold" style={{ color: "#f1f4f7" }}>Know who&apos;s already there.</h2>
          <p className="mt-1 max-w-xl text-body text-[#a3abb3]">The residents at every PG hospital, by course and year.</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {[["77K+", "residents"], ["1,800+", "hospitals"], ["2023–25", "batches"]].map(([n, l]) => (
              // The number reads first on screen; the term (dt) comes first in the markup, as a <dl> needs.
              <div key={l} className="flex flex-row-reverse items-baseline justify-end gap-1.5">
                <dt className="text-caption text-[#a3abb3]">{l}</dt>
                <dd className="font-mono text-lg font-semibold text-[#5fd36f]">{n}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-caption text-[#a3abb3]">From MCC&apos;s official admitted lists, 2023–25.</p>
          <Link href={L.to("/decide/residents")} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#5ccfe6] px-4 text-body font-semibold text-[#0b0e12] hover:bg-[#7fdcef]">
            Search residents <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div data-placement="home_card" className="rounded-lg border border-dashed border-[#2b3a45] px-4 py-3 md:max-w-72">
          <p className="section-label text-[#a3abb3]">Season Pass</p>
          {got ? (
            <p className="mt-1 font-mono text-body font-bold text-[#5fd36f]">{got}</p>
          ) : free ? (
            // As the plan card: ₹0 now, never a struck "was" price beside it.
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-h2 font-bold text-[#5fd36f]">₹0</span>
              <span className="text-caption text-[#a3abb3]">now</span>
            </p>
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <s className="font-mono text-body text-[#6b7480]" aria-label={`Was ${formatPaise(PLANS.season_pass.wasAmount)}`}>{formatPaise(PLANS.season_pass.wasAmount)}</s>
              <span className="font-mono text-h2 font-bold text-[#5fd36f]">{formatPaise(invite?.amount ?? list)}</span>
              {invite && <span className="text-caption text-[#f1f4f7]">with {invite.name}&apos;s invite</span>}
            </p>
          )}
          {free && state !== "pass" && state !== "staff" && (
            <p className="text-caption text-[#f1f4f7]">{invite ? inviteLine(invite.name, invite.amount, list, free) : `Then ${formatPaise(list)} once.`}</p>
          )}
          {after && <p className="text-caption text-[#f1f4f7]">{after}</p>}
          <div className="mt-3">
            <SeasonPassButton
              freeLabel="Get free Season Pass"
              className="min-h-11 rounded-md bg-[#5fd36f] px-4 text-body font-semibold text-[#0b0e12] hover:bg-[#7fe08b]"
              noteClassName="text-[#a3abb3]"
            />
          </div>
          {/* The referral line only once there is a price to take 20% off. */}
          {!free && (
            <Link href={L.to("/decide/refer")} className="mt-1 inline-flex min-h-11 items-center text-caption text-[#5ccfe6] underline">
              Refer a friend: {REFERRAL_PERCENT}% off for them, {REFERRAL_PERCENT}% for you
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
