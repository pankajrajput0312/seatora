import Link from "next/link";
import { Building2, ChevronRight, Calculator, GitCompareArrows, IndianRupee, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp } from "lucide-react";
import { activeExam } from "@/features/exams/active";
import { examShows, neetPg, type Exam } from "@/features/exams/exam";
import { authorityOf, exams, inExamWords } from "@/features/exams/registry";
import { kindName } from "../types";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { passView } from "@/features/plans/components/plan-cards";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../lib/links";

// The planner's home: the tools as tiles under the sidebar's own names, and the Residents card on top, with the Season
// Pass button ("Get free Season Pass" while FREE_FOR_ALL_UNTIL is ahead, then "Upgrade for ₹199"). The schedule is the
// status strip (round-status.tsx), not a card.

const groups = [
  {
    title: "Plan",
    hint: "Decide what to fill",
    cols: "xl:grid-cols-4",
    tools: [
      { href: "/decide/options", label: "Options", note: "Where your rank got in before", icon: SlidersHorizontal },
      { href: "/decide/seats", label: "Seats", note: "Clear, virtual and newly added seats", icon: LayoutGrid },
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

/** Plan and Research: a section label and its one-line hint, then a tile per tool (two across on phones). `E`: the exam (examInfo): only the tools it has data for. */
export function ToolGroups({ L, E = neetPg }: { L: DecideLinks; E?: Exam }) {
  // NEET MDS: no hospital beds (dental colleges).
  const note = (t: (typeof groups)[number]["tools"][number]) =>
    t.href === "/decide/institutes" && !E.has.beds ? "Every college and its type" : t.href === "/decide/seats" && kindName("clear", E.key) === "Seat position" ? `${authorityOf(E.key)}'s seat position, session by session` : inExamWords(E.key, t.note);
  return (
    <div className="grid gap-4">
      {groups.map((g) => ({ ...g, tools: g.tools.filter((t) => examShows(E, t.href)).map((t) => ({ ...t, note: note(t) })) })).map((g) => (
        <section key={g.title} aria-labelledby={`tools-${g.title}`} className="grid gap-2">
          <div>
            <h2 id={`tools-${g.title}`} className="section-label text-muted-foreground">{g.title}</h2>
            <p className="text-body text-muted-foreground">{g.hint}</p>
          </div>
          {/* Navigation tiles (the owner's call: they must read as places to go): two across on phones, a chevron on each. */}
          <ul className={cn("grid grid-cols-2 gap-2", g.cols)}>
            {g.tools.map(({ href, label, note, icon: Icon }) => (
              <li key={href}>
                <Link href={L.to(href)} className="group relative flex h-full min-h-14 items-center gap-2 rounded-xl border border-border bg-card py-2 pr-7 pl-2.5 hover:border-wash-line hover:bg-wash/40 sm:gap-3 sm:pl-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-wash text-sky sm:size-9">
                    <Icon className="size-4 sm:size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-semibold text-foreground sm:text-title">{label}</span>
                    <span className="line-clamp-2 text-caption text-muted-foreground sm:text-body">{note}</span>
                  </span>
                  <ChevronRight className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sky" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The Residents card, one row: what it is, then its two actions, the Season Pass button (SeasonPassButton: the price, her
 * invite or coupon, the free claim while the free period lasts; an upgrade_click at home_card) and "Search residents",
 * stacked on phones. With a pass (or staff), a small line says so in place of the button.
 */
export async function ResidentsPromo({ L }: { L: DecideLinks }) {
  if (!exams[await activeExam()].has.residents) return null;
  const { got } = await passView(); // what the plan cards say: her pass, or nothing to say
  // The feature the owner leads with: a plain sheet, its figures in the accent. The Season Pass is the primary
  // action; with a pass (or staff) Search residents takes that place.
  return (
    <section aria-labelledby="residents-h" data-placement="home_card" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-x-2">
          <h2 id="residents-h" className="text-title font-semibold">Know who&apos;s already there</h2>
          <span className="rounded-full border border-current px-1.5 text-caption font-semibold text-sky">New</span>
        </div>
        <p className="text-body text-muted-foreground">
          <span className="font-semibold text-sky">77K+</span> residents at <span className="font-semibold text-sky">1,800+</span> PG hospitals, by course and year: MCC&apos;s official admitted lists, 2023–25.
        </p>
        {got && <p className="mt-1 text-caption font-semibold text-leaf">{got}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
        {!got && (
          <SeasonPassButton
            freeLabel="Get free Season Pass"
            className="min-h-11 rounded-md bg-primary px-4 text-body font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 max-sm:w-full"
            noteClassName="text-muted-foreground"
          />
        )}
        <Link href={L.to("/decide/residents")} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-body font-semibold shadow-xs max-sm:w-full", got ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-edge bg-card text-sky hover:border-sky")}>
          Search residents
        </Link>
      </div>
    </section>
  );
}
